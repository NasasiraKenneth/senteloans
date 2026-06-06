import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

function singleExpenseWhere(actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>, expenseId: string): { where: string; values: unknown[] } {
  let where = `e.id = $1::uuid AND e.institution_id = $2::uuid`
  const values: unknown[] = [expenseId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND e.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

/** Staff in the expense's branch, for cashflow assignee pickers (record/edit cashflow permission). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflow_staff.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const canRecord = await hasPermission(client, actor, "record_cashflow")
      const canEdit = await hasPermission(client, actor, "edit_cashflow")
      if (!canRecord && !canEdit) return { error: "missing_permission:record_or_edit_cashflow" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const exRes = await client.query<{ branch_id: string }>(
        `SELECT e.branch_id FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = exRes.rows[0]
      if (!expense) return { error: "not_found" as const }

      const branchId = String(expense.branch_id || "")
      if (!branchId) return { error: "expense_branch_missing" as const }

      const staffRes = await client.query<{ id: string; full_name: string | null; email: string | null }>(
        `SELECT u.id, u.full_name, u.email
         FROM users u
         WHERE u.institution_id = $1::uuid AND u.branch_id = $2::uuid
         ORDER BY COALESCE(NULLIF(trim(u.full_name), ''), u.email) ASC NULLS LAST
         LIMIT 500`,
        [actor.institution_id, branchId],
      )

      const staff = staffRes.rows.map((r) => ({
        id: String(r.id),
        full_name: r.full_name != null ? String(r.full_name).trim() : "",
        email: r.email != null ? String(r.email).trim() : "",
      }))

      return { staff }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:record_or_edit_cashflow" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "expense_branch_missing" ? 400
        : 400
      apiLog("warn", "expenses.cashflow_staff.denied", { method: "GET", apiPath, status: statusCode, error: code })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "expenses.cashflow_staff.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ staff: result.staff })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflow_staff.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
