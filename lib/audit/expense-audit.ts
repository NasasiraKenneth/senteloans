import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import type { ActorContext } from "@/lib/api/rbac"

const EXPENSES_TABLE = "expenses"
const FUNDING_TABLE = "expense_funding_sources"
const CASHFLOWS_TABLE = "expense_cashflows"
const CASHFLOW_PAYMENTS_TABLE = "expense_cashflows_payments"

export function expenseAuditMeta(
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  expenseBranchId?: string | null,
): { branch_id?: string } {
  const branch_id = expenseBranchId ?? actor.branch_id ?? undefined
  return branch_id ? { branch_id } : {}
}

export function expenseSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    expense_number: row.expense_number ?? null,
    name: row.name ?? null,
    description: row.description ?? null,
    status: row.status ?? null,
    type: row.type ?? null,
    branch_id: row.branch_id ?? null,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    rejected_by: row.rejected_by ?? null,
    rejected_at: row.rejected_at ?? null,
    completed_by: row.completed_by ?? null,
    completed_at: row.completed_at ?? null,
  }
}

export function fundingSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    expense_id: row.expense_id ?? null,
    source_type: row.source_type ?? null,
    loan_id: row.loan_id ?? null,
    amount: row.amount ?? null,
  }
}

export function cashflowSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    expense_id: row.expense_id ?? null,
    staff_id: row.staff_id ?? null,
    third_party_agent_id: row.third_party_agent_id ?? null,
    payment_method: row.payment_method ?? null,
    amount: row.amount ?? null,
    description: row.description ?? null,
    status: row.status ?? null,
    date: row.date ?? null,
    transaction_id: row.transaction_id ?? null,
    completed_by: row.completed_by ?? null,
    completed_at: row.completed_at ?? null,
  }
}

export function cashflowPaymentSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    expense_id: row.expense_id ?? null,
    expense_cashflow_id: row.expense_cashflow_id ?? null,
    transaction_id: row.transaction_id ?? null,
    payment_method: row.payment_method ?? null,
    amount: row.amount ?? null,
    date: row.date ?? null,
    created_by: row.created_by ?? null,
  }
}

export async function auditExpenseInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    EXPENSES_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditExpenseUpdate(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logUpdate(
    EXPENSES_TABLE,
    recordId,
    oldValues,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditFundingInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    FUNDING_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditFundingUpdate(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logUpdate(
    FUNDING_TABLE,
    recordId,
    oldValues,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditFundingDelete(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  oldValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logDelete(
    FUNDING_TABLE,
    recordId,
    oldValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditCashflowInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    CASHFLOWS_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditCashflowUpdate(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logUpdate(
    CASHFLOWS_TABLE,
    recordId,
    oldValues,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}

export async function auditCashflowPaymentInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    CASHFLOW_PAYMENTS_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    expenseAuditMeta(actor, branchId),
    client,
  )
}
