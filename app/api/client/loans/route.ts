import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { makePrefixedNumber } from "@/lib/ids/prefixed-number"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { getInstitutionAdminRecipients } from "@/lib/notifications/admin-recipients"
import { calculateLoanTerms } from "@/lib/loans/calculations"

export async function GET(req?: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = req?.url ? new URL(req.url) : new URL("http://localhost/api/client/loans")
    const search = (url.searchParams.get("search") || "").trim()
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const loanProductParam = (url.searchParams.get("loan_product") || url.searchParams.get("loanProduct") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("dateStart") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("dateEnd") ||
      url.searchParams.get("endDate") ||
      ""
    ).trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = clientRes.rows[0]
      if (!member) return null

      let query = `
        SELECT 
          l.id, 
          l.application_id, 
          l.principal_amount, 
          l.interest_rate, 
          l.tenure_months, 
          l.outstanding_balance, 
          l.status::text AS status, 
          l.next_payment_date, 
          l.loan_product_id, 
          l.application_date,
          l.disbursement_date,
          l.overdue_days,
          lp.product_name
        FROM loans l
        LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
        WHERE l.member_id = $1 AND l.institution_id = $2
      `
      const params: unknown[] = [member.id, member.institution_id]
      let paramIdx = 3

      if (statusParam && statusParam !== "all") {
        query += ` AND LOWER(TRIM(l.status::text)) = $${paramIdx++}`
        params.push(statusParam)
      }

      if (loanProductParam && loanProductParam !== "all") {
        const products = loanProductParam.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)
        if (products.length > 0) {
          query += ` AND (LOWER(TRIM(lp.product_name)) = ANY($${paramIdx}) OR l.loan_product_id::text = ANY($${paramIdx}))`
          params.push(products)
          paramIdx++
        }
      }

      if (search) {
        query += ` AND (l.application_id ILIKE $${paramIdx} OR lp.product_name ILIKE $${paramIdx} OR l.status::text ILIKE $${paramIdx})`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        query += ` AND l.application_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND l.application_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY l.application_date DESC, l.created_at DESC`

      const loansRes = await client.query(query, params)

      // Summary statistics
      const aggRes = await client.query(
        `SELECT
           COALESCE(SUM(principal_amount), 0)::numeric AS total_principal,
           COALESCE(SUM(outstanding_balance), 0)::numeric AS total_outstanding,
           COUNT(*)::int AS total_loans,
           COUNT(*) FILTER (WHERE LOWER(TRIM(status::text)) IN ('approved', 'disbursed', 'active', 'partially disbursed', 'fully disbursed'))::int AS active_loans
         FROM loans
         WHERE member_id = $1 AND institution_id = $2`,
        [member.id, member.institution_id]
      )
      const agg = aggRes.rows[0] || {}

      const mappedLoans = loansRes.rows.map((l: Record<string, unknown>) => ({
        id: l.id,
        applicationId: l.application_id,
        memberName: member.full_name,
        memberNumber: member.member_number,
        principalAmount: Number(l.principal_amount || 0),
        interestRate: Number(l.interest_rate || 0),
        tenure: Number(l.tenure_months || 0),
        remainingTenure: Number(l.tenure_months || 0),
        outstandingBalance: Number(l.outstanding_balance || 0),
        status: String(l.status || "Applied"),
        applicationDate: l.application_date,
        disbursementDate: l.disbursement_date,
        nextPaymentDate: l.next_payment_date,
        overdueDays: Number(l.overdue_days || 0),
        loanProduct: (l.product_name as string) || "Standard Loan",
      }))

      return {
        loans: mappedLoans,
        total: loansRes.rowCount || 0,
        summaryStats: {
          totalPrincipal: Number(agg.total_principal || 0),
          totalOutstanding: Number(agg.total_outstanding || 0),
          totalLoans: Number(agg.total_loans || 0),
          activeLoans: Number(agg.active_loans || 0),
        },
      }
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>
    const {
      loan_product_id,
      principal_amount,
      tenure_months,
      purpose,
      monthly_income,
      collateral_description,
      guarantor_ids,
      loan_type,
      existing_loan_id,
      previous_loan_id,
    } = payload

    if (!loan_product_id) return NextResponse.json({ error: "Loan product is required" }, { status: 400 })
    if (!principal_amount || Number(principal_amount) <= 0) return NextResponse.json({ error: "Valid loan amount is required" }, { status: 400 })
    if (!tenure_months || Number(tenure_months) <= 0) return NextResponse.json({ error: "Valid tenure is required" }, { status: 400 })
    if (!purpose || String(purpose).trim().length < 10) return NextResponse.json({ error: "Purpose must be at least 10 characters" }, { status: 400 })

    const creditType = String(loan_type || "").toLowerCase() === "top up" ? "top up" : "normal"
    const topUpPreviousLoanId = (existing_loan_id || previous_loan_id) ? String(existing_loan_id || previous_loan_id) : null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, status, kyc_status, monthly_income FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }
      if (clientRow.status !== "Active") return { error: "Client account is not active" as const }
      if (clientRow.kyc_status !== "Verified") return { error: "KYC verification required before applying for loans" as const }

      const productRes = await client.query(
        `SELECT id, product_name, interest_rate, interest_calculation_method, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months, collateral_required
         FROM loan_products WHERE id = $1 AND institution_id = $2`,
        [loan_product_id, clientRow.institution_id]
      )
      const product = productRes.rows[0]
      if (!product) return { error: "Invalid loan product" as const }

      const principal = Number(principal_amount)
      const tenure = Number(tenure_months)
      if (principal < Number(product.minimum_amount) || principal > Number(product.maximum_amount))
        return { error: `Loan amount must be between UGX ${Number(product.minimum_amount).toLocaleString()} and UGX ${Number(product.maximum_amount).toLocaleString()}` as const }
      if (tenure < Number(product.minimum_tenure_months) || tenure > Number(product.maximum_tenure_months))
        return { error: `Tenure must be between ${product.minimum_tenure_months} and ${product.maximum_tenure_months} months` as const }

      const instRes = await client.query(
        `SELECT type FROM institutions WHERE id = $1`,
        [clientRow.institution_id]
      )
      const institutionType = (instRes.rows[0]?.type as string) || "SACCO"

      const guarantorIds = Array.isArray(guarantor_ids) ? (guarantor_ids as string[]).filter(Boolean) : []
      if (institutionType === "SACCO") {
        if (guarantorIds.length === 0) return { error: "At least one guarantor is required for SACCO loans" as const }
        const guarRes = await client.query(
          `SELECT id, status, kyc_status FROM members WHERE id = ANY($1::uuid[]) AND institution_id = $2`,
          [guarantorIds, clientRow.institution_id]
        )
        if (guarRes.rows.length !== guarantorIds.length) return { error: "Invalid guarantor selection" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.id === clientRow.id)) return { error: "You cannot select yourself as a guarantor" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.status !== "Active")) return { error: "All guarantors must be active members" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.kyc_status !== "Verified")) return { error: "All guarantors must have verified KYC status" as const }
      }
      
      const isCollateralRequired = institutionType === "Money Lender" || Boolean(product.collateral_required)
      if (isCollateralRequired) {
        const coll = String(collateral_description || "").trim()
        if (coll.length < 20) return { error: "Detailed collateral description is required (minimum 20 characters)" as const }
      }

      const terms = calculateLoanTerms(
        principal,
        Number(product.interest_rate) || 0,
        tenure,
        product.interest_calculation_method
      )
      const monthlyPayment = terms.monthlyPayment
      const totalAmount = terms.totalAmount
      const today = new Date().toISOString().slice(0, 10)
      const collDesc = typeof collateral_description === "string" ? collateral_description.trim() || null : null

      let loan: { id: string; application_id: string } | null = null
      let applicationId = ""
      for (let i = 0; i < 8; i++) {
        applicationId = makePrefixedNumber("LN")
        try {
          const loanRes = await client.query(
            `INSERT INTO loans (institution_id, branch_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, remaining_tenure_months, purpose, monthly_payment, total_amount, outstanding_balance, collateral_description, application_date, status, loan_type, previous_loan_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14, 'Applied', $15, $16)
             RETURNING id, application_id`,
            [
              clientRow.institution_id,
              clientRow.branch_id,
              clientRow.id,
              product.id,
              applicationId,
              principal,
              product.interest_rate,
              tenure,
              String(purpose).trim(),
              monthlyPayment,
              totalAmount,
              principal,
              collDesc,
              today,
              creditType,
              topUpPreviousLoanId,
            ]
          )
          loan = loanRes.rows[0] || null
          break
        } catch (e: any) {
          if (String(e?.code) === "23505") continue
          throw e
        }
      }
      if (!loan) return { error: "insert_failed" as const }

      if (institutionType === "SACCO" && guarantorIds.length > 0) {
        const guaranteedAmount = Math.round((principal / guarantorIds.length) * 100) / 100
        for (const gid of guarantorIds) {
          await client.query(
            `INSERT INTO loan_guarantors (loan_id, guarantor_member_id, guaranteed_amount, status) VALUES ($1, $2, $3, 'Active')`,
            [loan.id, gid, guaranteedAmount]
          )
        }
      }

      const loanInsert = {
        institution_id: clientRow.institution_id,
        branch_id: clientRow.branch_id,
        member_id: clientRow.id,
        loan_product_id: product.id,
        application_id: loan.application_id,
        principal_amount: principal,
        interest_rate: product.interest_rate,
        tenure_months: tenure,
        remaining_tenure_months: tenure,
        purpose: String(purpose).trim(),
        monthly_payment: monthlyPayment,
        total_amount: totalAmount,
        outstanding_balance: principal,
        collateral_description: collDesc,
        application_date: today,
        status: "Applied",
        loan_type: creditType,
        previous_loan_id: topUpPreviousLoanId,
      }

      await auditLogger.logInsert(
        "loans",
        loan.id,
        loanInsert as Record<string, unknown>,
        clientRow.institution_id,
        undefined,
        { branch_id: String(clientRow.branch_id || "") },
        client
      )

      const admins = await getInstitutionAdminRecipients(client, clientRow.institution_id, {
        roles: ["institution_admin", "manager", "loan_officer"],
      })
      if (admins.length > 0) {
        const notif = NotificationTemplates.pendingLoanApproval(
          clientRow.full_name,
          principal,
          loan.id,
          loan.application_id,
          product.product_name,
        )
        await notificationService.createBulk(
          admins.map((a) => ({
            institutionId: clientRow.institution_id,
            branchId: String(a.branch_id || clientRow.branch_id || ""),
            recipientType: "institution_user" as const,
            recipientId: a.id,
            type: "pending_loan_approval" as const,
            title: notif.title,
            message: notif.message,
            actionUrl: notif.actionUrl,
            metadata: {
              member_id: clientRow.id,
              member_name: clientRow.full_name,
              loan_id: loan.id,
              application_id: loan.application_id,
              amount: principal,
              product_name: product.product_name,
            },
          })),
          client
        )
      }

      const submittedTpl = NotificationTemplates.loanApplicationSubmitted(
        loan.id,
        principal,
        loan.application_id,
        product.product_name,
      )
      await notificationService
        .create(
          {
            institutionId: clientRow.institution_id,
            branchId: String(clientRow.branch_id || ""),
            recipientType: "member",
            recipientId: clientRow.id,
            type: "loan_application_submitted",
            title: submittedTpl.title,
            message: submittedTpl.message,
            actionUrl: submittedTpl.actionUrl,
            metadata: {
              loan_id: loan.id,
              application_id: loan.application_id,
              amount: principal,
              product_name: product.product_name,
            },
          },
          client
        )
        .catch((e) => console.error("Failed to create loan_application_submitted notification:", e))

      return { loanId: loan.id, applicationId: loan.application_id }
    })

    if (result && "error" in result)
      return NextResponse.json({ error: result.error }, { status: 400 })
    if (!result || !("loanId" in result))
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, loanId: result.loanId, applicationId: result.applicationId })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
