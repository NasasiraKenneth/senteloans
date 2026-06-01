import { makePrefixedNumber } from "@/lib/ids/prefixed-number"

/**
 * Mint a candidate invoice number of the form `INV-{ts}-{rand6}`.
 *
 * Mirrors how transaction numbers are produced (see `lib/ids/prefixed-number.ts`
 * + `lib/transactions/transaction-number-retry.ts`). Pure — no database call —
 * so callers can use it inside SAVEPOINT-based retry loops (see
 * `insertWithInvoiceNumberRetry`) without leaking transactional state.
 *
 * Uniqueness is enforced by the `senteloans_invoices.invoice_number` UNIQUE
 * constraint; collisions are handled by the retry helper.
 */
export function generateInvoiceNumber(): string {
  return makePrefixedNumber("INV")
}
