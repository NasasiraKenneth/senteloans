import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession } from "@/lib/api/rbac"
import {
  assertFinancePermissionsReadAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
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
      const access = await assertFinancePermissionsReadAccess(client, sess.authUserId)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const [
        viewBankAccounts,
        addBankAccount,
        editBankAccount,
        editBankAmount,
        viewGrants,
        addGrant,
        editGrant,
        editGrantAmount,
        viewUnclaimedDeposits,
        addUnclaimedDeposit,
        editUnclaimedDeposit,
      ] = await Promise.all([
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAmount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editGrantAmount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewUnclaimedDeposits),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addUnclaimedDeposit),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit),
      ])

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`,
              [actor.institution_id],
            )
          ).rows
        : []

      return {
        viewBankAccounts,
        addBankAccount,
        editBankAccount,
        editBankAmount,
        viewGrants,
        addGrant,
        editGrant,
        editGrantAmount,
        viewUnclaimedDeposits,
        addUnclaimedDeposit,
        editUnclaimedDeposit,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (permissions && "error" in permissions) {
      const accessResponse = financeAccessErrorResponseOrNull(permissions)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      return NextResponse.json({ error: permissions.error }, { status: 403 })
    }

    apiLog("info", "finances.permissions.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
