import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseReadAccess,
  expenseScopeWhere,
  mapExpenseReadErrorResponse,
} from "@/lib/api/expense-access"

/** Staff in the expense's branch, for cashflow assignee pickers (record cashflow permission). */
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
      const access = await assertExpenseReadAccess(client, sess.authUserId, ["record_cashflow"])
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
        }
      }
      const { actor } = access

      const { where, values } = expenseScopeWhere(actor, expenseId)
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
      if (code === "not_found") {
        apiLog("warn", "expenses.cashflow_staff.denied", { method: "GET", apiPath, status: 404, error: code })
        return NextResponse.json({ error: code }, { status: 404 })
      }
      if (code === "expense_branch_missing") {
        apiLog("warn", "expenses.cashflow_staff.denied", { method: "GET", apiPath, status: 400, error: code })
        return NextResponse.json({ error: code }, { status: 400 })
      }
      const { status, body } = mapExpenseReadErrorResponse({
        error: code,
        staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
      })
      apiLog("warn", "expenses.cashflow_staff.denied", { method: "GET", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.cashflow_staff.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ staff: result.staff })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflow_staff.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
