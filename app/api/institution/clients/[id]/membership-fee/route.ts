import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      const clientRes = await client.query(
        `SELECT id, membership_fee_paid FROM senteloans_clients WHERE institution_id = $1 AND id = $2`,
        [appUser.institution_id, clientId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return null

      const instRes = await client.query(
        `SELECT settings FROM senteloans_institutions WHERE id = $1`,
        [appUser.institution_id]
      )
      const settings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof settings.membershipFee === "number" ? settings.membershipFee : 0

      // Fetch membership fee payment history from transactions
      const txRes = await client.query(
        `SELECT id, transaction_number, amount, mode, description, reference_number, transaction_date, status
         FROM senteloans_transactions
         WHERE institution_id = $1 AND client_id = $2 AND type = 'Fee Payment'
         ORDER BY transaction_date DESC`,
        [appUser.institution_id, clientId]
      )

      return {
        membershipFee,
        membershipFeePaid: Number(clientRow.membership_fee_paid) || 0,
        payments: txRes.rows,
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : "Membership fee payment"
    const referenceNumber = typeof body.reference_number === "string" ? body.reference_number : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      const clientRes = await client.query(
        `SELECT id, institution_id, membership_fee_paid, status FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }
      if (clientRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const instRes = await client.query(
        `SELECT settings FROM senteloans_institutions WHERE id = $1`,
        [actor.institution_id]
      )
      const settings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof settings.membershipFee === "number" ? settings.membershipFee : 0

      const currentPaid = Number(clientRow.membership_fee_paid) || 0
      const remaining = membershipFee - currentPaid

      if (membershipFee > 0 && amount > remaining + 0.01) {
        return { error: "amount_exceeds_remaining" as const, remaining }
      }

      const newPaid = currentPaid + amount
      const transactionNumber = `FEE-${Date.now()}`
      const txDate = new Date().toISOString()

      // balance_before = remaining before payment, balance_after = remaining after payment
      const balanceBefore = membershipFee - currentPaid
      const balanceAfter = membershipFee - newPaid

      // Create the Fee Payment transaction (account_id and loan_id are NULL)
      const txRes = await client.query(
        `INSERT INTO senteloans_transactions
          (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
         VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, $7, $8, $9, $10, $11, 'Completed')
         RETURNING id`,
        [actor.institution_id, clientId, transactionNumber, amount, mode, description, referenceNumber, balanceBefore, balanceAfter, actor.id, txDate]
      )
      const txRow = txRes.rows[0]
      if (!txRow) return { error: "insert_failed" as const }

      // Update the client's membership_fee_paid
      await client.query(
        `UPDATE senteloans_clients SET membership_fee_paid = $1 WHERE id = $2`,
        [newPaid, clientId]
      )

      // Audit log
      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values)
         VALUES ($1, $2, 'senteloans_transactions', 'INSERT', $3, $4)`,
        [actor.institution_id, actor.id, txRow.id, JSON.stringify({ transaction_number: transactionNumber, type: "Fee Payment", amount, client_id: clientId })]
      )

      return {
        ok: true,
        transactionId: txRow.id,
        transactionNumber,
        membershipFeePaid: newPaid,
        membershipFee,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_forbidden" ? 403 :
        result.error === "client_not_found" ? 404 :
        400
      const body: Record<string, unknown> = { error: result.error }
      if ("remaining" in result) body.remaining = (result as any).remaining
      return NextResponse.json(body, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
