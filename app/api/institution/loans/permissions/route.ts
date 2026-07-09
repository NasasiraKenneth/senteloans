import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.permissions.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const permissions = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return null

      const [viewLoans, createLoan, sellLoan] = await Promise.all([
        hasPermission(client, actor, "view_loans"),
        hasPermission(client, actor, "create_loan"),
        hasPermission(client, actor, "sell_loan"),
      ])

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
        viewLoans,
        createLoan,
        sellLoan,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "loans.permissions.denied", { method: "GET", apiPath, status: 403, error: "user_not_linked", authUserId: sess.authUserId })
      return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    }
    apiLog("info", "loans.permissions.success", { method: "GET", apiPath, status: 200, authUserId: sess.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
