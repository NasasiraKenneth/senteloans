import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hasPermission, hasPermissions, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return null
      const perms = await hasPermissions(client, actor, [
        "view_members",
        "create_member",
        "edit_member",
        "edit_kyc",
        "edit_membership_fee",
        "edit_shares",
        "edit_opening_savings",
        "edit_opening_loans",
      ] as const)
      const viewMembers = perms.view_members
      const createMember = perms.create_member
      const editMember = perms.edit_member
      const editKyc = perms.edit_kyc
      const editMembershipFee = perms.edit_membership_fee
      const editShares = perms.edit_shares
      const editOpeningSavings = perms.edit_opening_savings
      const editOpeningLoans = perms.edit_opening_loans

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
