import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, hasPermissions, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
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

      const perms = await hasPermissions(client, actor, [
        "view_expenses",
        "create_expense",
        "edit_expense",
        "edit_expense_status",
        "record_cashflow",
        "download_expense",
        "edit_cashflow",
        "edit_cashflow_status",
      ] as const)
      const viewExpenses = perms.view_expenses
      const createExpense = perms.create_expense
      const editExpense = perms.edit_expense
      const editExpenseStatus = perms.edit_expense_status
      const recordCashflow = perms.record_cashflow
      const downloadExpense = perms.download_expense
      const editCashflow = perms.edit_cashflow
      const editCashflowStatus = perms.edit_cashflow_status

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name
               FROM branches
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
