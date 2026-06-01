import type { PoolClient } from "pg"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"

export type InvoiceInsertRow = { id: string }

/**
 * Retries INSERT when invoice_number collides (Postgres 23505).
 * Delegates to the shared prefixed-number retry helper.
 */
export async function insertWithInvoiceNumberRetry<T extends InvoiceInsertRow>(
  insertWithNumber: (invoiceNumber: string) => Promise<{ rows: T[] }>,
  options?: { prefix?: string; maxAttempts?: number; client?: PoolClient },
): Promise<{ row: T; invoiceNumber: string } | null> {
  const result = await insertWithPrefixedNumberRetry(insertWithNumber, {
    prefix: options?.prefix ?? "INV",
    savepointName: "sp_ins_inv_num_retry",
    maxAttempts: options?.maxAttempts,
    client: options?.client,
  })
  if (!result) return null
  return { row: result.row, invoiceNumber: result.number }
}
