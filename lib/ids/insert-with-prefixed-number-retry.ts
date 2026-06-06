import type { PoolClient } from "pg"
import { makePrefixedNumber } from "./prefixed-number"

export const DEFAULT_RETRY_ATTEMPTS = 5

export type PrefixedNumberInsertRow = { id: string }

export interface InsertWithPrefixedNumberRetryOptions {
  /**
   * Prefix passed to the default `makePrefixedNumber` (e.g. "TXN", "INV").
   * Ignored when a custom `generateNumber` is supplied.
   */
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
  /**
   * Override the candidate-number generator. Defaults to
   * `makePrefixedNumber(prefix)`. Use this when the caller wants a different
   * format (e.g. members keep their compact `M{INST}-{YYMM}-{RAND}` style).
   */
  generateNumber?: () => string
  /**
   * Predicate to decide whether a Postgres `23505` unique violation should
   * trigger a retry. Useful when the target table has multiple unique
   * constraints (e.g. `senteloans_members` has both `member_number` and
   * `national_id`) and only one of them should be retried with a fresh
   * candidate. Default: retry on every `23505`.
   */
  shouldRetryOnUniqueViolation?: (err: unknown) => boolean
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
  const generate = options.generateNumber ?? (() => makePrefixedNumber(options.prefix))
  let number = ""
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    number = generate()
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
      if (code === "23505") {
        const retry = options.shouldRetryOnUniqueViolation
          ? options.shouldRetryOnUniqueViolation(e)
          : true
        if (retry) continue
      }
      throw e
    }
  }
  return null
}
