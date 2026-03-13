import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { auditLogger } from "@/lib/audit/audit-logger"
import { calculateLoanTerms } from "@/lib/loans/calculations"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const status = (url.searchParams.get("status") || "").trim()
    const productIdRaw = (url.searchParams.get("product_id") || "").trim()
    const selectedProductIds = productIdRaw
      ? productIdRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : []
    const clientId = (url.searchParams.get("client_id") || "").trim()
    const q = (url.searchParams.get("q") || "").trim()
    const remainingTenure = (url.searchParams.get("remainingTenure") || "").trim()
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const nextPaymentDateStart = (url.searchParams.get("nextPaymentDateStart") || "").trim()
    const nextPaymentDateEnd = (url.searchParams.get("nextPaymentDateEnd") || "").trim()

    const actor = await runWithoutAuth(async (client) => {
      const res = await client.query<{ institution_id: string; role: string }>(
        `SELECT
           u.institution_id,
          CASE
            WHEN r.name = 'System Admin' THEN 'system_admin'
            WHEN r.name = 'Super Admin' THEN 'super_admin'
            WHEN r.name = 'Admin' THEN 'institution_admin'
            WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
            ELSE NULL
          END AS role
         FROM senteloans_users u
         LEFT JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1 AND u.status = 'Active'`,
        [session!.user!.authUserId]
      )
      return res.rows[0] ?? null
    })
    if (!actor) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })

    const isSystemAdmin = String(actor.role || "").trim().toLowerCase() === "system_admin"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let matchedClientIds: string[] = []
      if (clientId) {
        matchedClientIds = [clientId]
      } else if (q) {
        const searchWhere = isSystemAdmin
          ? `(full_name ILIKE $1 OR client_number ILIKE $1 OR phone_number ILIKE $1 OR email ILIKE $1)`
          : `institution_id = $1 AND (full_name ILIKE $2 OR client_number ILIKE $2 OR phone_number ILIKE $2 OR email ILIKE $2)`
        const searchParams = isSystemAdmin ? [`%${q}%`] : [actor.institution_id, `%${q}%`]
        const searchRes = await client.query(
          `SELECT id FROM senteloans_clients WHERE ${searchWhere} LIMIT 200`,
          searchParams
        )
        matchedClientIds = searchRes.rows.map((r: { id: string }) => r.id)
        if (matchedClientIds.length === 0)
          return { items: [], total: 0, page, pageSize }
      }

      const from = (page - 1) * pageSize
      let where = isSystemAdmin ? "TRUE" : "l.institution_id = $1"
      const params: unknown[] = isSystemAdmin ? [] : [actor.institution_id]
      let idx = isSystemAdmin ? 1 : 2
      if (status) {
        where += ` AND l.status = $${idx++}`
        params.push(status)
      }
      if (selectedProductIds.length === 1) {
        where += ` AND l.loan_product_id = $${idx++}`
        params.push(selectedProductIds[0])
      } else if (selectedProductIds.length > 1) {
        where += ` AND l.loan_product_id = ANY($${idx}::uuid[])`
        params.push(selectedProductIds)
        idx++
      }
      if (remainingTenure) {
        if (remainingTenure === "eq1") where += ` AND l.tenure_months = 1`
        else if (remainingTenure === "lte3") where += ` AND l.tenure_months <= 3`
        else if (remainingTenure === "lte6") where += ` AND l.tenure_months <= 6`
        else if (remainingTenure === "lte12") where += ` AND l.tenure_months <= 12`
        else if (remainingTenure === "gt12") where += ` AND l.tenure_months > 12`
      }
      if (applicationDateStart) {
        where += ` AND l.application_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(applicationDateStart)
        idx++
      }
      if (applicationDateEnd) {
        where += ` AND l.application_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(applicationDateEnd)
        idx++
      }
      if (nextPaymentDateStart) {
        where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(nextPaymentDateStart)
        idx++
      }
      if (nextPaymentDateEnd) {
        where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(nextPaymentDateEnd)
        idx++
      }
      if (matchedClientIds.length > 0) {
        where += ` AND l.client_id = ANY($${idx}::uuid[])`
        params.push(matchedClientIds)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_loans l WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT l.id, l.application_id, l.client_id, l.loan_product_id, l.principal_amount, l.interest_rate, l.tenure_months, l.outstanding_balance, l.status, l.approval_date, l.disbursement_date, l.application_date, l.next_payment_date
         FROM senteloans_loans l WHERE ${where} ORDER BY l.application_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const clientIds = [...new Set(data.map((r: { client_id: string }) => r.client_id).filter(Boolean))]
      const productIds = [...new Set(data.map((r: { loan_product_id: string }) => r.loan_product_id).filter(Boolean))]
      let clientMap: Record<string, { name: string; number?: string }> = {}
      let productMap: Record<string, string> = {}
      if (clientIds.length > 0) {
        const cRes = await client.query(`SELECT id, full_name, client_number FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [clientIds])
        clientMap = Object.fromEntries(cRes.rows.map((c: { id: string; full_name: string; client_number: string }) => [c.id, { name: c.full_name, number: c.client_number }]))
      }
      if (productIds.length > 0) {
        const pRes = await client.query(`SELECT id, product_name FROM senteloans_loan_products WHERE id = ANY($1::uuid[])`, [productIds])
        productMap = Object.fromEntries(pRes.rows.map((p: { id: string; product_name: string }) => [p.id, p.product_name]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        application_id: row.application_id,
        memberName: clientMap[row.client_id as string]?.name || "",
        memberNumber: clientMap[row.client_id as string]?.number || "",
        productName: productMap[row.loan_product_id as string] || "",
        principal_amount: row.principal_amount,
        interest_rate: row.interest_rate,
        tenure_months: row.tenure_months,
        outstanding_balance: row.outstanding_balance,
        status: row.status,
        approval_date: row.approval_date,
        disbursement_date: row.disbursement_date,
        application_date: row.application_date,
        next_payment_date: row.next_payment_date ?? null,
      }))
      return { items, total, page, pageSize }
    })

    if (!result) return NextResponse.json({ error: "forbidden" }, { status: 403 })
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
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const client_id = String(body.client_id || "").trim()
    const loan_product_id = String(body.loan_product_id || "").trim()
    const principal_amount = Number(body.principal_amount)
    const tenure_months = Number(body.tenure_months)
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
    const collateral_description = typeof body.collateral_description === "string" ? body.collateral_description.trim() : null
    const guarantors = Array.isArray(body.guarantors) ? body.guarantors as Array<{ client_id: string; amount?: number }> : []
    const guarantor_ids = Array.isArray(body.guarantor_ids) ? (body.guarantor_ids as string[]) : []
    const inputGuarantors = guarantors.length > 0 ? guarantors : guarantor_ids.map((id) => ({ client_id: id }))
    const uniqGuars = Array.from(new Map(inputGuarantors.map((g) => [g.client_id, g])).values()).filter((g) => g.client_id !== client_id)

    if (!client_id) return NextResponse.json({ error: "client_id_required" }, { status: 400 })
    if (!loan_product_id) return NextResponse.json({ error: "loan_product_id_required" }, { status: 400 })
    if (!Number.isFinite(principal_amount) || principal_amount <= 0) return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
    if (!Number.isFinite(tenure_months) || tenure_months <= 0) return NextResponse.json({ error: "invalid_tenure_months" }, { status: 400 })
    if (!purpose) return NextResponse.json({ error: "purpose_required" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(`SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`, [session!.user!.authUserId])
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }
      const [borrowerRes, productRes] = await Promise.all([
        client.query(`SELECT id, institution_id, status, kyc_status FROM senteloans_clients WHERE id = $1`, [client_id]),
        client.query(`SELECT id, institution_id, status, interest_rate, minimum_amount, maximum_amount, maximum_tenure_months, guarantors_required, interest_calculation_method FROM senteloans_loan_products WHERE id = $1`, [loan_product_id]),
      ])
      const borrower = borrowerRes.rows[0]
      const product = productRes.rows[0]
      if (!borrower) return { error: "client_not_found" as const }
      if (!product) return { error: "loan_product_not_found" as const }
      if (borrower.institution_id !== actor.institution_id || product.institution_id !== actor.institution_id)
        return { error: "cross_tenant_operation_forbidden" as const }
      if (String(product.status) !== "Active") return { error: "product_not_active" as const }
      if (String(borrower.status) !== "Active") return { error: "borrower_not_active" as const }
      if (Number(product.minimum_amount) > 0 && principal_amount < Number(product.minimum_amount)) return { error: "below_min_amount" as const }
      if (Number(product.maximum_amount) > 0 && principal_amount > Number(product.maximum_amount)) return { error: "above_max_amount" as const }
      if (Number(product.maximum_tenure_months) > 0 && tenure_months > Number(product.maximum_tenure_months)) return { error: "above_max_tenure" as const }
      const required = Number(product.guarantors_required) || 0
      if (required > 0 && uniqGuars.length < required) return { error: "insufficient_guarantors" as const }

      if (uniqGuars.length > 0) {
        const guarIds = uniqGuars.map((g) => g.client_id)
        const guarRes = await client.query(`SELECT id, institution_id, status FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [guarIds])
        const bad = guarRes.rows.find((r: { institution_id: string; status: string }) => r.institution_id !== actor.institution_id || r.status !== "Active")
        if (bad) return { error: "invalid_guarantor" as const }
      }

      const annualRate = Number(product.interest_rate) || 0
      const terms = calculateLoanTerms(
        principal_amount,
        annualRate,
        tenure_months,
        product.interest_calculation_method
      )
      const monthly_payment = terms.monthlyPayment
      const total_amount = terms.totalAmount
      const application_id = `LN-${Date.now()}`
      const today = new Date().toISOString().slice(0, 10)

      const loanRes = await client.query(
        `INSERT INTO senteloans_loans (institution_id, client_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, status, purpose, collateral_description, application_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Applied', $10, $11, $12, $13) RETURNING id, application_id`,
        [actor.institution_id, client_id, loan_product_id, application_id, principal_amount, annualRate, tenure_months, monthly_payment, total_amount, purpose, collateral_description, today, actor.id]
      )
      const loanRow = loanRes.rows[0]
      if (!loanRow) return { error: "insert_failed" as const }

      if (uniqGuars.length > 0) {
        const per = Math.round((principal_amount / uniqGuars.length) * 100) / 100
        for (const g of uniqGuars) {
          await client.query(
            `INSERT INTO senteloans_loan_guarantors (loan_id, guarantor_client_id, guaranteed_amount, status) VALUES ($1, $2, $3, 'Active')`,
            [loanRow.id, g.client_id, Number.isFinite(g.amount) && g.amount! >= 0 ? g.amount! : per]
          )
        }
      }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values) VALUES ($1, $2, 'senteloans_loans', 'INSERT', $3, $4)`,
        [actor.institution_id, actor.id, loanRow.id, JSON.stringify({ application_id, client_id, principal_amount, purpose })]
      )

      const clientNameRes = await client.query(`SELECT full_name FROM senteloans_clients WHERE id = $1`, [client_id])
      const clientName = clientNameRes.rows[0]?.full_name || ""
      const adminsRes = await client.query(`SELECT id FROM senteloans_users WHERE institution_id = $1 AND role IN ('institution_admin', 'manager') AND id != $2`, [actor.institution_id, actor.id])
      if (adminsRes.rows.length > 0 && clientName) {
        const tpl = NotificationTemplates.pendingLoanApproval(clientName, principal_amount, loanRow.id)
        await notificationService.createBulk(
          adminsRes.rows.map((a: { id: string }) => ({
            institutionId: actor.institution_id,
            recipientType: "institution_user" as const,
            recipientId: a.id,
            type: "pending_loan_approval" as const,
            title: tpl.title,
            message: tpl.message,
            actionUrl: tpl.actionUrl,
            metadata: { loan_id: loanRow.id, client_id, client_name: clientName, amount: principal_amount },
          })),
          client
        )
      }
      return { ok: true, id: loanRow.id, application_id: loanRow.application_id }
    })

    if (result && "error" in result) {
      const status = result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "client_not_found" || result.error === "loan_product_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
