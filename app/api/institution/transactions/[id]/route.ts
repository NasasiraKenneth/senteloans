import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const txRes = await client.query(
        `SELECT id, institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status, created_at FROM senteloans_transactions WHERE id = $1`,
        [id]
      )
      const tx = txRes.rows[0]
      if (!tx) return null

      let clientName = ""
      if (tx.client_id) {
        const cRes = await client.query(`SELECT id, full_name FROM senteloans_clients WHERE id = $1`, [tx.client_id])
        clientName = cRes.rows[0]?.full_name || ""
      }
      let accountNumber = ""
      if (tx.account_id) {
        const aRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = $1`, [tx.account_id])
        accountNumber = aRes.rows[0]?.account_number || ""
      }
      let loanApplicationId = ""
      if (tx.loan_id) {
        const lRes = await client.query(`SELECT id, application_id FROM senteloans_loans WHERE id = $1`, [tx.loan_id])
        loanApplicationId = lRes.rows[0]?.application_id || ""
      }
      let processedByName = ""
      if (tx.processed_by) {
        const uRes = await client.query(`SELECT id, full_name FROM senteloans_users WHERE id = $1`, [tx.processed_by])
        processedByName = uRes.rows[0]?.full_name || ""
      }

      return {
        transaction: {
          id: tx.id,
          institution_id: tx.institution_id,
          transaction_number: tx.transaction_number,
          type: tx.type,
          amount: tx.amount,
          mode: tx.mode,
          description: tx.description,
          reference_number: tx.reference_number,
          balance_before: tx.balance_before,
          balance_after: tx.balance_after,
          transaction_date: tx.transaction_date,
          status: tx.status,
          created_at: tx.created_at,
          client_id: tx.client_id,
          client_name: clientName,
          account_id: tx.account_id,
          account_number: accountNumber,
          loan_id: tx.loan_id,
          loan_application_id: loanApplicationId,
          processed_by: tx.processed_by,
          processed_by_name: processedByName,
        },
      }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
