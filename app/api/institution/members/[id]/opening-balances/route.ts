import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addMonthsDateOnly, buildRepaymentSchedule } from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

type RepaymentRow = {
  installmentNumber: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  totalAmount: number
}

const reconcilePendingScheduleToOutstanding = (rows: RepaymentRow[], targetOutstanding: number): RepaymentRow[] => {
  if (rows.length === 0) return rows
  const target = round2(Math.max(0, Number(targetOutstanding) || 0))
  const current = round2(rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0))
  const diff = round2(target - current)
  if (Math.abs(diff) < 0.01) return rows

  const adjusted = rows.map((r) => ({ ...r }))
  const lastIdx = adjusted.length - 1
  const last = adjusted[lastIdx]
  const newTotal = round2(Math.max(0, Number(last.totalAmount || 0) + diff))
  const interest = round2(Math.max(0, Number(last.interestAmount || 0)))
  const principal = newTotal >= interest ? round2(newTotal - interest) : 0

  adjusted[lastIdx] = {
    ...last,
    totalAmount: newTotal,
    principalAmount: principal,
    interestAmount: newTotal >= interest ? interest : newTotal,
  }
  return adjusted
}

/**
 * GET /api/institution/members/[id]/opening-balances
 * Returns the member's current savings accounts, active loans, and opening_balance_recorded flag
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.opening_balances.get.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.opening_balances.get.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      // Verify member belongs to same institution
      const memberRes = await client.query(
        `SELECT id, opening_balance_recorded FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, actor.institution_id]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return null

      // Get savings accounts
      const savingsRes = await client.query(
        `SELECT id, account_number, account_type, available_balance, total_balance, status
         FROM savings_accounts
         WHERE member_id = $1 AND institution_id = $2
         ORDER BY created_at`,
        [memberId, actor.institution_id]
      )

      // Get active loans
      const loansRes = await client.query(
        `SELECT l.id, l.application_id, l.principal_amount, l.outstanding_balance, l.status, l.tenure_months, l.interest_rate,
                lp.product_name
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.member_id = $1 AND l.institution_id = $2
         ORDER BY l.created_at`,
        [memberId, actor.institution_id]
      )

      // Get loan products for creating opening balance loans
      const productsRes = await client.query(
        `SELECT id, product_name, product_code, interest_rate, interest_calculation_method, minimum_tenure_months, maximum_tenure_months
         FROM loan_products
         WHERE institution_id = $1 AND status = 'Active'
         ORDER BY product_name`,
        [actor.institution_id]
      )

      return {
        openingBalanceRecorded: memberRow.opening_balance_recorded,
        savingsAccounts: savingsRes.rows,
        loans: loansRes.rows,
        loanProducts: productsRes.rows,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:view_members" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.opening_balances.get.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.opening_balances.get.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * POST /api/institution/members/[id]/opening-balances
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
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.opening_balances.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.opening_balances.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

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
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }

      if (hasSavings) {
        const allowedSavings = await hasPermission(client, actor, "edit_opening_savings")
        if (!allowedSavings) return { error: "missing_permission:edit_opening_savings" as const }
      }
      if (hasLoan) {
        const allowedLoans = await hasPermission(client, actor, "edit_opening_loans")
        if (!allowedLoans) return { error: "missing_permission:edit_opening_loans" as const }
      }

      const memberRes = await client.query(
        `SELECT id, institution_id, member_number FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, actor.institution_id]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      const txDate = new Date().toISOString()
      const results: { savingsUpdated?: boolean; loanCreated?: boolean; loanId?: string } = {}

      // --- SAVINGS OPENING BALANCE ---
      if (hasSavings) {
        let accountId = savingsAccountId
        if (!accountId) {
          const accRes = await client.query(
            `SELECT id FROM savings_accounts WHERE member_id = $1 AND institution_id = $2 ORDER BY created_at LIMIT 1`,
            [memberId, actor.institution_id]
          )
          accountId = accRes.rows[0]?.id
        }

        if (!accountId) {
          return { error: "no_savings_account" as const }
        }

        const accVerify = await client.query(
          `SELECT id, available_balance FROM savings_accounts WHERE id = $1 AND member_id = $2 AND institution_id = $3`,
          [accountId, memberId, actor.institution_id]
        )
        if (!accVerify.rows[0]) return { error: "savings_account_not_found" as const }

        const balanceBefore = Number(accVerify.rows[0].available_balance) || 0

        await client.query(
          `UPDATE savings_accounts
           SET available_balance = $1, total_balance = $1, last_transaction_date = $2
           WHERE id = $3`,
          [savingsBalance, txDate.slice(0, 10), accountId]
        )

        const savTxNumber = `OB-SAV-${Date.now()}`
        const savingsTxRes = await client.query(
          `INSERT INTO transactions
            (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, $4, 'Opening Balance', $5, 'Cash', $6, '', $7, $8, $9, $10, 'Completed')
           RETURNING id`,
          [actor.institution_id, memberId, accountId, savTxNumber, savingsBalance, "Opening savings balance from previous system", balanceBefore, savingsBalance, actor.id, txDate]
        )
        const savingsTxId = savingsTxRes.rows[0]?.id
        if (savingsTxId) {
          await auditLogger.logInsert(
            "transactions",
            savingsTxId,
            {
              member_id: memberId,
              account_id: accountId,
              transaction_number: savTxNumber,
              type: "Opening Balance",
              amount: savingsBalance,
              mode: "Cash",
              description: "Opening savings balance from previous system",
              balance_before: balanceBefore,
              balance_after: savingsBalance,
              processed_by: actor.id,
              status: "Completed",
            },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }

        results.savingsUpdated = true
      }

      // --- LOAN OPENING BALANCE ---
      if (hasLoan && loanProductId) {
        const prodRes = await client.query(
          `SELECT id, product_name, interest_rate, interest_calculation_method, minimum_tenure_months FROM loan_products WHERE id = $1 AND institution_id = $2`,
          [loanProductId, actor.institution_id]
        )
        const product = prodRes.rows[0]
        if (!product) return { error: "loan_product_not_found" as const }

        const interestRate = loanInterestRate ?? Number(product.interest_rate)
        const remainingTenure = Math.floor(loanTenureMonths ?? Number(product.minimum_tenure_months))
        const principalAmount = loanPrincipalAmount ?? loanOutstandingBalance!
        const originalTenure = Math.floor(loanOriginalTenure ?? remainingTenure)

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

        // Build schedules from original loan terms where possible, then reconcile pending to entered outstanding.
        let paidSchedule: RepaymentRow[] = []
        let pendingSchedule: RepaymentRow[] = []
        if (principalAmount > 0 && originalTenure > 0 && originalTenure >= remainingTenure) {
          const fullSchedule = buildRepaymentSchedule({
            principal: principalAmount,
            annualRate: interestRate,
            tenureMonths: originalTenure,
            method: product.interest_calculation_method,
            startDate: disbursementDate,
          })
          paidSchedule = fullSchedule.slice(0, elapsedMonths)
          pendingSchedule = fullSchedule
            .slice(elapsedMonths, elapsedMonths + remainingTenure)
            .map((row, idx) => ({
              ...row,
              installmentNumber: elapsedMonths + idx + 1,
            }))
        } else {
          pendingSchedule = buildRepaymentSchedule({
            principal: loanOutstandingBalance!,
            annualRate: interestRate,
            tenureMonths: remainingTenure,
            method: product.interest_calculation_method,
            startDate: addMonthsDateOnly(nextPaymentDate, -1),
            installmentOffset: elapsedMonths,
          })
        }
        pendingSchedule = reconcilePendingScheduleToOutstanding(pendingSchedule, loanOutstandingBalance!)
        const monthlyPayment = pendingSchedule[0]?.totalAmount ?? round2(loanOutstandingBalance! / Math.max(remainingTenure, 1))
        const totalAmount = round2(loanOutstandingBalance!)

        const now = new Date()
        const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
        const applicationId = `OB-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

        const loanRes = await client.query(
          `INSERT INTO loans
            (institution_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, outstanding_balance, status, purpose, application_date, approved_at, disbursement_date, maturity_date, next_payment_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, $12, $12, $13, $14, $15, $16)
           RETURNING id`,
          [
            actor.institution_id, memberId, loanProductId, applicationId,
            principalAmount, interestRate, remainingTenure,
            monthlyPayment, totalAmount, loanOutstandingBalance,
            "Opening balance loan from previous system",
            disbursementDate, disbursementDate, maturityDate, nextPaymentDate,
            actor.id,
          ]
        )
        const loanRow = loanRes.rows[0]
        if (!loanRow) return { error: "loan_creation_failed" as const }

        // --- Generate repayment schedule for migration ---
        // Past installments (already paid in previous system) are marked Paid.
        if (paidSchedule.length > 0) {
          for (let i = 0; i < paidSchedule.length; i++) {
            const row = paidSchedule[i]
            const paidPaymentDate = loanLastPaymentDate && i === paidSchedule.length - 1
              ? loanLastPaymentDate
              : row.dueDate
            await client.query(
              `INSERT INTO loan_repayments
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
            `INSERT INTO loan_repayments
              (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_paid, status)
             VALUES ($1, $2, $3, $4, $5, 0, 'Pending')
             ON CONFLICT (loan_id, installment_number) DO NOTHING`,
            [loanRow.id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount]
          )
        }

        const totalPayable = round2(
          (paidSchedule.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)) +
          (pendingSchedule.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0))
        )
        const amountAlreadyPaid = round2(Math.max(0, totalPayable - Number(loanOutstandingBalance || 0)))
        const loanTxNumber = `OB-LN-${Date.now()}`
        const loanTxRes = await client.query(
          `INSERT INTO transactions
            (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, $3, $4, 'Loan Repayment', $5, 'Cash', $6, $4, $7, $8, $9, $10, 'Completed')
           RETURNING id`,
          [actor.institution_id, memberId, loanRow.id, loanTxNumber, amountAlreadyPaid, "Migrated repayments from previous system", totalPayable, loanOutstandingBalance, actor.id, txDate]
        )
        const loanTxId = loanTxRes.rows[0]?.id
        if (loanTxId) {
          await auditLogger.logInsert(
            "transactions",
            loanTxId,
            {
              member_id: memberId,
              loan_id: loanRow.id,
              transaction_number: loanTxNumber,
              type: "Loan Repayment",
              amount: amountAlreadyPaid,
              mode: "Cash",
              description: "Migrated repayments from previous system",
              balance_before: totalPayable,
              balance_after: loanOutstandingBalance,
              processed_by: actor.id,
              status: "Completed",
            },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }

        results.loanCreated = true
        results.loanId = loanRow.id
      }

      await client.query(
        `UPDATE members SET opening_balance_recorded = TRUE WHERE id = $1`,
        [memberId]
      )
      await auditLogger.logUpdate(
        "members",
        memberId,
        { opening_balance_recorded: false },
        { opening_balance_recorded: true },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      await auditLogger.logUpdate(
        "members",
        memberId,
        {},
        {
          action: "opening_balances",
          savingsBalance: hasSavings ? savingsBalance : null,
          loanPrincipalAmount: hasLoan ? (loanPrincipalAmount ?? loanOutstandingBalance) : null,
          loanOutstandingBalance: hasLoan ? loanOutstandingBalance : null,
          loanOriginalTenure: hasLoan ? (loanOriginalTenure ?? loanTenureMonths) : null,
          loanRemainingTenure: hasLoan ? loanTenureMonths : null,
          loanLastPaymentDate: hasLoan ? loanLastPaymentDate : null,
        },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      return { ok: true, ...results }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" || result.error === "savings_account_not_found" || result.error === "loan_product_not_found" ? 404 :
        result.error === "missing_permission:edit_opening_savings" || result.error === "missing_permission:edit_opening_loans" ? 403 :
        result.error === "no_savings_account" ? 400 :
        400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.opening_balances.create.success", { method: "POST", apiPath, status: 201, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.opening_balances.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
