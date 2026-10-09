import type { PoolClient } from "pg"
import { auditInvoicePaymentInsert } from "@/lib/audit/invoice-audit"
import { auditInvoiceUpdate } from "@/lib/audit/invoice-audit"
import { normalizeInvoiceStatus } from "./status"

export interface InvoicePaymentSummary {
  paid_amount: number
  outstanding: number
  is_fully_paid: boolean
}

export interface RecordInvoicePaymentInput {
  institutionId: string
  branchId: string
  invoiceId: string
  amount: number
  paymentDate: Date | string
  processedBy: string
  transactionId?: string | null
  membershipFeeId?: string | null
}

export interface SyncInvoiceStatusAudit {
  institutionId: string
  branchId: string
  userId: string
}

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

/**
 * Sum of amounts applied to an invoice via invoice_payments.
 */
export async function getInvoicePaidAmount(
  client: PoolClient,
  invoiceId: string,
): Promise<number> {
  const res = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM invoice_payments
      WHERE invoice_id = $1`,
    [invoiceId],
  )
  return round2(Number(res.rows[0]?.total ?? 0))
}

/**
 * Paid vs outstanding for one invoice (outstanding floored at 0).
 */
export async function getInvoicePaymentSummary(
  client: PoolClient,
  invoiceId: string,
  totalAmount: number,
): Promise<InvoicePaymentSummary> {
  const paid = await getInvoicePaidAmount(client, invoiceId)
  const total = round2(Math.max(0, totalAmount))
  const outstanding = round2(Math.max(total - paid, 0))
  return {
    paid_amount: paid,
    outstanding,
    is_fully_paid: total > 0 && outstanding <= 0.01,
  }
}

/**
 * Find the open auto-generated membership-fee invoice for a member.
 *
 * Identity: invoice_type = 'Auto' AND a line item described as
 * "Annual Membership Fee" (created by the member-registration flow).
 *
 * Excludes fully paid/cancelled invoices and returns the oldest match so
 * repeat fee payments settle the original registration invoice first.
 */
export async function findOpenMemberMembershipInvoice(
  client: PoolClient,
  institutionId: string,
  memberId: string,
): Promise<{ id: string; invoice_number: string; total_amount: number; status: string } | null> {
  const res = await client.query<{
    id: string
    invoice_number: string
    total_amount: string
    status: string
  }>(
    `SELECT i.id, i.invoice_number, i.total_amount, i.status
       FROM invoices i
      WHERE i.institution_id = $1
        AND i.member_id = $2
        AND LOWER(i.invoice_type) = 'auto'
        AND LOWER(i.status) NOT IN ('fully paid', 'paid', 'cancelled')
        AND EXISTS (
          SELECT 1 FROM invoice_items it
           WHERE it.invoice_id = i.id
             AND LOWER(it.description) LIKE '%membership fee%'
        )
      ORDER BY i.created_at ASC
      LIMIT 1`,
    [institutionId, memberId],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    total_amount: Number(row.total_amount),
    status: row.status,
  }
}

/**
 * Insert a payment allocation row linking a transaction or membership-fee
 * record to an invoice.
 */
export async function recordInvoicePayment(
  client: PoolClient,
  input: RecordInvoicePaymentInput,
): Promise<{ id: string }> {
  const hasTx = !!input.transactionId
  const hasFee = !!input.membershipFeeId
  if (hasTx === hasFee) {
    throw new Error("invoice_payment_requires_exactly_one_source")
  }
  const amount = round2(input.amount)
  if (amount <= 0) throw new Error("invoice_payment_amount_invalid")

  const paymentDate =
    input.paymentDate instanceof Date
      ? input.paymentDate.toISOString()
      : String(input.paymentDate)

  const res = await client.query<{ id: string }>(
    `INSERT INTO invoice_payments (
       institution_id, branch_id, invoice_id, amount, payment_date,
       transaction_id, membership_fee_id, processed_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.institutionId,
      input.branchId,
      input.invoiceId,
      amount,
      paymentDate,
      input.transactionId ?? null,
      input.membershipFeeId ?? null,
      input.processedBy,
    ],
  )
  const row = res.rows[0]
  if (!row) throw new Error("invoice_payment_insert_failed")

  await auditInvoicePaymentInsert(
    client,
    {
      id: input.processedBy,
      institution_id: input.institutionId,
      branch_id: input.branchId,
    },
    row.id,
    {
      invoice_id: input.invoiceId,
      amount,
      payment_date: paymentDate,
      transaction_id: input.transactionId ?? null,
      membership_fee_id: input.membershipFeeId ?? null,
      processed_by: input.processedBy,
    },
    input.branchId,
  )

  return { id: row.id }
}

/**
 * Recompute paid total and set invoice status to fully paid | partially paid |
 * sent | overdue (aligned with create-invoice InvoiceStatus vocabulary).
 */
export async function syncInvoiceStatusFromPayments(
  client: PoolClient,
  invoiceId: string,
  audit?: SyncInvoiceStatusAudit,
): Promise<{ status: string; paid_amount: number; outstanding: number }> {
  const invRes = await client.query<{
    total_amount: string
    invoice_due: string | null
    status: string
  }>(
    `SELECT total_amount, invoice_due, status FROM invoices WHERE id = $1`,
    [invoiceId],
  )
  const inv = invRes.rows[0]
  if (!inv) throw new Error("invoice_not_found")

  const previousStatus = normalizeInvoiceStatus(inv.status)
  const total = round2(Number(inv.total_amount))
  const summary = await getInvoicePaymentSummary(client, invoiceId, total)

  const due = inv.invoice_due ? new Date(`${inv.invoice_due}T00:00:00Z`) : null
  const isOverdue = due != null && due.getTime() < Date.now()

  let nextStatus: string
  if (summary.is_fully_paid) {
    nextStatus = "fully paid"
  } else if (summary.paid_amount > 0) {
    nextStatus = isOverdue ? "overdue" : "partially paid"
  } else {
    nextStatus = isOverdue ? "overdue" : "sent"
  }

  if (nextStatus !== previousStatus) {
    await client.query(
      `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextStatus, invoiceId],
    )

    if (audit) {
      await auditInvoiceUpdate(
        client,
        {
          id: audit.userId,
          institution_id: audit.institutionId,
          branch_id: audit.branchId,
        },
        invoiceId,
        { status: previousStatus },
        { status: nextStatus },
        audit.branchId,
      )
    }
  }

  return {
    status: nextStatus,
    paid_amount: summary.paid_amount,
    outstanding: summary.outstanding,
  }
}
