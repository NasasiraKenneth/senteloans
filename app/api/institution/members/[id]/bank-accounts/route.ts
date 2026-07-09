import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, resolveActorContext } from "@/lib/api/rbac"

// Returns the bank accounts belonging to a member's branch so staff recording
// a bank-routed payment (membership fee / shares) can pick the receiving account.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.bank_accounts.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id FROM members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "forbidden" as const }

      const res = await client.query(
        `SELECT ba.id, tpa.name AS bank_name, ba.bank_account_number
         FROM bank_accounts ba
         INNER JOIN third_party_agents tpa ON tpa.id = ba.third_party_agent_id
         WHERE ba.institution_id = $1 AND ba.branch_id = $2
         ORDER BY tpa.name ASC, ba.bank_account_number ASC`,
        [memberRow.institution_id, memberRow.branch_id]
      )
      return {
        bankAccounts: res.rows.map((row: any) => ({
          id: String(row.id),
          bank_name: String(row.bank_name || ""),
          bank_account_number: String(row.bank_account_number || ""),
        })),
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:view_members" || result.error === "forbidden" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.bank_accounts.list.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.bank_accounts.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
