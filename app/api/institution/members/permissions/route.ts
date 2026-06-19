import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return null
      const [viewMembers, createMember, editMember, editKyc, editMembershipFee, editShares, editOpeningSavings, editOpeningLoans] = await Promise.all([
        hasPermission(client, actor, "view_members"),
        hasPermission(client, actor, "create_member"),
        hasPermission(client, actor, "edit_member"),
        hasPermission(client, actor, "edit_kyc"),
        hasPermission(client, actor, "edit_membership_fee"),
        hasPermission(client, actor, "edit_shares"),
        hasPermission(client, actor, "edit_opening_savings"),
        hasPermission(client, actor, "edit_opening_loans"),
      ])

      const branches = isSuperAdmin(actor)
          ? (
              await client.query(
                `SELECT id, name
                 FROM branches
                 WHERE institution_id = $1
                 ORDER BY name ASC`,
                [actor.institution_id]
              )
            ).rows
          : []

      return {
        viewMembers,
        createMember,
        editMember,
        editKyc,
        editMembershipFee,
        editShares,
        editOpeningSavings,
        editOpeningLoans,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
