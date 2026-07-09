import { NextResponse } from "next/server"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditExpenseUpdate, expenseSnapshot } from "@/lib/audit/expense-audit"
import { hasPermission, requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseReadAccess,
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
  mapExpenseReadErrorResponse,
} from "@/lib/api/expense-access"
import { isValidExpenseType } from "@/lib/expenses/expense-types"
import { computeExpenseCashflowPaymentTotals } from "@/lib/expenses/expense-cashflow-payment-totals"
import { notifyExpenseUpdated } from "@/lib/notifications/expense-events"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.detail.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseReadAccess(client, sess.authUserId, ["view_expenses", "edit_expense"])
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
        }
      }
      const { actor } = access
      const canEditExpense = await hasPermission(client, actor, "edit_expense")

      const { where, values } = expenseScopeWhere(actor, expenseId)
      const res = await client.query(
        `SELECT
           e.id,
           e.expense_number,
           e.name,
           e.description,
           e.type,
           e.status,
           e.branch_id,
           b.name AS branch_name,
           e.created_at,
           e.updated_at,
           e.approved_at,
           u.full_name AS created_by_name
         FROM expenses e
         LEFT JOIN branches b ON b.id = e.branch_id
         JOIN users u ON u.id = e.created_by
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      const row = res.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "not_found" as const }

      const statusRaw = String(row.status || "")
      const pending = String(statusRaw).trim().toLowerCase() === "pending"
      const canEditRecord = canEditExpense && pending

      const fundingRes = await client.query(
        `SELECT id, source_type, loan_id, amount::float, created_at
         FROM expense_funding_sources
         WHERE expense_id = $1::uuid
         ORDER BY created_at DESC`,
        [expenseId],
      )
      const funding = fundingRes.rows.map((f: Record<string, unknown>) => ({
        id: String(f.id),
        source_type: String(f.source_type || ""),
        loan_id: f.loan_id != null ? String(f.loan_id) : null,
        amount: Number(f.amount || 0),
        created_at: f.created_at != null ? String(f.created_at) : "",
      }))

      const cashRes = await client.query(
        `SELECT
           cf.id,
           cf.amount::float,
           cf.description,
           cf.status,
           cf.date::text AS date,
           cf.payment_method::text AS payment_method,
           cf.created_at,
           cf.staff_id,
           cf.third_party_agent_id,
           cf.completed_by,
           cf.completed_at,
           COALESCE((
             SELECT SUM(p.amount)::float
             FROM expense_cashflows_payments p
             WHERE p.expense_cashflow_id = cf.id
           ), 0) AS paid_amount,
           su.full_name AS staff_name,
           c.name AS client_name,
           u.full_name AS completed_by_name
         FROM expense_cashflows cf
         LEFT JOIN users su ON su.id = cf.staff_id
         LEFT JOIN third_party_agents c ON c.id = cf.third_party_agent_id
         LEFT JOIN users u ON u.id = cf.completed_by
         WHERE cf.expense_id = $1::uuid
         ORDER BY cf.created_at DESC`,
        [expenseId],
      )
      const cashflows = cashRes.rows.map((cf: Record<string, unknown>) => {
        const staffId = cf.staff_id != null ? String(cf.staff_id) : null
        const thirdPartyAgentId = cf.third_party_agent_id != null ? String(cf.third_party_agent_id) : null
        const staffName = cf.staff_name != null ? String(cf.staff_name).trim() : ""
        const agentName = cf.client_name != null ? String(cf.client_name).trim() : ""
        let assigned_type: "staff" | "client" | null = null
        let assigned_name: string | null = null
        if (staffId) {
          assigned_type = "staff"
          assigned_name = staffName || "Staff"
        } else if (thirdPartyAgentId) {
          assigned_type = "client"
          assigned_name = agentName || "Third Party Agent"
        }
        return {
          id: String(cf.id),
          amount: Number(cf.amount || 0),
          description: cf.description != null ? String(cf.description) : null,
          status: String(cf.status || "Pending"),
          date: cf.date != null ? String(cf.date) : null,
          payment_method: cf.payment_method != null ? String(cf.payment_method) : null,
          created_at: cf.created_at != null ? String(cf.created_at) : "",
          staff_id: staffId,
          third_party_agent_id: thirdPartyAgentId,
          assigned_type,
          assigned_name,
          completed_by: cf.completed_by != null ? String(cf.completed_by) : null,
          completed_at: cf.completed_at != null ? String(cf.completed_at) : null,
          completed_by_name: cf.completed_by_name != null ? String(cf.completed_by_name).trim() : null,
          ...computeExpenseCashflowPaymentTotals(Number(cf.amount || 0), Number(cf.paid_amount || 0)),
        }
      })

      const cashflowIds = cashflows.map((cf) => cf.id)
      let paymentsMap: Record<
        string,
        Array<{
          id: string
          expense_cashflow_id: string
          amount: number
          payment_date: string
          transaction_number: string | null
          mode: string | null
          reference_number: string | null
          processed_by_name: string | null
        }>
      > = {}

      if (cashflowIds.length > 0) {
        const paymentsRes = await client.query<{
          id: string
          expense_cashflow_id: string
          amount: string
          payment_date: string
          transaction_number: string | null
          mode: string | null
          reference_number: string | null
          processed_by_name: string | null
        }>(
          `SELECT
             p.id,
             p.expense_cashflow_id,
             p.amount,
             COALESCE(p.created_at, p.date::timestamptz)::text AS payment_date,
             t.transaction_number,
             COALESCE(t.mode::text, p.payment_method::text) AS mode,
             t.reference_number,
             u.full_name AS processed_by_name
           FROM expense_cashflows_payments p
           LEFT JOIN transactions t ON t.id = p.transaction_id
           LEFT JOIN users u ON u.id = p.created_by
           WHERE p.expense_cashflow_id = ANY($1::uuid[])
           ORDER BY p.date ASC NULLS LAST, p.created_at ASC`,
          [cashflowIds],
        )
        paymentsMap = paymentsRes.rows.reduce<typeof paymentsMap>((acc, row) => {
          const key = String(row.expense_cashflow_id)
          if (!acc[key]) acc[key] = []
          acc[key].push({
            id: String(row.id),
            expense_cashflow_id: key,
            amount: Number(row.amount || 0),
            payment_date: String(row.payment_date || ""),
            transaction_number: row.transaction_number != null ? String(row.transaction_number) : null,
            mode: row.mode != null ? String(row.mode) : null,
            reference_number: row.reference_number != null ? String(row.reference_number) : null,
            processed_by_name: row.processed_by_name != null ? String(row.processed_by_name).trim() : null,
          })
          return acc
        }, {})
      }

      const cashflowsWithPayments = cashflows.map((cf) => ({
        ...cf,
        payments: (paymentsMap[cf.id] || []).map((p) => ({
          id: p.id,
          amount: p.amount,
          payment_date: p.payment_date,
          transaction_number: p.transaction_number,
          mode: p.mode,
          reference_number: p.reference_number,
          processed_by_name: p.processed_by_name,
        })),
      }))

      const fundingTotal = funding.reduce((s, r) => s + r.amount, 0)
      const cashflowsTotal = cashflows.reduce((s, r) => s + r.amount, 0)

      return {
        expense: {
          id: String(row.id),
          expense_number: String(row.expense_number || ""),
          name: String(row.name || ""),
          description: row.description != null ? String(row.description) : null,
          type: String(row.type || ""),
          status: statusRaw,
          branch_id: row.branch_id != null ? String(row.branch_id) : "",
          branch_name: String(row.branch_name || ""),
          created_at: row.created_at != null ? String(row.created_at) : "",
          updated_at: row.updated_at != null ? String(row.updated_at) : null,
          approved_at: row.approved_at != null ? String(row.approved_at) : null,
          created_by_name: String(row.created_by_name || ""),
          can_edit: canEditRecord,
          funding_total: fundingTotal,
          cashflows_total: cashflowsTotal,
        },
        funding,
        cashflows: cashflowsWithPayments,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      if (code === "not_found") {
        apiLog("warn", "expenses.detail.denied", { method: "GET", apiPath, status: 404, error: code })
        return NextResponse.json({ error: code }, { status: 404 })
      }
      const { status, body } = mapExpenseReadErrorResponse({
        error: code,
        staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
      })
      apiLog("warn", "expenses.detail.denied", { method: "GET", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.detail.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const name = String(body.name ?? "").trim()
  const descriptionRaw = body.description
  const description =
    descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
      ? null
      : String(descriptionRaw).trim()
  const expense_type = String(body.type ?? "").trim()

  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 })
  }
  if (!expense_type) {
    return NextResponse.json({ error: "type_required" }, { status: 400 })
  }
  if (!isValidExpenseType(expense_type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  }
  if (expense_type.length > 30) {
    return NextResponse.json({ error: "type_too_long" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.update.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "edit_expense")
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = expenseScopeWhere(actor, expenseId)
      const existing = await client.query(
        `SELECT e.id, e.expense_number, e.name, e.description, e.status, e.type, e.branch_id,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const ex = existing.rows[0] as Record<string, unknown> | undefined
      if (!ex) return { error: "not_found" as const }
      if (String(ex.status || "").trim().toLowerCase() !== "pending") {
        return {
          error: "expense_not_editable" as const,
          message: "Only expenses in Pending status can be edited." as const,
        }
      }

      const nextBranchId = String(ex.branch_id || "")

      const upd = await client.query(
        `UPDATE expenses e
         SET name = $1,
             description = $2,
             type = $3,
             updated_at = NOW()
         WHERE e.id = $4::uuid
           AND e.institution_id = $5::uuid
           AND e.branch_id = $6::uuid
         RETURNING e.id, e.expense_number, e.name, e.description, e.type, e.status, e.branch_id,
                   e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at, e.updated_at`,
        [name, description, expense_type, expenseId, actor.institution_id, actor.branch_id],
      )

      const row = upd.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "update_failed" as const }

      await auditExpenseUpdate(
        client,
        actor,
        expenseId,
        expenseSnapshot(ex),
        expenseSnapshot(row),
        nextBranchId,
      )

      return {
        id: String(row.id),
        expense_number: String(row.expense_number || ""),
        name: String(row.name || ""),
        type: String(row.type || ""),
        status: String(row.status || ""),
        updated_at: row.updated_at != null ? String(row.updated_at) : "",
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          expense: {
            id: expenseId,
            name: String(row.name || ""),
            expense_number: String(row.expense_number || ""),
            type: String(row.type || ""),
            status: String(row.status || ""),
          },
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const { status, body } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          expense_not_editable: 409,
          update_failed: 500,
        },
      )
      apiLog("warn", "expenses.update.denied", { method: "PATCH", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.update.success", { method: "PATCH", apiPath, status: 200 })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyExpenseUpdated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            expense: ctx.expense,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "expenses.update.notifications_dispatched"
            : "expenses.update.notifications_partial",
          {
            method: "PATCH",
            apiPath,
            status: 200,
            expenseId: result.id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "expenses.update.notifications_failed", {
          method: "PATCH",
          apiPath,
          status: 200,
          expenseId: result.id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    const { postCommit: _postCommit, ...payload } = result
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
