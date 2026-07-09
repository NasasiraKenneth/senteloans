import type { PoolClient } from "pg"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"

export type ExpenseInsertRow = { id: string }

/**
 * Retries INSERT when expense_number collides (Postgres 23505).
 */
export async function insertWithExpenseNumberRetry<T extends ExpenseInsertRow>(
  insertWithNumber: (expenseNumber: string) => Promise<{ rows: T[] }>,
  options?: { maxAttempts?: number; client?: PoolClient },
): Promise<{ row: T; expenseNumber: string } | null> {
  const result = await insertWithPrefixedNumberRetry(insertWithNumber, {
    prefix: "EXP",
    savepointName: "sp_ins_exp_num_retry",
    maxAttempts: options?.maxAttempts,
    client: options?.client,
  })
  if (!result) return null
  return { row: result.row, expenseNumber: result.number }
}
