import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import type { ActorContext } from "@/lib/api/rbac"

const INVOICES_TABLE = "invoices"
const INVOICE_PAYMENTS_TABLE = "invoice_payments"

export function invoiceAuditMeta(
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  invoiceBranchId?: string | null,
): { branch_id?: string } {
  const branch_id = invoiceBranchId ?? actor.branch_id ?? undefined
  return branch_id ? { branch_id } : {}
}

export function invoiceSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    member_id: row.member_id ?? null,
    third_party_agent_id: row.third_party_agent_id ?? null,
    invoice_number: row.invoice_number ?? null,
    invoice_date: row.invoice_date ?? null,
    invoice_due: row.invoice_due ?? null,
    subtotal: row.subtotal ?? null,
    vat: row.vat ?? null,
    total_amount: row.total_amount ?? null,
    inwords: row.inwords ?? null,
    invoice_type: row.invoice_type ?? null,
    status: row.status ?? null,
    item_count: row.item_count ?? null,
  }
}

export function invoicePaymentSnapshot(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    invoice_id: row.invoice_id ?? null,
    amount: row.amount ?? null,
    payment_date: row.payment_date ?? null,
    transaction_id: row.transaction_id ?? null,
    membership_fee_id: row.membership_fee_id ?? null,
    processed_by: row.processed_by ?? null,
  }
}

export async function auditInvoiceInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    INVOICES_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    invoiceAuditMeta(actor, branchId),
    client,
  )
}

export async function auditInvoiceUpdate(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logUpdate(
    INVOICES_TABLE,
    recordId,
    oldValues,
    newValues,
    actor.institution_id,
    actor.id,
    invoiceAuditMeta(actor, branchId),
    client,
  )
}

export async function auditInvoicePaymentInsert(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id">,
  recordId: string,
  newValues: Record<string, unknown>,
  branchId?: string | null,
): Promise<void> {
  await auditLogger.logInsert(
    INVOICE_PAYMENTS_TABLE,
    recordId,
    newValues,
    actor.institution_id,
    actor.id,
    invoiceAuditMeta(actor, branchId),
    client,
  )
}
