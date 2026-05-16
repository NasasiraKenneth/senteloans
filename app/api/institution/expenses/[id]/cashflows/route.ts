import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard"
import { auditCashflowInsert, cashflowSnapshot } from "@/lib/audit/expense-audit"
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      apiLog("warn", "expenses.cashflows.create.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "record_cashflow")
      if (!allowed) return { error: "missing_permission:record_cashflow" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const exRes = await client.query<{ id: string; branch_id: string; status: string }>(
        `SELECT e.id, e.branch_id, e.status FROM senteloans_expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = exRes.rows[0]
      if (!expense) return { error: "not_found" as const }
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

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

      const ins = await client.query(
        `INSERT INTO senteloans_expense_cashflows (
           expense_id,
           transaction_id,
           staff_id,
           client_id,
           payment_method,
           amount,
           description,
           date
         )
         VALUES (
           $1::uuid,
           NULL,
           $2::uuid,
           $3::uuid,
           $4::payment_mode,
           $5,
           $6,
           $7::date
         )
         RETURNING
           id,
           expense_id,
           amount::float,
           description,
           status,
           date::text AS date,
           payment_method::text AS payment_method,
           created_at,
           staff_id,
           client_id,
           completed_by,
           completed_at`,
        [
          expenseId,
          assigneeRaw === "staff" ? staffId : null,
          assigneeRaw === "clients" ? clientId : null,
          mode,
          amount,
          description,
          date,
        ],
      )
      const row = ins.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "insert_failed" as const }

      await auditCashflowInsert(client, actor, String(row.id), cashflowSnapshot(row), branchId)

      const sid = row.staff_id != null ? String(row.staff_id) : null
      const cid = row.client_id != null ? String(row.client_id) : null
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
          id: String(row.id),
          amount: Number(row.amount || 0),
          description: row.description != null ? String(row.description) : null,
          status: String(row.status || "Pending"),
          date: row.date != null ? String(row.date) : null,
          payment_method: row.payment_method != null ? String(row.payment_method) : null,
          created_at: row.created_at != null ? String(row.created_at) : "",
          staff_id: sid,
          client_id: cid,
          assigned_type,
          assigned_name,
          completed_by: row.completed_by != null ? String(row.completed_by) : null,
          completed_at: row.completed_at != null ? String(row.completed_at) : null,
          completed_by_name: null as string | null,
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:record_cashflow" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "expense_already_completed" || code === "expense_already_rejected" ? 409
        : code === "invalid_staff" || code === "invalid_client" ? 400
        : code === "insert_failed" ? 500
        : 400
      apiLog("warn", "expenses.cashflows.create.denied", { method: "POST", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.cashflows.create.success", { method: "POST", apiPath, status: 201 })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
