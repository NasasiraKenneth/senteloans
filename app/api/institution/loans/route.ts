import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { auditLogger } from "@/lib/audit/audit-logger"
import { calculateLoanTerms } from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { makePrefixedNumber } from "@/lib/ids/prefixed-number"
import { requireStaffSession, resolveActorContext, hasPermission, scopeWhere, isSuperAdmin, normalizeRole } from "@/lib/api/rbac"
import { decodeCursor, encodeCursor } from "@/lib/api/keyset"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.list.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const cursor = decodeCursor(url.searchParams.get("cursor"))
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "", 10) || pageSize, 1), 100)
    const status = (url.searchParams.get("status") || "").trim()
    const productIdRaw = (url.searchParams.get("product_id") || "").trim()
    const selectedProductIds = productIdRaw
      ? productIdRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : []
    const memberId = (url.searchParams.get("member_id") || url.searchParams.get("client_id") || "").trim()
    const q = (url.searchParams.get("q") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const remainingTenure = (url.searchParams.get("remainingTenure") || "").trim()
    const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const nextPaymentDateStart = (url.searchParams.get("nextPaymentDateStart") || "").trim()
    const nextPaymentDateEnd = (url.searchParams.get("nextPaymentDateEnd") || "").trim()

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }

      const role = normalizeRole(actor.role)
      const isSA = role === "super_admin"
      if (!isSA && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let matchedMemberIds: string[] = []
      if (memberId) {
        matchedMemberIds = [memberId]
      } else if (q) {
        const searchWhere = isSuperAdmin
          ? `institution_id = $1 AND (full_name ILIKE $2 OR member_number ILIKE $2 OR phone_number ILIKE $2 OR email ILIKE $2)`
          : `institution_id = $1 AND branch_id = $2 AND (full_name ILIKE $3 OR member_number ILIKE $3 OR phone_number ILIKE $3 OR email ILIKE $3)`
        const searchParams = isSuperAdmin
          ? [actor.institution_id, `%${q}%`]
          : [actor.institution_id, actor.branch_id, `%${q}%`]
        const searchRes = await client.query(
          `SELECT id FROM senteloans_members WHERE ${searchWhere} LIMIT 200`,
          searchParams
        )
        matchedMemberIds = searchRes.rows.map((r: { id: string }) => r.id)
        if (matchedMemberIds.length === 0)
          return { items: [], total: 0, page, pageSize }
      }

      const from = (page - 1) * pageSize
      const scoped = scopeWhere({ tableAlias: "l", actor, selectedBranchIds, startIndex: 1 })
      let where = scoped.where
      const params: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex
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
      if (loanType) {
        where += ` AND lower(l.loan_type) = $${idx++}`
        params.push(loanType)
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
      if (matchedMemberIds.length > 0) {
        where += ` AND l.member_id = ANY($${idx}::uuid[])`
        params.push(matchedMemberIds)
        idx++
      }

      if (cursor) {
        // keyset pagination: application_date desc, id desc
        where += ` AND (l.application_date, l.id) < (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date, $${idx + 1}::uuid)`
        params.push(cursor.t, cursor.id)
        idx += 2
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_loans l WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const take = cursor ? limit : pageSize
      if (!cursor) params.push(take, from)
      else params.push(take)
      const dataRes = await client.query(
        `SELECT l.id, l.application_id, l.member_id, l.loan_product_id, l.principal_amount, l.interest_rate, l.tenure_months, l.outstanding_balance, l.status, l.loan_type, l.approved_at, l.disbursement_date, l.application_date, l.next_payment_date
         FROM senteloans_loans l WHERE ${where} ORDER BY l.application_date DESC, l.id DESC LIMIT $${idx}${cursor ? "" : ` OFFSET $${idx + 1}`}`,
        params
      )
      const data = dataRes.rows

      const memberIds = [...new Set(data.map((r: { member_id: string }) => r.member_id).filter(Boolean))]
      const productIds = [...new Set(data.map((r: { loan_product_id: string }) => r.loan_product_id).filter(Boolean))]
      let memberMap: Record<string, { name: string; number?: string }> = {}
      let productMap: Record<string, string> = {}
      if (memberIds.length > 0) {
        const mRes = await client.query(`SELECT id, full_name, member_number FROM senteloans_members WHERE id = ANY($1::uuid[])`, [memberIds])
        memberMap = Object.fromEntries(mRes.rows.map((m: { id: string; full_name: string; member_number: string }) => [m.id, { name: m.full_name, number: m.member_number }]))
      }
      if (productIds.length > 0) {
        const pRes = await client.query(`SELECT id, product_name FROM senteloans_loan_products WHERE id = ANY($1::uuid[])`, [productIds])
        productMap = Object.fromEntries(pRes.rows.map((p: { id: string; product_name: string }) => [p.id, p.product_name]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        application_id: row.application_id,
        memberName: memberMap[row.member_id as string]?.name || "",
        memberNumber: memberMap[row.member_id as string]?.number || "",
        productName: productMap[row.loan_product_id as string] || "",
        principal_amount: row.principal_amount,
        interest_rate: row.interest_rate,
        tenure_months: row.tenure_months,
        outstanding_balance: row.outstanding_balance,
        status: row.status,
        loan_type: row.loan_type,
        approved_at: row.approved_at,
        disbursement_date: row.disbursement_date,
        application_date: row.application_date,
        next_payment_date: row.next_payment_date ?? null,
      }))

      const last = data[data.length - 1] as Record<string, unknown> | undefined
      const nextCursor =
        last?.application_date && last?.id
          ? encodeCursor({ t: String(last.application_date), id: String(last.id) })
          : null

      return { items, total, page, pageSize: take, nextCursor }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_loans" ? 403 :
        result.error === "user_not_linked" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "loans.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: sess.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    apiLog("info", "loans.list.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0, authUserId: sess.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loans.create.denied", { method: "POST", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const member_id = String(body.member_id || body.client_id || "").trim()
    const loan_product_id = String(body.loan_product_id || "").trim()
    const principal_amount = Number(body.principal_amount)
    const tenure_months = Number(body.tenure_months)
    const loan_type_raw = String(body.loan_type || "normal").trim().toLowerCase()
    const loan_type =
      loan_type_raw === "buy out"
        ? "buy off"
        : ["normal", "top up", "buy off"].includes(loan_type_raw)
          ? loan_type_raw
          : "normal"
    const top_up_loan_id = String(body.top_up_loan_id || "").trim()
    const external_outstanding_balance = Number(body.external_outstanding_balance)
    const external_lender_id = typeof body.external_lender_id === "string" ? body.external_lender_id.trim() : ""
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
    const collateral_description = typeof body.collateral_description === "string" ? body.collateral_description.trim() : null
    const guarantors = Array.isArray(body.guarantors) ? body.guarantors as Array<{ member_id?: string; client_id?: string; amount?: number }> : []
    const guarantor_ids = Array.isArray(body.guarantor_ids) ? (body.guarantor_ids as string[]) : []
    const guarantor_member_ids = Array.isArray(body.guarantor_member_ids) ? (body.guarantor_member_ids as string[]) : []
    const inputGuarantors: Array<{ member_id: string; amount?: number }> =
      guarantors.length > 0
        ? guarantors.map((g) => ({ member_id: String(g.member_id || g.client_id || "").trim(), amount: g.amount }))
        : [...guarantor_member_ids, ...guarantor_ids].map((id) => ({ member_id: id }))
    const uniqGuars = Array.from(new Map(inputGuarantors.map((g) => [g.member_id, g])).values()).filter((g) => g.member_id && g.member_id !== member_id)

    if (!member_id) return NextResponse.json({ error: "member_id_required" }, { status: 400 })
    if (!loan_product_id) return NextResponse.json({ error: "loan_product_id_required" }, { status: 400 })
    if (!Number.isFinite(principal_amount) || principal_amount <= 0) return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
    if (!Number.isFinite(tenure_months) || tenure_months <= 0) return NextResponse.json({ error: "invalid_tenure_months" }, { status: 400 })
    if (loan_type === "top up" && !top_up_loan_id) return NextResponse.json({ error: "top_up_loan_id_required" }, { status: 400 })
    if (loan_type === "buy off" && (!Number.isFinite(external_outstanding_balance) || external_outstanding_balance <= 0))
      return NextResponse.json({ error: "invalid_external_outstanding_balance" }, { status: 400 })
    if (loan_type === "buy off" && !external_lender_id) return NextResponse.json({ error: "external_lender_id_required" }, { status: 400 })
    if (loan_type === "buy off" && !uuidRe.test(external_lender_id))
      return NextResponse.json({ error: "invalid_external_lender_id" }, { status: 400 })
    if (!purpose) return NextResponse.json({ error: "purpose_required" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "create_loan")
      if (!allowed) return { error: "missing_permission:create_loan" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const [borrowerRes, productRes, topUpLoanRes] = await Promise.all([
        client.query(`SELECT id, institution_id, branch_id, status, kyc_status FROM senteloans_members WHERE id = $1`, [member_id]),
        client.query(`SELECT id, institution_id, branch_id, status, interest_rate, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months, guarantors_required, interest_calculation_method FROM senteloans_loan_products WHERE id = $1`, [loan_product_id]),
        loan_type === "top up"
          ? client.query(
              `SELECT id, institution_id, branch_id, member_id, outstanding_balance, status
               FROM senteloans_loans
               WHERE id = $1
               LIMIT 1`,
              [top_up_loan_id]
            )
          : Promise.resolve({ rows: [] as any[] }),
      ])
      const borrower = borrowerRes.rows[0]
      const product = productRes.rows[0]
      const topUpLoan = topUpLoanRes.rows[0]
      if (!borrower) return { error: "member_not_found" as const }
      if (!product) return { error: "loan_product_not_found" as const }
      if (borrower.institution_id !== actor.institution_id || product.institution_id !== actor.institution_id)
        return { error: "cross_tenant_operation_forbidden" as const }
      if (borrower.branch_id !== actor.branch_id || product.branch_id !== actor.branch_id)
        return { error: "cross_branch_operation_forbidden" as const }
      if (String(product.status) !== "Active") return { error: "product_not_active" as const }
      if (String(borrower.status) !== "Active") return { error: "borrower_not_active" as const }
      if (loan_type === "top up") {
        if (!topUpLoan) return { error: "top_up_loan_not_found" as const }
        if (topUpLoan.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
        if (topUpLoan.branch_id !== actor.branch_id) return { error: "cross_branch_operation_forbidden" as const }
        if (String(topUpLoan.member_id) !== String(member_id)) return { error: "top_up_loan_member_mismatch" as const }
        if (["Rejected", "Closed"].includes(String(topUpLoan.status || ""))) return { error: "top_up_loan_not_eligible" as const }
      }
      if (loan_type === "normal" || loan_type === "buy off") {
        const cfgRes = await client.query(
          `SELECT maximum_parallel_loans
           FROM senteloans_config
           WHERE branch_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [actor.branch_id]
        )
        const maxParallel = Number(cfgRes.rows[0]?.maximum_parallel_loans ?? 0)
        // Explicitly allow unlimited when maximum_parallel_loans is NULL or <= 0.
        if (Number.isFinite(maxParallel) && maxParallel > 0) {
          const activeParallelRes = await client.query(
            `SELECT COUNT(*)::int AS c
             FROM senteloans_loans
             WHERE institution_id = $1
               AND branch_id = $2
               AND member_id = $3
               AND loan_type IN ('normal', 'buy off')
               AND status NOT IN ('Closed', 'Rejected')`,
            [actor.institution_id, actor.branch_id, member_id]
          )
          const activeParallelCount = Number(activeParallelRes.rows[0]?.c ?? 0)
          if (activeParallelCount >= maxParallel) {
            return {
              error: "parallel_loans_limit_reached" as const,
              maximum_parallel_loans: maxParallel,
              current_parallel_loans: activeParallelCount,
            }
          }
        }
      }
      if (loan_type === "buy off") {
        const extRes = await client.query(
          `SELECT id FROM senteloans_clients WHERE id = $1 AND institution_id = $2 AND branch_id = $3`,
          [external_lender_id, actor.institution_id, actor.branch_id]
        )
        if (!extRes.rows[0]) return { error: "external_lender_not_found" as const }
      }
      if (Number(product.minimum_amount) > 0 && principal_amount < Number(product.minimum_amount)) return { error: "below_min_amount" as const }
      if (Number(product.maximum_amount) > 0 && principal_amount > Number(product.maximum_amount)) return { error: "above_max_amount" as const }
      if (Number(product.minimum_tenure_months) > 0 && tenure_months < Number(product.minimum_tenure_months)) return { error: "below_min_tenure" as const }
      if (Number(product.maximum_tenure_months) > 0 && tenure_months > Number(product.maximum_tenure_months)) return { error: "above_max_tenure" as const }
      const required = Number(product.guarantors_required) || 0
      if (required > 0 && uniqGuars.length < required) return { error: "insufficient_guarantors" as const }

      if (uniqGuars.length > 0) {
        const guarIds = uniqGuars.map((g) => g.member_id)
        const guarRes = await client.query(`SELECT id, institution_id, status FROM senteloans_members WHERE id = ANY($1::uuid[])`, [guarIds])
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
      const today = new Date().toISOString().slice(0, 10)

      let loanRow: { id: string; application_id: string } | null = null
      let application_id = ""
      for (let i = 0; i < 8; i++) {
        application_id = makePrefixedNumber("LN")
        try {
          const loanRes = await client.query(
            `INSERT INTO senteloans_loans (institution_id, branch_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, status, loan_type, purpose, collateral_description, application_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Applied', $11, $12, $13, $14, $15) RETURNING id, application_id`,
            [actor.institution_id, actor.branch_id, member_id, loan_product_id, application_id, principal_amount, annualRate, tenure_months, monthly_payment, total_amount, loan_type, purpose, collateral_description, today, actor.id]
          )
          loanRow = loanRes.rows[0] || null
          break
        } catch (e: any) {
          if (String(e?.code) === "23505") continue
          throw e
        }
      }
      if (!loanRow) return { error: "insert_failed" as const }

      if (uniqGuars.length > 0) {
        const per = Math.round((principal_amount / uniqGuars.length) * 100) / 100
        for (const g of uniqGuars) {
          const guaranteedAmount = Number.isFinite(g.amount) && g.amount! >= 0 ? g.amount! : per
          const guarantorInsertRes = await client.query(
            `INSERT INTO senteloans_loan_guarantors (loan_id, guarantor_member_id, guaranteed_amount, status)
             VALUES ($1, $2, $3, 'Active')
             RETURNING id`,
            [loanRow.id, g.member_id, guaranteedAmount]
          )
          const guarantorId = guarantorInsertRes.rows[0]?.id
          if (!guarantorId) continue
          await auditLogger.logInsert(
            "senteloans_loan_guarantors",
            guarantorId,
            {
              loan_id: loanRow.id,
              guarantor_member_id: g.member_id,
              guaranteed_amount: guaranteedAmount,
              status: "Active",
            },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }
      }

      if (loan_type === "top up") {
        const settlementRes = await client.query(
          `INSERT INTO senteloans_loan_settlements
            (institution_id, branch_id, new_loan_id, settled_loan_id, external_lender_id, settlement_amount, settlement_type, settlement_status)
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)
           RETURNING id`,
          [
            actor.institution_id,
            actor.branch_id,
            loanRow.id,
            topUpLoan.id,
            Number(topUpLoan.outstanding_balance || 0),
            "internal_topup",
            "Pending",
          ]
        )
        const settlementId = settlementRes.rows[0]?.id
        if (settlementId) {
          await auditLogger.logInsert(
            "senteloans_loan_settlements",
            settlementId,
            {
              new_loan_id: loanRow.id,
              settled_loan_id: topUpLoan.id,
              settlement_amount: Number(topUpLoan.outstanding_balance || 0),
              settlement_type: "internal_topup",
              settlement_status: "Pending",
            },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }
      }

      if (loan_type === "buy off") {
        const settlementRes = await client.query(
          `INSERT INTO senteloans_loan_settlements
            (institution_id, branch_id, new_loan_id, settled_loan_id, external_lender_id, settlement_amount, settlement_type, settlement_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            actor.institution_id,
            actor.branch_id,
            loanRow.id,
            null,
            external_lender_id,
            external_outstanding_balance,
            "external_buyout",
            "Pending",
          ]
        )
        const settlementId = settlementRes.rows[0]?.id
        if (settlementId) {
          await auditLogger.logInsert(
            "senteloans_loan_settlements",
            settlementId,
            {
              new_loan_id: loanRow.id,
              settled_loan_id: null,
              external_lender_id,
              settlement_amount: external_outstanding_balance,
              settlement_type: "external_buyout",
              settlement_status: "Pending",
            },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }
      }

      const eligibilityRes = await client.query(
        `SELECT eligibility
         FROM senteloans_loan_product_eligibilities
         WHERE loan_product_id = $1`,
        [loan_product_id]
      )
      if (eligibilityRes.rows.length > 0) {
        for (const er of eligibilityRes.rows) {
          const eligibility = String(er.eligibility || "").trim()
          if (!eligibility) continue
          const eligibilityInsertRes = await client.query(
            `INSERT INTO senteloans_loan_eligibility_reviews (loan_id, eligibility, is_eligible)
             VALUES ($1, $2, FALSE)
             ON CONFLICT (loan_id, eligibility) DO NOTHING
             RETURNING id`,
            [loanRow.id, eligibility]
          )
          const eligibilityReviewId = eligibilityInsertRes.rows[0]?.id
          if (eligibilityReviewId) {
            await auditLogger.logInsert(
              "senteloans_loan_eligibility_reviews",
              eligibilityReviewId,
              {
                loan_id: loanRow.id,
                eligibility,
                is_eligible: false,
              },
              actor.institution_id,
              actor.id,
              { branch_id: String(actor.branch_id || "") },
              client
            )
          }
        }
      }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, branch_id, user_id, table_name, category, operation, record_id, new_values) VALUES ($1, $2, $3, 'senteloans_loans', 'loans', 'INSERT', $4, $5)`,
        [
          actor.institution_id,
          actor.branch_id,
          actor.id,
          loanRow.id,
          JSON.stringify({
            application_id,
            member_id,
            principal_amount,
            loan_type,
            purpose,
            top_up_loan_id,
            external_outstanding_balance,
            external_lender_id: loan_type === "buy off" ? external_lender_id : undefined,
          }),
        ]
      )

      const memberNameRes = await client.query(`SELECT full_name FROM senteloans_members WHERE id = $1`, [member_id])
      const memberName = memberNameRes.rows[0]?.full_name || ""
      const adminsRes = await client.query(
        `SELECT u.id
         FROM senteloans_users u
         JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.institution_id = $1
           AND u.id != $2
           AND lower(r.name) IN ('admin', 'manager')`,
        [actor.institution_id, actor.id]
      )
      if (adminsRes.rows.length > 0 && memberName) {
        const tpl = NotificationTemplates.pendingLoanApproval(memberName, principal_amount, loanRow.id)
        await notificationService.createBulk(
          adminsRes.rows.map((a: { id: string }) => ({
            institutionId: actor.institution_id,
            branchId: String(actor.branch_id || ""),
            recipientType: "institution_user" as const,
            recipientId: a.id,
            type: "pending_loan_approval" as const,
            title: tpl.title,
            message: tpl.message,
            actionUrl: tpl.actionUrl,
            metadata: { loan_id: loanRow.id, member_id, member_name: memberName, amount: principal_amount },
          })),
          client
        )
      }
      return { ok: true, id: loanRow.id, application_id: loanRow.application_id }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:create_loan" ? 403 :
        result.error === "cross_tenant_operation_forbidden" || result.error === "cross_branch_operation_forbidden" ? 403 :
        result.error === "user_not_linked" ? 403 :
        result.error === "member_not_found" ||
        result.error === "loan_product_not_found" ||
        result.error === "top_up_loan_not_found" ||
        result.error === "external_lender_not_found"
          ? 404
          : 400
      apiLog("warn", "loans.create.denied", { method: "POST", apiPath, status, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "loans.create.success", { method: "POST", apiPath, status: 200, loanId: result.id, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
