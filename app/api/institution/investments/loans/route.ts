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
      apiLog("warn", "investments.loans.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "investments.loans.denied", { method: "GET", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "200", 10), 1), 500)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "view_investments")
      if (!allowed) return { error: "missing_permission:view_investments" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const rowsRes = await client.query(
        `SELECT
           l.id,
           l.loan_product,
           l.principal_amount,
           l.status,
           l.created_at,
           c.name AS client_name
         FROM senteloans_institution_loans l
         LEFT JOIN senteloans_clients c ON c.id = l.client_id
         WHERE l.institution_id = $1
           ${isSuperAdmin ? "" : "AND l.branch_id = $2"}
         ORDER BY l.created_at DESC
         LIMIT $${isSuperAdmin ? 2 : 3}`,
        isSuperAdmin ? [actor.institution_id, pageSize] : [actor.institution_id, actor.branch_id, pageSize],
      )

      return {
        items: rowsRes.rows.map((row: any) => ({
          id: row.id,
          label: `${row.loan_product || "Loan"} - ${row.client_name || "Client"} (${row.status || "Unknown"})`,
          principal_amount: Number(row.principal_amount || 0),
          status: row.status || "",
        })),
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "investments.loans.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "investments.loans.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.loans.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
