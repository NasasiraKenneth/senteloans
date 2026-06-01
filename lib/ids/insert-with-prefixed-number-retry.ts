import type { PoolClient } from "pg"
import { makePrefixedNumber } from "./prefixed-number"

export const DEFAULT_RETRY_ATTEMPTS = 5

export type PrefixedNumberInsertRow = { id: string }

export interface InsertWithPrefixedNumberRetryOptions {
  /** Prefix passed to `makePrefixedNumber` (e.g. "TXN", "INV"). Required. */
  prefix: string
  /**
   * Distinct SAVEPOINT identifier — must be a valid unquoted Postgres identifier.
   * Required when `client` is set so nested retries from different domains
   * (e.g. invoice insert nested under a transaction insert) don't clash.
   */
  savepointName: string
  /** Default 5. */
  maxAttempts?: number
  /**
   * If provided, each attempt is wrapped in a SAVEPOINT so a failed INSERT
   * doesn't abort the caller's outer BEGIN/COMMIT.
   */
  client?: PoolClient
}

export interface InsertWithPrefixedNumberRetryResult<T> {
  row: T
  /** Generic name for the minted number; wrappers re-alias as needed. */
  number: string
}

/**
 * Retry an INSERT whose unique column is filled with a `makePrefixedNumber()`
 * candidate, restarting with a fresh number on Postgres `23505` (unique
 * violation). Domain-neutral primitive — concrete callers (transactions,
 * invoices) wrap this with their own default prefix / savepoint name.
 */
export async function insertWithPrefixedNumberRetry<T extends PrefixedNumberInsertRow>(
  insertWithNumber: (number: string) => Promise<{ rows: T[] }>,
  options: InsertWithPrefixedNumberRetryOptions,
): Promise<InsertWithPrefixedNumberRetryResult<T> | null> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY_ATTEMPTS
  const pgClient = options.client
  const savepoint = options.savepointName
  let number = ""
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    number = makePrefixedNumber(options.prefix)
    try {
      if (pgClient) {
        await pgClient.query(`SAVEPOINT ${savepoint}`)
      }
      const res = await insertWithNumber(number)
      const row = res.rows[0]
      if (row?.id) {
        if (pgClient) {
          await pgClient.query(`RELEASE SAVEPOINT ${savepoint}`)
        }
        return { row, number }
      }
      if (pgClient) {
        await pgClient.query(`RELEASE SAVEPOINT ${savepoint}`)
      }
    } catch (e: unknown) {
      if (pgClient) {
        await pgClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => undefined)
      }
      const code = String((e as { code?: string })?.code || "")
      if (code === "23505") continue
      throw e
    }
  }
  return null
}
