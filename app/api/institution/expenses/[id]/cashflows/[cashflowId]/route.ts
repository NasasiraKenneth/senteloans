import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import {
  auditCashflowUpdate,
  auditExpenseUpdate,
  cashflowSnapshot,
  expenseSnapshot,
} from "@/lib/audit/expense-audit"
import { insertTransactionInsertAuditLog } from "@/lib/audit/transaction-insert-audit"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

function singleExpenseWhere(actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>, expenseId: string): { where: string; values: unknown[] } {
  let where = `e.id = $1::uuid AND e.institution_id = $2::uuid`
  const values: unknown[] = [expenseId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND e.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

function normalizeCashflowStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

function normalizeExpenseStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

/** When a cashflow row is not pending (shared by PATCH status + PUT edit). */
function cashflowNonPendingError(currentNorm: string): { error: string; message: string } {
  if (currentNorm === "completed") {
    return {
      error: "cashflow_already_completed",
      message: "This cashflow has already been completed and cannot be edited.",
    }
  }
  if (currentNorm === "rejected") {
    return {
      error: "cashflow_already_rejected",
      message: "This cashflow has already been rejected and cannot be edited.",
    }
  }
  return {
    error: "cashflow_not_editable",
    message: "This cashflow cannot be edited because it is not pending.",
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; cashflowId: string }> },
) {
  const apiPath = getApiPath(req)
  const { id: expenseId, cashflowId } = await params
  if (!expenseId || !cashflowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const nextRaw = String(body.status ?? "").trim().toLowerCase()
  if (nextRaw !== "completed" && nextRaw !== "rejected") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }
  const nextLabel = nextRaw === "completed" ? "Completed" : "Rejected"

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.patch.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_cashflow_status")
      if (!allowed) return { error: "missing_permission:edit_cashflow_status" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const ex = await client.query(
        `SELECT e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM senteloans_expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expenseRow = ex.rows[0] as Record<string, unknown> | undefined
      if (!expenseRow) return { error: "not_found" as const }
      const expenseBranchId = String(expenseRow.branch_id || "")
      const oldExpenseSnapshot = expenseSnapshot(expenseRow)
      const expenseStatusNorm = normalizeExpenseStatus(String(expenseRow.status || ""))
      if (expenseStatusNorm !== "approved" && expenseStatusNorm !== "active") {
        return {
          error: "expense_not_approved_or_active" as const,
          message:
            "Cashflow status can only be changed when the expense is approved or active." as const,
        }
      }

      await client.query("BEGIN")
      let committed = false
      try {
        const lockRes = await client.query<{
          id: string
          expense_id: string
          status: string
          amount: string | number
          description: string | null
          date: string | null
          payment_method: string | null
          client_id: string | null
          staff_id: string | null
          transaction_id: string | null
          completed_by: string | null
          completed_at: string | null
          expense_number: string
          branch_id: string
          institution_id: string
        }>(
          `SELECT cf.id, cf.expense_id, cf.status, cf.amount, cf.description, cf.date::text AS date,
                  cf.payment_method::text AS payment_method, cf.client_id, cf.staff_id, cf.transaction_id,
                  cf.completed_by, cf.completed_at, e.expense_number, e.branch_id, e.institution_id
           FROM senteloans_expense_cashflows cf
           JOIN senteloans_expenses e ON e.id = cf.expense_id
           WHERE cf.id = $1::uuid AND cf.expense_id = $2::uuid
           FOR UPDATE OF cf`,
          [cashflowId, expenseId],
        )
        const cf = lockRes.rows[0]
        if (!cf) {
          return { error: "cashflow_not_found" as const }
        }
        const oldCashflow = cashflowSnapshot(cf as unknown as Record<string, unknown>)
        const current = normalizeCashflowStatus(String(cf.status || ""))
        if (current !== "pending") {
          return cashflowNonPendingError(current)
        }

        let priorCompletedCashflowCount = 0
        if (nextRaw === "completed") {
          const cnt = await client.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c
             FROM senteloans_expense_cashflows
             WHERE expense_id = $1::uuid
               AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'paid')`,
            [expenseId],
          )
          priorCompletedCashflowCount = Number(cnt.rows[0]?.c ?? 0)
        }

        const nameRes = await client.query(`SELECT full_name FROM senteloans_users WHERE id = $1::uuid LIMIT 1`, [actor.id])
        const completed_by_name =
          nameRes.rows[0]?.full_name != null ? String(nameRes.rows[0].full_name).trim() : null

        if (nextRaw === "rejected") {
          const upd = await client.query(
            `UPDATE senteloans_expense_cashflows
             SET status = $1,
                 completed_by = $2::uuid,
                 completed_at = NOW()
             WHERE id = $3::uuid AND expense_id = $4::uuid
             RETURNING id, expense_id, status, amount, description, date::text AS date,
                       payment_method::text AS payment_method, staff_id, client_id, transaction_id,
                       completed_by, completed_at`,
            [nextLabel, actor.id, cashflowId, expenseId],
          )
          const out = upd.rows[0] as Record<string, unknown> | undefined
          if (!out) {
            return { error: "update_failed" as const }
          }
          await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), expenseBranchId)
          await client.query("COMMIT")
          committed = true
          return {
            cashflow: {
              id: String(out.id),
              status: String(out.status || nextLabel),
              completed_at: out.completed_at != null ? String(out.completed_at) : null,
              completed_by: out.completed_by != null ? String(out.completed_by) : actor.id,
              completed_by_name,
            },
          }
        }

        const expenseNumber = String(cf.expense_number || "").trim() || String(expenseId).slice(0, 8)
        const descTrim = cf.description != null ? String(cf.description).trim() : ""
        const description = descTrim || `Expense payment - ${expenseNumber}`

        const dateStr = cf.date != null ? String(cf.date).trim() : ""
        const txDate =
          dateStr.length >= 10
            ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`).toISOString()
            : new Date().toISOString()

        const modeRaw = cf.payment_method != null ? String(cf.payment_method).trim() : ""
        const mode = (PAYMENT_MODES as readonly string[]).includes(modeRaw) ? modeRaw : "Cash"

        const cid = cf.client_id != null ? String(cf.client_id) : null
        const sid = cf.staff_id != null ? String(cf.staff_id) : null
        if (!cid && !sid) {
          return { error: "cashflow_assignee_missing" as const }
        }
        const instId = String(cf.institution_id)
        const branchId = String(cf.branch_id)

        const inserted = await insertWithTransactionNumberRetry(
          (transaction_number) =>
            client.query<{ id: string }>(
              `INSERT INTO senteloans_transactions (
                 institution_id, branch_id, member_id, client_id, staff_id, account_id, transferred_to_id, loan_id, sacco_loan_id,
                 transaction_number, type, amount, mode, description, reference_number,
                 balance_before, balance_after, processed_by, transaction_date, status
               ) VALUES (
                 $1::uuid, $2::uuid, NULL, $3::uuid, $4::uuid, NULL, NULL, NULL, NULL,
                 $5, 'Expense Payment', $6, $7::payment_mode, $8, $9,
                 NULL, NULL, $10::uuid, $11::timestamptz, 'Completed'
               ) RETURNING id`,
              [
                instId,
                branchId,
                cid,
                sid,
                transaction_number,
                Number(cf.amount || 0),
                mode,
                description,
                transaction_number,
                actor.id,
                txDate,
              ],
            ),
          { prefix: "TXN", client },
        )

        if (!inserted) {
          return { error: "transaction_insert_failed" as const }
        }

        const { row: txRow, transactionNumber } = inserted

        await insertTransactionInsertAuditLog(client, {
          institutionId: instId,
          branchId,
          userId: actor.id,
          transactionId: txRow.id,
          newValues: {
            transaction_number: transactionNumber,
            type: "Expense Payment",
            amount: Number(cf.amount || 0),
            client_id: cid,
            staff_id: sid,
            expense_cashflow_id: cashflowId,
            expense_id: expenseId,
          },
        })

        const upd = await client.query(
          `UPDATE senteloans_expense_cashflows
           SET status = $1,
               completed_by = $2::uuid,
               completed_at = NOW(),
               transaction_id = $3::uuid
           WHERE id = $4::uuid AND expense_id = $5::uuid
           RETURNING id, expense_id, status, amount, description, date::text AS date,
                     payment_method::text AS payment_method, staff_id, client_id, transaction_id,
                     completed_by, completed_at`,
          [nextLabel, actor.id, txRow.id, cashflowId, expenseId],
        )
        const out = upd.rows[0] as Record<string, unknown> | undefined
        if (!out) {
          return { error: "update_failed" as const }
        }
        await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), expenseBranchId)

        if (priorCompletedCashflowCount === 0) {
          const expUpd = await client.query(
            `UPDATE senteloans_expenses e
             SET status = 'Active', updated_at = NOW()
             WHERE e.id = $1::uuid
               AND e.institution_id = $2::uuid
               AND LOWER(TRIM(COALESCE(e.status::text, ''))) = 'approved'
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at`,
            [expenseId, actor.institution_id],
          )
          const newExpRow = expUpd.rows[0] as Record<string, unknown> | undefined
          if (newExpRow) {
            await auditExpenseUpdate(
              client,
              actor,
              expenseId,
              oldExpenseSnapshot,
              expenseSnapshot(newExpRow),
              expenseBranchId,
            )
          }
        }

        await client.query("COMMIT")
        committed = true

        return {
          cashflow: {
            id: String(out.id),
            status: String(out.status || nextLabel),
            completed_at: out.completed_at != null ? String(out.completed_at) : null,
            completed_by: out.completed_by != null ? String(out.completed_by) : actor.id,
            completed_by_name,
            transaction_id: txRow.id,
          },
          transaction: { id: txRow.id, transaction_number: transactionNumber },
          expense_status:
            priorCompletedCashflowCount === 0 && expenseStatusNorm === "approved" ? ("Active" as const) : undefined,
        }
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:edit_cashflow_status" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "cashflow_not_found" ? 404
        : code === "expense_not_approved_or_active" ? 409
        : code === "cashflow_already_completed" ||
            code === "cashflow_already_rejected" ||
            code === "cashflow_not_editable"
          ? 409
        : code === "cashflow_assignee_missing" ? 400
        : code === "transaction_insert_failed" ? 500
        : code === "update_failed" ? 500
        : 400
      apiLog("warn", "expenses.cashflows.patch.denied", { method: "PATCH", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.cashflows.patch.success", { method: "PATCH", apiPath, status: 200 })
    const r = result as { cashflow: unknown; transaction?: unknown; expense_status?: string }
    const payload: Record<string, unknown> = { ok: true, cashflow: r.cashflow }
    if (r.transaction) payload.transaction = r.transaction
    if (r.expense_status) payload.expense_status = r.expense_status
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; cashflowId: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId, cashflowId } = await params
  if (!expenseId || !cashflowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const assigneeRaw = String(body.assignee_type ?? body.type ?? "").trim().toLowerCase()
  const staffIdRaw = body.staff_id ?? body.staffId
  const clientIdRaw = body.client_id ?? body.clientId
  const staffId = staffIdRaw != null && String(staffIdRaw).trim() !== "" ? String(staffIdRaw).trim() : ""
  const clientId = clientIdRaw != null && String(clientIdRaw).trim() !== "" ? String(clientIdRaw).trim() : ""

  const amount = Number(body.amount ?? 0)
  const descriptionRaw = body.description
  const description =
    descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
      ? null
      : String(descriptionRaw).trim()
  const date = String(body.date ?? "").trim()
  const modeRaw = String(body.mode ?? body.payment_method ?? body.transactionMode ?? "").trim()
  const mode = modeRaw || null

  if (assigneeRaw !== "staff" && assigneeRaw !== "clients") {
    return NextResponse.json({ error: "invalid_assignee_type" }, { status: 400 })
  }
  if (assigneeRaw === "staff" && !staffId) {
    return NextResponse.json({ error: "staff_id_required" }, { status: 400 })
  }
  if (assigneeRaw === "clients" && !clientId) {
    return NextResponse.json({ error: "client_id_required" }, { status: 400 })
  }
  if (assigneeRaw === "staff" && clientId) {
    return NextResponse.json({ error: "client_id_not_allowed_for_staff_cashflow" }, { status: 400 })
  }
  if (assigneeRaw === "clients" && staffId) {
    return NextResponse.json({ error: "staff_id_not_allowed_for_client_cashflow" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 })
  }
  if (mode && !PAYMENT_MODES.includes(mode as (typeof PAYMENT_MODES)[number])) {
    return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.put.denied", { method: "PUT", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_cashflow")
      if (!allowed) return { error: "missing_permission:edit_cashflow" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const exRes = await client.query<{ id: string; branch_id: string }>(
        `SELECT e.id, e.branch_id FROM senteloans_expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = exRes.rows[0]
      if (!expense) return { error: "not_found" as const }

      const cur = await client.query(
        `SELECT id, expense_id, staff_id, client_id, payment_method::text AS payment_method, amount,
                description, status, date::text AS date, transaction_id, completed_by, completed_at
         FROM senteloans_expense_cashflows WHERE id = $1::uuid AND expense_id = $2::uuid LIMIT 1`,
        [cashflowId, expenseId],
      )
      const cfRow = cur.rows[0] as Record<string, unknown> | undefined
      if (!cfRow) return { error: "cashflow_not_found" as const }
      const oldCashflow = cashflowSnapshot(cfRow)
      const statusNorm = normalizeCashflowStatus(String(cfRow.status || ""))
      if (statusNorm !== "pending") {
        return cashflowNonPendingError(statusNorm)
      }

      const branchId = String(expense.branch_id || "")
      const instId = actor.institution_id

      if (assigneeRaw === "staff") {
        const s = await client.query(
          `SELECT u.id FROM senteloans_users u
           WHERE u.id = $1::uuid AND u.institution_id = $2::uuid AND u.branch_id = $3::uuid
           LIMIT 1`,
          [staffId, instId, branchId],
        )
        if ((s.rowCount ?? 0) === 0) return { error: "invalid_staff" as const }
      } else {
        const cWhere = isSuperAdmin(actor)
          ? `id = $1::uuid AND institution_id = $2::uuid`
          : `id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid`
        const cParams = isSuperAdmin(actor) ? [clientId, instId] : [clientId, instId, branchId]
        const c = await client.query(`SELECT id FROM senteloans_clients WHERE ${cWhere} LIMIT 1`, cParams)
        if ((c.rowCount ?? 0) === 0) return { error: "invalid_client" as const }
      }

      const upd = await client.query(
        `UPDATE senteloans_expense_cashflows
         SET staff_id = $1::uuid,
             client_id = $2::uuid,
             payment_method = $3::payment_mode,
             amount = $4,
             description = $5,
             date = $6::date
         WHERE id = $7::uuid AND expense_id = $8::uuid
         RETURNING id, expense_id, amount::float, description, status, date::text AS date,
                   payment_method::text AS payment_method, staff_id, client_id, transaction_id,
                   completed_by, completed_at`,
        [
          assigneeRaw === "staff" ? staffId : null,
          assigneeRaw === "clients" ? clientId : null,
          mode,
          amount,
          description,
          date,
          cashflowId,
          expenseId,
        ],
      )
      const out = upd.rows[0] as Record<string, unknown> | undefined
      if (!out) return { error: "update_failed" as const }

      await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), branchId)

      const sid = out.staff_id != null ? String(out.staff_id) : null
      const cid = out.client_id != null ? String(out.client_id) : null
      let assigned_type: "staff" | "client" | null = null
      if (sid) assigned_type = "staff"
      else if (cid) assigned_type = "client"

      let assigned_name: string | null = null
      if (sid) {
        const nr = await client.query(`SELECT full_name FROM senteloans_users WHERE id = $1::uuid LIMIT 1`, [sid])
        assigned_name =
          nr.rows[0]?.full_name != null ? String(nr.rows[0].full_name).trim() || "Staff" : "Staff"
      } else if (cid) {
        const nr = await client.query(`SELECT name FROM senteloans_clients WHERE id = $1::uuid LIMIT 1`, [cid])
        assigned_name = nr.rows[0]?.name != null ? String(nr.rows[0].name).trim() || "Client" : "Client"
      }

      return {
        cashflow: {
          id: String(out.id),
          amount: Number(out.amount || 0),
          description: out.description != null ? String(out.description) : null,
          status: String(out.status || "Pending"),
          date: out.date != null ? String(out.date) : null,
          payment_method: out.payment_method != null ? String(out.payment_method) : null,
          staff_id: sid,
          client_id: cid,
          assigned_type,
          assigned_name,
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:edit_cashflow" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "cashflow_not_found" ? 404
        : code === "cashflow_already_completed" ||
            code === "cashflow_already_rejected" ||
            code === "cashflow_not_editable"
          ? 409
        : code === "invalid_staff" || code === "invalid_client" ? 400
        : code === "update_failed" ? 500
        : 400
      apiLog("warn", "expenses.cashflows.put.denied", { method: "PUT", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.cashflows.put.success", { method: "PUT", apiPath, status: 200 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.put.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
