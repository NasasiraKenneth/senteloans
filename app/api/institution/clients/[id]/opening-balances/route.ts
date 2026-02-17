import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/clients/[id]/opening-balances
 * Returns the client's current savings accounts, active loans, and opening_balance_recorded flag
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return null

      // Verify client belongs to same institution
      const clientRes = await client.query(
        `SELECT id, opening_balance_recorded FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
        [clientId, actor.institution_id]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return null

      // Get savings accounts
      const savingsRes = await client.query(
        `SELECT id, account_number, account_type, available_balance, total_balance, status
         FROM senteloans_savings_accounts
         WHERE client_id = $1 AND institution_id = $2
         ORDER BY created_at`,
        [clientId, actor.institution_id]
      )

      // Get active loans
      const loansRes = await client.query(
        `SELECT l.id, l.application_id, l.principal_amount, l.outstanding_balance, l.status, l.tenure_months, l.interest_rate,
                lp.product_name
         FROM senteloans_loans l
         LEFT JOIN senteloans_loan_products lp ON lp.id = l.loan_product_id
         WHERE l.client_id = $1 AND l.institution_id = $2
         ORDER BY l.created_at`,
        [clientId, actor.institution_id]
      )

      // Get loan products for creating opening balance loans
      const productsRes = await client.query(
        `SELECT id, product_name, product_code, interest_rate, minimum_tenure_months, maximum_tenure_months
         FROM senteloans_loan_products
         WHERE institution_id = $1 AND status = 'Active'
         ORDER BY product_name`,
        [actor.institution_id]
      )

      return {
        openingBalanceRecorded: clientRow.opening_balance_recorded,
        savingsAccounts: savingsRes.rows,
        loans: loansRes.rows,
        loanProducts: productsRes.rows,
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * POST /api/institution/clients/[id]/opening-balances
 * Records opening balances for savings and/or loans
 * Body: {
 *   savingsBalance?: number          - Opening savings balance (sets available_balance & total_balance on existing account)
 *   savingsAccountId?: string        - Which savings account to update (uses first if not specified)
 *   loanOutstandingBalance?: number  - Opening loan outstanding balance
 *   loanProductId?: string           - Which loan product for the opening loan
 *   loanTenureMonths?: number        - Remaining tenure for the opening loan
 *   loanInterestRate?: number        - Interest rate override (uses product default if not set)
 * }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const savingsBalance = typeof body.savingsBalance === "number" ? body.savingsBalance : (typeof body.savingsBalance === "string" ? Number(body.savingsBalance) : null)
    const savingsAccountId = typeof body.savingsAccountId === "string" ? body.savingsAccountId : null
    const loanOutstandingBalance = typeof body.loanOutstandingBalance === "number" ? body.loanOutstandingBalance : (typeof body.loanOutstandingBalance === "string" ? Number(body.loanOutstandingBalance) : null)
    const loanProductId = typeof body.loanProductId === "string" ? body.loanProductId : null
    const loanTenureMonths = typeof body.loanTenureMonths === "number" ? body.loanTenureMonths : (typeof body.loanTenureMonths === "string" ? Number(body.loanTenureMonths) : null)
    const loanInterestRate = typeof body.loanInterestRate === "number" ? body.loanInterestRate : (typeof body.loanInterestRate === "string" ? Number(body.loanInterestRate) : null)

    const hasSavings = savingsBalance !== null && Number.isFinite(savingsBalance) && savingsBalance > 0
    const hasLoan = loanOutstandingBalance !== null && Number.isFinite(loanOutstandingBalance) && loanOutstandingBalance > 0

    if (!hasSavings && !hasLoan) {
      return NextResponse.json({ error: "Provide at least a savings balance or loan outstanding balance" }, { status: 400 })
    }

    if (hasLoan && !loanProductId) {
      return NextResponse.json({ error: "Loan product is required for opening loan balance" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      // Verify client
      const clientRes = await client.query(
        `SELECT id, institution_id, client_number FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
        [clientId, actor.institution_id]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }

      const txDate = new Date().toISOString()
      const results: { savingsUpdated?: boolean; loanCreated?: boolean; loanId?: string } = {}

      // --- SAVINGS OPENING BALANCE ---
      if (hasSavings) {
        // Find the savings account to update
        let accountId = savingsAccountId
        if (!accountId) {
          const accRes = await client.query(
            `SELECT id FROM senteloans_savings_accounts WHERE client_id = $1 AND institution_id = $2 ORDER BY created_at LIMIT 1`,
            [clientId, actor.institution_id]
          )
          accountId = accRes.rows[0]?.id
        }

        if (!accountId) {
          return { error: "no_savings_account" as const }
        }

        // Verify account belongs to this client
        const accVerify = await client.query(
          `SELECT id, available_balance FROM senteloans_savings_accounts WHERE id = $1 AND client_id = $2 AND institution_id = $3`,
          [accountId, clientId, actor.institution_id]
        )
        if (!accVerify.rows[0]) return { error: "savings_account_not_found" as const }

        const balanceBefore = Number(accVerify.rows[0].available_balance) || 0

        // Update savings account balances
        await client.query(
          `UPDATE senteloans_savings_accounts
           SET available_balance = $1, total_balance = $1, last_transaction_date = $2
           WHERE id = $3`,
          [savingsBalance, txDate.slice(0, 10), accountId]
        )

        // Create an Opening Balance transaction for audit
        const savTxNumber = `OB-SAV-${Date.now()}`
        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, $4, 'Opening Balance', $5, 'Cash', $6, '', $7, $8, $9, $10, 'Completed')`,
          [actor.institution_id, clientId, accountId, savTxNumber, savingsBalance, "Opening savings balance from previous system", balanceBefore, savingsBalance, actor.id, txDate]
        )

        results.savingsUpdated = true
      }

      // --- LOAN OPENING BALANCE ---
      if (hasLoan && loanProductId) {
        // Verify loan product belongs to institution
        const prodRes = await client.query(
          `SELECT id, product_name, interest_rate, minimum_tenure_months FROM senteloans_loan_products WHERE id = $1 AND institution_id = $2`,
          [loanProductId, actor.institution_id]
        )
        const product = prodRes.rows[0]
        if (!product) return { error: "loan_product_not_found" as const }

        const interestRate = loanInterestRate ?? Number(product.interest_rate)
        const tenure = loanTenureMonths ?? Number(product.minimum_tenure_months)
        const now = new Date()
        const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
        const applicationId = `OB-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

        // Create loan record with status "Active" and outstanding balance
        const loanRes = await client.query(
          `INSERT INTO senteloans_loans
            (institution_id, client_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, outstanding_balance, status, purpose, application_date, approval_date, disbursement_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active', $9, $10, $10, $10, $11)
           RETURNING id`,
          [actor.institution_id, clientId, loanProductId, applicationId, loanOutstandingBalance, interestRate, tenure, loanOutstandingBalance, "Opening balance loan from previous system", txDate.slice(0, 10), actor.id]
        )
        const loanRow = loanRes.rows[0]
        if (!loanRow) return { error: "loan_creation_failed" as const }

        // Create an Opening Balance transaction for audit (linked to loan)
        const loanTxNumber = `OB-LN-${Date.now()}`
        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, $3, $4, 'Opening Balance', $5, 'Cash', $6, '', 0, $7, $8, $9, 'Completed')`,
          [actor.institution_id, clientId, loanRow.id, loanTxNumber, loanOutstandingBalance, "Opening loan balance from previous system", loanOutstandingBalance, actor.id, txDate]
        )

        results.loanCreated = true
        results.loanId = loanRow.id
      }

      // Mark client as having opening balances recorded
      await client.query(
        `UPDATE senteloans_clients SET opening_balance_recorded = TRUE WHERE id = $1`,
        [clientId]
      )

      // Audit log
      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values)
         VALUES ($1, $2, 'senteloans_clients', 'UPDATE', $3, $4)`,
        [actor.institution_id, actor.id, clientId, JSON.stringify({
          action: "opening_balances",
          savingsBalance: hasSavings ? savingsBalance : null,
          loanOutstandingBalance: hasLoan ? loanOutstandingBalance : null,
        })]
      )

      return { ok: true, ...results }
    })

    if (result && "error" in result) {
      const status =
        result.error === "client_not_found" || result.error === "savings_account_not_found" || result.error === "loan_product_not_found" ? 404 :
        result.error === "no_savings_account" ? 400 :
        400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
