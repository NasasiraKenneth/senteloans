import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.permissions.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const permissions = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return null

      const [
        viewExpenses,
        createExpense,
        editExpense,
        editExpenseStatus,
        recordCashflow,
        downloadExpense,
        editCashflow,
        editCashflowStatus,
      ] = await Promise.all([
        hasPermission(client, actor, "view_expenses"),
        hasPermission(client, actor, "create_expense"),
        hasPermission(client, actor, "edit_expense"),
        hasPermission(client, actor, "edit_expense_status"),
        hasPermission(client, actor, "record_cashflow"),
        hasPermission(client, actor, "download_expense"),
        hasPermission(client, actor, "edit_cashflow"),
        hasPermission(client, actor, "edit_cashflow_status"),
      ])

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name
               FROM senteloans_branches
               WHERE institution_id = $1
               ORDER BY name ASC`,
              [actor.institution_id],
            )
          ).rows
        : []

      return {
        viewExpenses,
        createExpense,
        editExpense,
        editExpenseStatus,
        recordCashflow,
        downloadExpense,
        editCashflow,
        editCashflowStatus,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "expenses.permissions.denied", { method: "GET", apiPath, status: 403, error: "user_not_linked" })
      return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    }
    apiLog("info", "expenses.permissions.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
