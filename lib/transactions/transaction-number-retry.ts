import type { PoolClient } from "pg"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"

export type TransactionInsertRow = { id: string }

/**
 * Retries INSERT when transaction_number collides (Postgres 23505).
 * Delegates to the shared prefixed-number retry helper.
 */
export async function insertWithTransactionNumberRetry<T extends TransactionInsertRow>(
  insertWithNumber: (transactionNumber: string) => Promise<{ rows: T[] }>,
  options?: { prefix?: string; maxAttempts?: number; client?: PoolClient },
): Promise<{ row: T; transactionNumber: string } | null> {
  const result = await insertWithPrefixedNumberRetry(insertWithNumber, {
    prefix: options?.prefix ?? "TXN",
    savepointName: "sp_ins_txn_num_retry",
    maxAttempts: options?.maxAttempts,
    client: options?.client,
  })
  if (!result) return null
  return { row: result.row, transactionNumber: result.number }
}
