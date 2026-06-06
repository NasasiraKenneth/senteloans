import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import type { ActorContext } from "@/lib/api/rbac"

export const BANK_ACCOUNTS_TABLE = "bank_accounts"
export const UNCLAIMED_DEPOSITS_TABLE = "unclaimed_deposits"
export const GRANTS_TABLE = "grants"
export const DAILY_FINANCES_TABLE = "daily_finances"

const FINANCES_CATEGORY = "finances"

function financesMeta(
  actor: Pick<ActorContext, "branch_id">,
  rowBranchId?: string | null,
): { branch_id?: string } {
  const branch_id = rowBranchId ?? actor.branch_id ?? undefined
  return branch_id ? { branch_id } : {}
}

/* ------------------------------------------------------------------ snapshots */

export function bankAccountSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    bank_name: row.bank_name ?? null,
    bank_account_number: row.bank_account_number ?? null,
    total_amount: row.total_amount ?? null,
    branch_id: row.branch_id ?? null,
  }
}

export function unclaimedDepositSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    unclaimed_deposit_number: row.unclaimed_deposit_number ?? null,
    transaction_number: row.transaction_number ?? null,
    amount: row.amount ?? null,
    mode: row.mode ?? null,
    date: row.date ?? null,
    status: row.status ?? null,
    member_id: row.member_id ?? null,
    client_id: row.client_id ?? null,
    transaction_id: row.transaction_id ?? null,
    branch_id: row.branch_id ?? null,
    notes: row.notes ?? null,
  }
}

export function grantSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    client_id: row.client_id ?? null,
    total_amount: row.total_amount ?? null,
    available_balance: row.available_balance ?? null,
    branch_id: row.branch_id ?? null,
  }
}

export function dailyFinanceSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    bank_total_amount: row.bank_total_amount ?? null,
    mobile_money_amount: row.mobile_money_amount ?? null,
    cash_amount: row.cash_amount ?? null,
    total_amount: row.total_amount ?? null,
    available_balance: row.available_balance ?? null,
    branch_id: row.branch_id ?? null,
  }
}

/* ------------------------------------------------------------------ helpers */

type ActorForAudit = Pick<ActorContext, "id" | "institution_id" | "branch_id">

async function logInsert(
  client: PoolClient,
  tableName: string,
  actor: ActorForAudit,
  recordId: string,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await auditLogger.logOperation(
    {
      table_name: tableName,
      category: FINANCES_CATEGORY,
      operation: "INSERT",
      record_id: recordId,
      new_values: newValues,
      institution_id: actor.institution_id,
      user_id: actor.id,
      ...financesMeta(actor, rowBranchId),
    },
    client,
  )
}

async function logUpdate(
  client: PoolClient,
  tableName: string,
  actor: ActorForAudit,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await auditLogger.logOperation(
    {
      table_name: tableName,
      category: FINANCES_CATEGORY,
      operation: "UPDATE",
      record_id: recordId,
      old_values: oldValues,
      new_values: newValues,
      institution_id: actor.institution_id,
      user_id: actor.id,
      ...financesMeta(actor, rowBranchId),
    },
    client,
  )
}

/* ------------------------------------------------------------------ bank accounts */

export async function auditBankAccountInsert(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logInsert(client, BANK_ACCOUNTS_TABLE, actor, recordId, newValues, rowBranchId)
}

export async function auditBankAccountUpdate(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logUpdate(client, BANK_ACCOUNTS_TABLE, actor, recordId, oldValues, newValues, rowBranchId)
}

/* ------------------------------------------------------------------ unclaimed deposits */

export async function auditUnclaimedDepositInsert(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logInsert(client, UNCLAIMED_DEPOSITS_TABLE, actor, recordId, newValues, rowBranchId)
}

export async function auditUnclaimedDepositUpdate(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logUpdate(client, UNCLAIMED_DEPOSITS_TABLE, actor, recordId, oldValues, newValues, rowBranchId)
}

/* ------------------------------------------------------------------ grants */

export async function auditGrantInsert(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logInsert(client, GRANTS_TABLE, actor, recordId, newValues, rowBranchId)
}

export async function auditGrantUpdate(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logUpdate(client, GRANTS_TABLE, actor, recordId, oldValues, newValues, rowBranchId)
}

/* ------------------------------------------------------------------ daily finances */

export async function auditDailyFinanceInsert(
  client: PoolClient,
  actor: ActorForAudit,
  recordId: string,
  newValues: Record<string, unknown>,
  rowBranchId?: string | null,
): Promise<void> {
  await logInsert(client, DAILY_FINANCES_TABLE, actor, recordId, newValues, rowBranchId)
}
