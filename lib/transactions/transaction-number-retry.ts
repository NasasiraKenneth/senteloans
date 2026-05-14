import type { PoolClient } from "pg"
import { makePrefixedNumber } from "@/lib/ids/prefixed-number"

const DEFAULT_ATTEMPTS = 5

/** Must be a valid unquoted PostgreSQL identifier (used for SAVEPOINT name). */
const SAVEPOINT_NAME = "sp_ins_txn_num_retry"

export type TransactionInsertRow = { id: string }

/**
 * Retries INSERT when transaction_number collides (Postgres 23505).
 * Caller supplies a function that performs the INSERT and returns RETURNING id.
 *
 * When `options.client` is set (caller has issued `BEGIN`), each attempt is wrapped in a
 * SAVEPOINT so a failed INSERT does not abort the outer transaction — required for retries.
 */
export async function insertWithTransactionNumberRetry<T extends TransactionInsertRow>(
  insertWithNumber: (transactionNumber: string) => Promise<{ rows: T[] }>,
  options?: { prefix?: string; maxAttempts?: number; client?: PoolClient },
): Promise<{ row: T; transactionNumber: string } | null> {
  const prefix = options?.prefix ?? "TXN"
  const maxAttempts = options?.maxAttempts ?? DEFAULT_ATTEMPTS
  const pgClient = options?.client
  let transactionNumber = ""
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    transactionNumber = makePrefixedNumber(prefix)
    try {
      if (pgClient) {
        await pgClient.query(`SAVEPOINT ${SAVEPOINT_NAME}`)
      }
      const res = await insertWithNumber(transactionNumber)
      const row = res.rows[0]
      if (row?.id) {
        if (pgClient) {
          await pgClient.query(`RELEASE SAVEPOINT ${SAVEPOINT_NAME}`)
        }
        return { row, transactionNumber }
      }
      if (pgClient) {
        await pgClient.query(`RELEASE SAVEPOINT ${SAVEPOINT_NAME}`)
      }
    } catch (e: unknown) {
      if (pgClient) {
        await pgClient.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT_NAME}`).catch(() => undefined)
      }
      const code = String((e as { code?: string })?.code || "")
      if (code === "23505") continue
      throw e
    }
  }
  return null
}
