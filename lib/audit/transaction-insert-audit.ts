import type { PoolClient } from "pg"

/** Matches manual audit pattern in POST /api/institution/transactions */
export async function insertTransactionInsertAuditLog(
  client: PoolClient,
  input: {
    institutionId: string
    branchId: string
    userId: string
    transactionId: string
    newValues: Record<string, unknown>
  },
): Promise<void> {
  await client.query(
    `INSERT INTO senteloans_audit_logs (
       institution_id, branch_id, user_id, table_name, category, operation, record_id, new_values
     )
     VALUES ($1, $2, $3, 'senteloans_transactions', 'transactions', 'INSERT', $4, $5)`,
    [
      input.institutionId,
      input.branchId,
      input.userId,
      input.transactionId,
      JSON.stringify(input.newValues),
    ],
  )
}
