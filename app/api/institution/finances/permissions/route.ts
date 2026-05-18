import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const permissions = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return null

      const [
        viewBankAccounts,
        addBankAccount,
        editBankAccount,
        viewGrants,
        addGrant,
        editGrant,
        viewUnclaimedDeposits,
        addUnclaimedDeposit,
        editUnclaimedDeposit,
      ] = await Promise.all([
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewUnclaimedDeposits),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addUnclaimedDeposit),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit),
      ])

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name FROM senteloans_branches WHERE institution_id = $1 ORDER BY name ASC`,
              [actor.institution_id],
            )
          ).rows
        : []

      return {
        viewBankAccounts,
        addBankAccount,
        editBankAccount,
        viewGrants,
        addGrant,
        editGrant,
        viewUnclaimedDeposits,
        addUnclaimedDeposit,
        editUnclaimedDeposit,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) {
      return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    }

    apiLog("info", "finances.permissions.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
