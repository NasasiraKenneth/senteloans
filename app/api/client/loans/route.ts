import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { getInstitutionAdminRecipients } from "@/lib/notifications/admin-recipients"
import { calculateLoanTerms } from "@/lib/loans/calculations"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id FROM clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const loansRes = await client.query(
        `SELECT id, application_id, principal_amount, interest_rate, tenure_months, outstanding_balance, status, next_payment_date, loan_product_id, application_date
         FROM loans WHERE client_id = $1 AND institution_id = $2 ORDER BY application_date DESC`,
        [row.id, row.institution_id]
      )
      const productIds = [...new Set(loansRes.rows.map((l: Record<string, unknown>) => l.loan_product_id).filter(Boolean))]
      let productMap: Record<string, string> = {}
      if (productIds.length > 0) {
        const prodRes = await client.query(
          `SELECT id, product_name FROM loan_products WHERE id = ANY($1::uuid[])`,
          [productIds]
        )
        productMap = Object.fromEntries(prodRes.rows.map((p: Record<string, unknown>) => [p.id, p.product_name as string]))
      }
      return loansRes.rows.map((l: Record<string, unknown>) => ({
        id: l.id,
        applicationId: l.application_id,
        principalAmount: Number(l.principal_amount || 0),
        interestRate: Number(l.interest_rate || 0),
        tenure: Number(l.tenure_months || 0),
        outstandingBalance: Number(l.outstanding_balance || 0),
        status: String(l.status || "Applied"),
        nextPaymentDate: l.next_payment_date,
        loanProduct: productMap[l.loan_product_id as string] || "Loan",
      }))
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json({ loans: result })
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
    } = payload

    if (!loan_product_id) return NextResponse.json({ error: "Loan product is required" }, { status: 400 })
    if (!principal_amount || Number(principal_amount) <= 0) return NextResponse.json({ error: "Valid loan amount is required" }, { status: 400 })
    if (!tenure_months || Number(tenure_months) <= 0) return NextResponse.json({ error: "Valid tenure is required" }, { status: 400 })
    if (!purpose || String(purpose).trim().length < 10) return NextResponse.json({ error: "Purpose must be at least 10 characters" }, { status: 400 })
    if (!monthly_income || Number(monthly_income) <= 0) return NextResponse.json({ error: "Valid monthly income is required" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, status, kyc_status FROM clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }
      if (clientRow.status !== "Active") return { error: "Client account is not active" as const }
      if (clientRow.kyc_status !== "Verified") return { error: "KYC verification required before applying for loans" as const }

      const productRes = await client.query(
        `SELECT id, product_name, interest_rate, interest_calculation_method, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months
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
          `SELECT id, status, kyc_status FROM clients WHERE id = ANY($1::uuid[]) AND institution_id = $2`,
          [guarantorIds, clientRow.institution_id]
        )
        if (guarRes.rows.length !== guarantorIds.length) return { error: "Invalid guarantor selection" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.id === clientRow.id)) return { error: "You cannot select yourself as a guarantor" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.status !== "Active")) return { error: "All guarantors must be active members" as const }
        if (guarRes.rows.some((g: Record<string, unknown>) => g.kyc_status !== "Verified")) return { error: "All guarantors must have verified KYC status" as const }
      }
      if (institutionType === "Money Lender") {
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
      const applicationId = `LA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000000).toString().padStart(6, "0")}`

      const loanInsert = {
        institution_id: clientRow.institution_id,
        client_id: clientRow.id,
        loan_product_id: product.id,
        application_id: applicationId,
        principal_amount: principal,
        interest_rate: product.interest_rate,
        tenure_months: tenure,
        purpose: String(purpose).trim(),
        monthly_payment: monthlyPayment,
        total_amount: totalAmount,
        outstanding_balance: principal,
        collateral_description: typeof collateral_description === "string" ? collateral_description.trim() || null : null,
        application_date: new Date().toISOString().slice(0, 10),
        status: "Applied",
        created_by: null,
      }

      const loanRes = await client.query(
        `INSERT INTO loans (institution_id, client_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, purpose, monthly_payment, total_amount, outstanding_balance, collateral_description, application_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Applied')
         RETURNING id, application_id`,
        [
          loanInsert.institution_id,
          loanInsert.client_id,
          loanInsert.loan_product_id,
          loanInsert.application_id,
          loanInsert.principal_amount,
          loanInsert.interest_rate,
          loanInsert.tenure_months,
          loanInsert.purpose,
          loanInsert.monthly_payment,
          loanInsert.total_amount,
          loanInsert.outstanding_balance,
          loanInsert.collateral_description,
          loanInsert.application_date,
        ]
      )
      const loan = loanRes.rows[0]

      if (institutionType === "SACCO" && guarantorIds.length > 0) {
        const guaranteedAmount = Math.round((principal / guarantorIds.length) * 100) / 100
        for (const gid of guarantorIds) {
          await client.query(
            `INSERT INTO loan_guarantors (loan_id, guarantor_client_id, guaranteed_amount, status) VALUES ($1, $2, $3, 'Active')`,
            [loan.id, gid, guaranteedAmount]
          )
        }
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
        const notif = NotificationTemplates.pendingLoanApproval(clientRow.full_name, principal, loan.id)
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
            metadata: { member_id: clientRow.id, member_name: clientRow.full_name, loan_id: loan.id, amount: principal },
          })),
          client
        )
      }

      const submittedTpl = NotificationTemplates.loanApplicationSubmitted(loan.id, principal)
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
            metadata: { loan_id: loan.id, amount: principal },
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
