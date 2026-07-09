import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { addMonthsDateOnly, buildRepaymentSchedule } from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { resolveActorContext, hasPermission, assertNotSuperAdmin, SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertMemberActive } from "@/lib/members/member-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { applyDailyFinanceEntry } from "@/lib/finances/daily-finance"
import { getBranchBankAccount, adjustBankAccountBalance, type BankAccountRow } from "@/lib/finances/bank-account"
import { notifyOpeningBalance } from "@/lib/notifications/opening-balance-events"
import { enqueueOpeningBalanceEmails, type OpeningBalanceEmailContext } from "@/lib/email/opening-balance-emails"

type OpeningBalanceSavingsAccountRecorded = {
  accountId: string
  accountNumber: string
  accountType: string
  openingBalance: number
}

type OpeningBalanceLoanRecorded = {
  loanId: string
  applicationId: string
  productName: string
  principalAmount: number
  amountPaid: number
  outstanding: number
}

type OpeningBalancePostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  member: { id: string; full_name: string; member_number: string; email: string }
  savings: {
    amount: number
    accountId: string | null
    accounts: OpeningBalanceSavingsAccountRecorded[]
  } | null
  loan: OpeningBalanceLoanRecorded | null
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

type OpeningBalanceErrorCode =
  | "no_savings_account"
  | "savings_account_not_found"
  | "loan_product_not_found"
  | "loan_creation_failed"
  | "bank_account_insufficient_funds"

/**
 * Thrown inside the write transaction so a single catch can ROLLBACK and map the
 * failure back to an HTTP status, instead of returning partway through a half-
 * applied set of inserts.
 */
class OpeningBalanceError extends Error {
  code: OpeningBalanceErrorCode
  constructor(code: OpeningBalanceErrorCode) {
    super(code)
    this.name = "OpeningBalanceError"
    this.code = code
  }
}

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
      if (!memberRow) return { error: "member_not_found" as const }

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
    const bankAccountId =
      typeof body.bankAccountId === "string" && body.bankAccountId.trim()
        ? body.bankAccountId.trim()
        : null

    // Preferred multi-account shape from the form: [{ accountId, balance }].
    const rawSavingsEntries = Array.isArray(body.savingsEntries) ? body.savingsEntries : []
    const parsedEntries = rawSavingsEntries
      .map((raw) => {
        const obj = (raw ?? {}) as Record<string, unknown>
        const accountId =
          typeof obj.accountId === "string" && obj.accountId.trim() ? obj.accountId.trim() : null
        const balance = parseNum(obj.balance)
        return { accountId, balance: balance ?? 0 }
      })
      .filter((e): e is { accountId: string; balance: number } => Boolean(e.accountId) && e.balance > 0)

    // De-duplicate by account (last value wins) so a single account can't be written twice.
    const dedupedEntries = Array.from(
      new Map(parsedEntries.map((e) => [e.accountId, e])).values(),
    )

    // Normalised list the write path consumes. accountId may be null only for the
    // legacy single-account fallback (resolves to the member's first account).
    const savingsEntries: Array<{ accountId: string | null; balance: number }> = [...dedupedEntries]
    if (savingsEntries.length === 0 && savingsBalance !== null && savingsBalance > 0) {
      savingsEntries.push({ accountId: savingsAccountId, balance: savingsBalance })
    }

    const loanOutstandingBalance = parseNum(body.loanOutstandingBalance)
    const loanProductId = typeof body.loanProductId === "string" ? body.loanProductId : null
    const loanTenureMonths = parseNum(body.loanTenureMonths)
    const loanInterestRate = parseNum(body.loanInterestRate)
    const loanPrincipalAmount = parseNum(body.loanPrincipalAmount)
    const loanLastPaymentDate = typeof body.loanLastPaymentDate === "string" && body.loanLastPaymentDate.trim() ? body.loanLastPaymentDate.trim() : null
    const loanOriginalTenure = parseNum(body.loanOriginalTenure)

    const hasSavings = savingsEntries.length > 0
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

    let postCommit: OpeningBalancePostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId, {
        activeOnly: false,
      })
      if (!actor) return { error: "user_not_linked" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      // Super admins are read-only; block all write operations.
      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      if (hasSavings) {
        const allowedSavings = await hasPermission(client, actor, "edit_opening_savings")
        if (!allowedSavings) return { error: "missing_permission:edit_opening_savings" as const }
      }
      if (hasLoan) {
        const allowedLoans = await hasPermission(client, actor, "edit_opening_loans")
        if (!allowedLoans) return { error: "missing_permission:edit_opening_loans" as const }
      }

      const memberCheck = await assertMemberActive(client, memberId, actor.institution_id)
      if (!memberCheck.ok) {
        return {
          error: memberCheck.error as "member_not_found" | "member_inactive",
          memberStatus: memberCheck.error === "member_inactive" ? memberCheck.status : undefined,
        }
      }
      const memberRow = memberCheck.member

      // Reusable branch gate: block opening-balance writes against inactive branches.
      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }
      const branchId = memberRow.branch_id as string

      // Destination bank account for opening balances. Required: every opening
      // balance must be bank-recorded. Savings are credited to this account; loan
      // migrations net their reconstructed cash movement (repayments received
      // minus original disbursement) against it. Both then roll into daily
      // finances, mirroring the membership-fee settlement flow.
      let bankAccount: BankAccountRow | null = null
      if (hasSavings || hasLoan) {
        if (!bankAccountId) return { error: "bank_account_required" as const }
        bankAccount = await getBranchBankAccount(client, {
          bankAccountId,
          institutionId: actor.institution_id,
          branchId,
        })
        if (!bankAccount) return { error: "bank_account_not_found" as const }
      }
      // Opening balances always settle into the bank channel.
      const bankMode = "Bank Transfer"

      const txDate = new Date().toISOString()
      const results: { savingsUpdated?: boolean; loanCreated?: boolean; loanId?: string } = {}
      const savingsAccountsUpdated: string[] = []
      const savingsAccountsRecorded: OpeningBalanceSavingsAccountRecorded[] = []
      let totalSavingsRecorded = 0
      let loanRecorded: OpeningBalanceLoanRecorded | null = null

      try {
        await client.query("BEGIN")

      // --- SAVINGS OPENING BALANCE (one entry per account) ---
      if (hasSavings) {
        for (const entry of savingsEntries) {
          let accountId = entry.accountId
          if (!accountId) {
            const accRes = await client.query(
              `SELECT id FROM savings_accounts WHERE member_id = $1 AND institution_id = $2 ORDER BY created_at LIMIT 1`,
              [memberId, actor.institution_id]
            )
            accountId = accRes.rows[0]?.id ?? null
          }

          if (!accountId) {
            throw new OpeningBalanceError("no_savings_account")
          }

          const accVerify = await client.query(
            `SELECT id, available_balance, account_number, account_type
             FROM savings_accounts
             WHERE id = $1 AND member_id = $2 AND institution_id = $3`,
            [accountId, memberId, actor.institution_id]
          )
          const accRow = accVerify.rows[0]
          if (!accRow) throw new OpeningBalanceError("savings_account_not_found")

          const balanceBefore = Number(accRow.available_balance) || 0

          await client.query(
            `UPDATE savings_accounts
             SET available_balance = $1, total_balance = $1, last_transaction_date = $2
             WHERE id = $3`,
            [entry.balance, txDate.slice(0, 10), accountId]
          )

          // Shared transaction writer: collision-safe number + branch_id + audit.
          await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId,
            memberId,
            accountId,
            type: "Opening Balance",
            amount: entry.balance,
            mode: bankMode,
            description: "Opening savings balance from previous system",
            balanceBefore,
            balanceAfter: entry.balance,
            processedBy: actor.id,
            transactionDate: txDate,
            prefix: "OB-SAV",
          })

          savingsAccountsUpdated.push(accountId)
          savingsAccountsRecorded.push({
            accountId: String(accountId),
            accountNumber: String(accRow.account_number || ""),
            accountType: String(accRow.account_type || ""),
            openingBalance: entry.balance,
          })
          totalSavingsRecorded += entry.balance
        }
        results.savingsUpdated = true

        // Credit the selected branch bank account with the recorded savings total.
        if (bankAccount) {
          const adj = await adjustBankAccountBalance(client, {
            account: bankAccount,
            amount: totalSavingsRecorded,
            actor,
          })
          // Keep the in-memory balances fresh so a later loan adjustment audits
          // against the correct "before" snapshot.
          bankAccount = { ...bankAccount, available_balance: adj.availableBalance, total_amount: adj.totalAmount }
        }
      }

      // --- LOAN OPENING BALANCE ---
      if (hasLoan && loanProductId) {
        const prodRes = await client.query(
          `SELECT id, product_name, interest_rate, interest_calculation_method, minimum_tenure_months FROM loan_products WHERE id = $1 AND institution_id = $2`,
          [loanProductId, actor.institution_id]
        )
        const product = prodRes.rows[0]
        if (!product) throw new OpeningBalanceError("loan_product_not_found")

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
            (institution_id, branch_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, remaining_tenure_months, monthly_payment, total_amount, outstanding_balance, status, purpose, application_date, approved_at, disbursement_date, maturity_date, next_payment_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, 'Active', $12, $13, $13, $14, $15, $16, $17)
           RETURNING id`,
          [
            actor.institution_id, branchId, memberId, loanProductId, applicationId,
            principalAmount, interestRate, remainingTenure,
            monthlyPayment, totalAmount, loanOutstandingBalance,
            "Opening balance loan from previous system",
            disbursementDate, disbursementDate, maturityDate, nextPaymentDate,
            actor.id,
          ]
        )
        const loanRow = loanRes.rows[0]
        if (!loanRow) throw new OpeningBalanceError("loan_creation_failed")

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

        // Only write a migration repayment transaction when something was actually
        // paid in the previous system. A zero-amount ledger row is meaningless and
        // can trip positive-amount CHECK constraints.
        if (amountAlreadyPaid > 0) {
          await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId,
            memberId,
            loanId: loanRow.id,
            type: "Loan Repayment",
            amount: amountAlreadyPaid,
            mode: bankMode,
            description: "Migrated repayments from previous system",
            balanceBefore: totalPayable,
            balanceAfter: Number(loanOutstandingBalance),
            processedBy: actor.id,
            transactionDate: txDate,
            prefix: "OB-LN",
          })
        }

        // Net cash effect of migrating this loan into the branch bank account:
        //   repayments already received (amountAlreadyPaid) minus the original
        //   disbursement (principalAmount).
        // Positive  -> member has repaid more than was lent (interest), credit.
        // Negative  -> principal still outstanding exceeds repayments, debit.
        if (bankAccount) {
          const loanCashImpact = round2(amountAlreadyPaid - principalAmount)
          if (Math.abs(loanCashImpact) >= 0.01) {
            // Pre-check overdraw: a net debit cannot take the bank account below
            // zero (bank_accounts has a CHECK available_balance >= 0). Fail with
            // a friendly code instead of letting the constraint raise a 500.
            const currentAvailable = Number(bankAccount.available_balance ?? 0)
            if (loanCashImpact < 0 && currentAvailable + loanCashImpact < 0) {
              throw new OpeningBalanceError("bank_account_insufficient_funds")
            }
            const adj = await adjustBankAccountBalance(client, {
              account: bankAccount,
              amount: loanCashImpact,
              actor,
            })
            bankAccount = { ...bankAccount, available_balance: adj.availableBalance, total_amount: adj.totalAmount }
          }
        }

        results.loanCreated = true
        results.loanId = loanRow.id
        loanRecorded = {
          loanId: String(loanRow.id),
          applicationId,
          productName: String(product.product_name || ""),
          principalAmount,
          amountPaid: amountAlreadyPaid,
          outstanding: Number(loanOutstandingBalance),
        }
      }

      // Roll the net bank movement (savings credit and/or loan migration) into
      // the branch's daily finance ledger for today. For bank-routed money the
      // helper recomputes the live bank total from bank_accounts, so a single
      // call after all bank adjustments keeps the running position accurate.
      if (bankAccount) {
        await applyDailyFinanceEntry(client, {
          institutionId: actor.institution_id,
          branchId,
          amount: 0,
          mode: bankMode,
          actor,
        })
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
          savingsBalance: hasSavings ? totalSavingsRecorded : null,
          savingsAccounts: hasSavings ? savingsAccountsUpdated : null,
          bankAccountId: bankAccountId,
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

        // Resolve currency + institution name for post-commit notifications/emails.
        const cfgRes = await client.query<{ currency: string }>(
          `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
          [branchId],
        )
        const currency = (cfgRes.rows[0]?.currency as string) || "UGX"
        const instRes = await client.query<{ name: string }>(
          `SELECT name FROM institutions WHERE id = $1`,
          [actor.institution_id],
        )
        const institutionName = instRes.rows[0]?.name || ""

        // Stash context for best-effort notifications + emails after COMMIT.
        postCommit = {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId,
          institutionName,
          currency,
          member: {
            id: String(memberRow.id),
            full_name: String(memberRow.full_name || ""),
            member_number: String(memberRow.member_number || ""),
            email: memberRow.email ? String(memberRow.email) : "",
          },
          savings: results.savingsUpdated
            ? {
                amount: totalSavingsRecorded,
                accountId: savingsAccountsUpdated[0] ?? null,
                accounts: savingsAccountsRecorded,
              }
            : null,
          loan: loanRecorded,
        }

        await client.query("COMMIT")
        return { ok: true, ...results }
      } catch (txErr) {
        await client.query("ROLLBACK")
        if (txErr instanceof OpeningBalanceError) {
          return { error: txErr.code }
        }
        throw txErr
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" || result.error === "savings_account_not_found" || result.error === "loan_product_not_found" || result.error === "branch_not_found" ? 404 :
        result.error === "missing_permission:edit_opening_savings" || result.error === "missing_permission:edit_opening_loans" || result.error === SUPER_ADMIN_WRITE_BLOCKED || result.error === "branch_inactive" || result.error === "member_inactive" || result.error === "staff_inactive" ? 403 :
        400
      // Prefer the human-readable message (e.g. super-admin block) so the client toast is friendly.
      const errorText = "message" in result && result.message ? result.message : result.error
      return NextResponse.json(
        {
          error: errorText,
          code: result.error,
          ...("branchStatus" in result && result.branchStatus ? { branch_status: result.branchStatus } : {}),
          ...("memberStatus" in result && result.memberStatus ? { member_status: result.memberStatus } : {}),
          ...("staffStatus" in result && result.staffStatus ? { staff_status: result.staffStatus } : {}),
        },
        { status }
      )
    }
    apiLog("info", "member.opening_balances.create.success", { method: "POST", apiPath, status: 201, memberId, authUserId: session.user.authUserId })

    // Post-commit side-effects: notifications + emails. Best-effort — never
    // raise back to the client (the opening balances are already persisted).
    const ctx = postCommit as OpeningBalancePostCommit | null
    if (ctx && (ctx.savings || ctx.loan)) {
      try {
        // Fresh client so staff fan-out can query users/roles.
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyOpeningBalance({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            savings: ctx.savings,
            loan: ctx.loan,
            currency: ctx.currency,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.opening_balances.notifications_dispatched" : "member.opening_balances.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            memberId,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.opening_balances.notifications_failed", {
          method: "POST", apiPath, status: 201, memberId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailContext: OpeningBalanceEmailContext = {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          actorId: ctx.actorId,
        }
        const emailRes = await enqueueOpeningBalanceEmails({
          member: ctx.member,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          savings: ctx.savings
            ? { amount: ctx.savings.amount, accounts: ctx.savings.accounts }
            : null,
          loan: ctx.loan,
          context: emailContext,
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.opening_balances.email_enqueue_partial", {
            method: "POST", apiPath, status: 201, memberId, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.opening_balances.email_enqueue_failed", {
          method: "POST", apiPath, status: 201, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.opening_balances.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
