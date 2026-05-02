import { makePrefixedNumber } from "@/lib/ids/prefixed-number"

const DEFAULT_ATTEMPTS = 5

export type TransactionInsertRow = { id: string }

/**
 * Retries INSERT when transaction_number collides (Postgres 23505).
 * Caller supplies a function that performs the INSERT and returns RETURNING id.
 */
export async function insertWithTransactionNumberRetry<T extends TransactionInsertRow>(
  insertWithNumber: (transactionNumber: string) => Promise<{ rows: T[] }>,
  options?: { prefix?: string; maxAttempts?: number },
): Promise<{ row: T; transactionNumber: string } | null> {
  const prefix = options?.prefix ?? "TXN"
  const maxAttempts = options?.maxAttempts ?? DEFAULT_ATTEMPTS
  let transactionNumber = ""
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    transactionNumber = makePrefixedNumber(prefix)
    try {
      const res = await insertWithNumber(transactionNumber)
      const row = res.rows[0]
      if (row?.id) return { row, transactionNumber }
    } catch (e: unknown) {
      const code = String((e as { code?: string })?.code || "")
      if (code === "23505") continue
      throw e
    }
  }
  return null
}
