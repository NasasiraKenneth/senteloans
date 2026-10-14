import type { PoolClient } from "pg"
import { hasPermissions, type ActorContext } from "@/lib/api/rbac"

/** Matches scripts/09-seed-users.sql (includes legacy typo view_bank_accouts). */
export const FINANCE_PERMISSIONS = {
  viewBankAccounts: "view_bank_accouts",
  addBankAccount: "add_bank_account",
  editBankAccount: "edit_bank_account",
  editBankAmount: "edit_bank_amount",
  viewGrants: "view_grants",
  addGrant: "add_grant",
  editGrant: "edit_grant",
  editGrantAmount: "edit_grant_amount",
  viewUnclaimedDeposits: "view_unclaimed_deposits",
  addUnclaimedDeposit: "add_unclaimed_deposit",
  editUnclaimedDeposit: "edit_unclaimed_deposit",
  editDailyReport: "edit_daily_report",
} as const

export async function canViewAnyFinanceModule(client: PoolClient, actor: ActorContext): Promise<boolean> {
  const perms = await hasPermissions(client, actor, [
    FINANCE_PERMISSIONS.viewBankAccounts,
    FINANCE_PERMISSIONS.viewGrants,
    FINANCE_PERMISSIONS.viewUnclaimedDeposits,
  ])
  return Object.values(perms).some(Boolean)
}
