import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "investments.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "investments.permissions.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return null
      const role = String(actor.role || "").trim().toLowerCase()

      const [viewInvestments, viewInvestmentReports] = await Promise.all([
        hasInvestmentPermission(client, actor, "view_investments"),
        hasInvestmentPermission(client, actor, "view_investment_reports"),
      ])

      const branches =
        role === "super_admin"
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
        viewInvestments,
        viewInvestmentReports,
        isSuperAdmin: role === "super_admin",
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "investments.permissions.denied", { method: "GET", apiPath, status: 403, error: "user_not_linked" })
      return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    }
    apiLog("info", "investments.permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
