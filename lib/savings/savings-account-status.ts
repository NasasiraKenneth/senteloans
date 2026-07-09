import type { PoolClient } from "pg"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"

export type SavingsAccountStatus = "Active" | "Inactive" | "Suspended" | "Closed"

export interface SavingsAccountRow {
  id: string
  institution_id: string
  branch_id: string
  member_id: string
  account_number: string
  status: SavingsAccountStatus
}

export type SavingsAccountStatusError =
  | "savings_account_not_found"
  | "savings_account_inactive"

export type SavingsAccountStatusResult =
  | { ok: true; account: SavingsAccountRow }
  | { ok: false; error: SavingsAccountStatusError; status?: SavingsAccountStatus }

export type SavingsAccountWriteGateError =
  | SavingsAccountStatusError
  | "branch_not_found"
  | "branch_inactive"

export type SavingsAccountWriteGateResult =
  | { ok: true; account: SavingsAccountRow }
  | {
      ok: false
      error: SavingsAccountWriteGateError
      accountStatus?: SavingsAccountStatus
      branchStatus?: BranchStatus
    }

const SAVINGS_ACCOUNT_LOOKUP_SQL = `SELECT
     id,
     institution_id,
     branch_id,
     member_id,
     account_number,
     status::text AS status
   FROM savings_accounts
  WHERE id = $1
  LIMIT 1`

/**
 * Look up a savings account by id. When `institutionId` is supplied, accounts
 * outside that tenant are treated as not found.
 */
export async function getSavingsAccountById(
  client: PoolClient,
  accountId: string,
  institutionId?: string,
): Promise<SavingsAccountStatusResult> {
  const res = await client.query<SavingsAccountRow>(SAVINGS_ACCOUNT_LOOKUP_SQL, [accountId])
  const row = res.rows[0]
  if (!row) return { ok: false, error: "savings_account_not_found" }
  if (institutionId && row.institution_id !== institutionId) {
    return { ok: false, error: "savings_account_not_found" }
  }
  return { ok: true, account: row }
}

/**
 * Evaluate an already-loaded savings account row without hitting the database again.
 */
export function assertSavingsAccountActiveRow(
  account: Pick<SavingsAccountRow, "status"> & Partial<SavingsAccountRow>,
): SavingsAccountStatusResult {
  if (account.status !== "Active") {
    return { ok: false, error: "savings_account_inactive", status: account.status }
  }
  return { ok: true, account: account as SavingsAccountRow }
}

/**
 * Load a savings account and enforce `Active` status. Use on write paths that
 * should be blocked for dormant, closed, or otherwise inactive accounts.
 */
export async function assertSavingsAccountActive(
  client: PoolClient,
  accountId: string,
  institutionId?: string,
): Promise<SavingsAccountStatusResult> {
  const res = await getSavingsAccountById(client, accountId, institutionId)
  if (!res.ok) return res
  return assertSavingsAccountActiveRow(res.account)
}

/**
 * Load a savings account, require `Active` status, and require an active branch.
 */
export async function assertSavingsAccountAndBranchActive(
  client: PoolClient,
  accountId: string,
  institutionId?: string,
): Promise<SavingsAccountWriteGateResult> {
  const accountCheck = await assertSavingsAccountActive(client, accountId, institutionId)
  if (!accountCheck.ok) {
    return {
      ok: false,
      error: accountCheck.error,
      ...(accountCheck.error === "savings_account_inactive"
        ? { accountStatus: accountCheck.status }
        : {}),
    }
  }

  const branchCheck = await assertBranchActive(client, accountCheck.account.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  return { ok: true, account: accountCheck.account }
}

/** HTTP status for savings-account/branch write-gate failures. */
export function savingsAccountWriteGateHttpStatus(error: string): number {
  if (error === "savings_account_not_found") return 404
  if (
    error === "savings_account_inactive" ||
    error === "branch_inactive" ||
    error === "branch_not_found"
  ) {
    return 403
  }
  return 403
}

/** JSON body for savings-account route denial responses. */
export function savingsAccountRouteDenialBody(result: {
  error: string
  accountStatus?: SavingsAccountStatus
  branchStatus?: BranchStatus
  message?: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    error: result.message || result.error,
    code: result.error,
  }
  if (result.accountStatus) payload.account_status = result.accountStatus
  if (result.branchStatus) payload.branch_status = result.branchStatus
  return payload
}

/** Client-facing message for savings-account write-gate failures. */
export function mapSavingsAccountWriteGateClientMessage(
  code: unknown,
  action = "complete this action",
): string {
  switch (String(code || "")) {
    case "savings_account_inactive":
      return `This savings account is not active. Reactivate the account before you ${action}.`
    case "savings_account_not_found":
      return "Savings account not found."
    case "branch_inactive":
      return `This account's branch is not active. Reactivate the branch before you ${action}.`
    case "branch_not_found":
      return "This account's branch could not be found."
    default:
      return String(code || "Unexpected error")
  }
}
