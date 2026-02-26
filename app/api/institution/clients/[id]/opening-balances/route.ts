import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addMonthsDateOnly, buildRepaymentSchedule, calculateLoanTerms } from "@/lib/loans/calculations"

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
        `SELECT id, product_name, product_code, interest_rate, interest_calculation_method, minimum_tenure_months, maximum_tenure_months
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
 * Records opening balances for savings and/or loans.
 * When loan fields are provided, creates a full loan lifecycle with repayment schedule.
 *
 * Body: {
 *   savingsBalance?: number           - Opening savings balance
 *   savingsAccountId?: string         - Which savings account to update (uses first if not specified)
 *   loanOutstandingBalance?: number   - Current outstanding loan balance
 *   loanProductId?: string            - Loan product for the opening loan
 *   loanTenureMonths?: number         - Remaining tenure (months still to pay)
 *   loanInterestRate?: number         - Interest rate override (uses product default if not set)
 *   loanPrincipalAmount?: number      - Original principal amount of the loan
 *   loanLastPaymentDate?: string      - Date of the last payment in the previous system (YYYY-MM-DD)
 *   loanOriginalTenure?: number       - Original total tenure of the loan in months
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

    const parseNum = (val: unknown): number | null => {
      if (typeof val === "number") return val
      if (typeof val === "string" && val.trim()) { const n = Number(val); return Number.isFinite(n) ? n : null }
      return null
    }

    const savingsBalance = parseNum(body.savingsBalance)
    const savingsAccountId = typeof body.savingsAccountId === "string" ? body.savingsAccountId : null
    const loanOutstandingBalance = parseNum(body.loanOutstandingBalance)
    const loanProductId = typeof body.loanProductId === "string" ? body.loanProductId : null
    const loanTenureMonths = parseNum(body.loanTenureMonths)
    const loanInterestRate = parseNum(body.loanInterestRate)
    const loanPrincipalAmount = parseNum(body.loanPrincipalAmount)
    const loanLastPaymentDate = typeof body.loanLastPaymentDate === "string" && body.loanLastPaymentDate.trim() ? body.loanLastPaymentDate.trim() : null
    const loanOriginalTenure = parseNum(body.loanOriginalTenure)

    const hasSavings = savingsBalance !== null && Number.isFinite(savingsBalance) && savingsBalance > 0
    const hasLoan = loanOutstandingBalance !== null && Number.isFinite(loanOutstandingBalance) && loanOutstandingBalance > 0

    if (!hasSavings && !hasLoan) {
      return NextResponse.json({ error: "Provide at least a savings balance or loan outstanding balance" }, { status: 400 })
    }

    if (hasLoan && !loanProductId) {
      return NextResponse.json({ error: "Loan product is required for opening loan balance" }, { status: 400 })
    }

    if (hasLoan && loanPrincipalAmount !== null && loanPrincipalAmount < loanOutstandingBalance!) {
      return NextResponse.json({ error: "Original principal amount cannot be less than the outstanding balance" }, { status: 400 })
    }

    if (hasLoan && loanOriginalTenure !== null && loanTenureMonths !== null && loanOriginalTenure < loanTenureMonths) {
      return NextResponse.json({ error: "Original tenure cannot be less than remaining tenure" }, { status: 400 })
    }
    if (hasLoan && (loanTenureMonths === null || !Number.isFinite(loanTenureMonths) || loanTenureMonths <= 0)) {
      return NextResponse.json({ error: "Remaining tenure is required and must be greater than zero" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

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

        const accVerify = await client.query(
          `SELECT id, available_balance FROM senteloans_savings_accounts WHERE id = $1 AND client_id = $2 AND institution_id = $3`,
          [accountId, clientId, actor.institution_id]
        )
        if (!accVerify.rows[0]) return { error: "savings_account_not_found" as const }

        const balanceBefore = Number(accVerify.rows[0].available_balance) || 0

        await client.query(
          `UPDATE senteloans_savings_accounts
           SET available_balance = $1, total_balance = $1, last_transaction_date = $2
           WHERE id = $3`,
          [savingsBalance, txDate.slice(0, 10), accountId]
        )

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
        const prodRes = await client.query(
          `SELECT id, product_name, interest_rate, interest_calculation_method, minimum_tenure_months FROM senteloans_loan_products WHERE id = $1 AND institution_id = $2`,
          [loanProductId, actor.institution_id]
        )
        const product = prodRes.rows[0]
        if (!product) return { error: "loan_product_not_found" as const }

        const interestRate = loanInterestRate ?? Number(product.interest_rate)
        const remainingTenure = Math.floor(loanTenureMonths ?? Number(product.minimum_tenure_months))
        const principalAmount = loanPrincipalAmount ?? loanOutstandingBalance!
        const originalTenure = Math.floor(loanOriginalTenure ?? remainingTenure)

        // Opening-balance loans should use the same calculation method as the selected product.
        const terms = calculateLoanTerms(
          loanOutstandingBalance!,
          interestRate,
          remainingTenure,
          product.interest_calculation_method
        )
        const monthlyPayment = terms.monthlyPayment
        const totalAmount = terms.totalAmount

        // Determine key dates
        const todayStr = txDate.slice(0, 10)
        const elapsedMonths = originalTenure - remainingTenure
        const disbursementDate = loanLastPaymentDate
          ? addMonthsDateOnly(loanLastPaymentDate, -elapsedMonths)
          : todayStr
        const nextPaymentDate = loanLastPaymentDate
          ? addMonthsDateOnly(loanLastPaymentDate, 1)
          : addMonthsDateOnly(todayStr, 1)
        const maturityDate = addMonthsDateOnly(nextPaymentDate, remainingTenure - 1)

        const now = new Date()
        const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
        const applicationId = `OB-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

        const loanRes = await client.query(
          `INSERT INTO senteloans_loans
            (institution_id, client_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, outstanding_balance, status, purpose, application_date, approval_date, disbursement_date, maturity_date, next_payment_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, $12, $12, $13, $14, $15, $16)
           RETURNING id`,
          [
            actor.institution_id, clientId, loanProductId, applicationId,
            principalAmount, interestRate, remainingTenure,
            monthlyPayment, totalAmount, loanOutstandingBalance,
            "Opening balance loan from previous system",
            disbursementDate, disbursementDate, maturityDate, nextPaymentDate,
            actor.id,
          ]
        )
        const loanRow = loanRes.rows[0]
        if (!loanRow) return { error: "loan_creation_failed" as const }

        // --- Generate repayment schedule for the remaining tenure ---
        // Past installments (already paid in the previous system) are marked as Paid
        const pendingSchedule = buildRepaymentSchedule({
          principal: loanOutstandingBalance!,
          annualRate: interestRate,
          tenureMonths: remainingTenure,
          method: product.interest_calculation_method,
          startDate: addMonthsDateOnly(nextPaymentDate, -1),
          installmentOffset: elapsedMonths,
        })

        // Insert paid installments for elapsed period (historical record), using method-based schedule.
        if (elapsedMonths > 0) {
          const historicalSchedule = buildRepaymentSchedule({
            principal: principalAmount,
            annualRate: interestRate,
            tenureMonths: originalTenure,
            method: product.interest_calculation_method,
            startDate: disbursementDate,
          })
          const paidRows = historicalSchedule.slice(0, elapsedMonths)
          for (let i = 0; i < paidRows.length; i++) {
            const row = paidRows[i]
            const paidPaymentDate = loanLastPaymentDate && i === paidRows.length - 1
              ? loanLastPaymentDate
              : row.dueDate
            await client.query(
              `INSERT INTO senteloans_loan_repayments
                (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_paid, payment_date, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'Paid')
               ON CONFLICT (loan_id, installment_number) DO NOTHING`,
              [loanRow.id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount, paidPaymentDate]
            )
          }
        }

        // Insert remaining (future) installments as Pending
        for (const row of pendingSchedule) {
          await client.query(
            `INSERT INTO senteloans_loan_repayments
              (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_paid, status)
             VALUES ($1, $2, $3, $4, $5, 0, 'Pending')
             ON CONFLICT (loan_id, installment_number) DO NOTHING`,
            [loanRow.id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount]
          )
        }

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

      await client.query(
        `UPDATE senteloans_clients SET opening_balance_recorded = TRUE WHERE id = $1`,
        [clientId]
      )

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values)
         VALUES ($1, $2, 'senteloans_clients', 'UPDATE', $3, $4)`,
        [actor.institution_id, actor.id, clientId, JSON.stringify({
          action: "opening_balances",
          savingsBalance: hasSavings ? savingsBalance : null,
          loanPrincipalAmount: hasLoan ? (loanPrincipalAmount ?? loanOutstandingBalance) : null,
          loanOutstandingBalance: hasLoan ? loanOutstandingBalance : null,
          loanOriginalTenure: hasLoan ? (loanOriginalTenure ?? loanTenureMonths) : null,
          loanRemainingTenure: hasLoan ? loanTenureMonths : null,
          loanLastPaymentDate: hasLoan ? loanLastPaymentDate : null,
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
