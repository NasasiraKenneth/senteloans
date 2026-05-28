import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null
  const v = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "view_investments")
      if (!allowed) return { error: "missing_permission:view_investments" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const invRes = await client.query(
        `SELECT
           i.id, i.investment_number, i.provider_id, c.name AS provider_name, i.category, i.description,
           i.initial_amount, i.current_value, i.expected_percentage, i.extracted_returns, i.risk_level,
           i.start_date, i.period_in_months, i.period_in_years, i.maturity_date, i.status,
           i.created_by, i.created_at, i.modified_by, i.updated_at,
           i.investment_name, i.address AS investment_address
         FROM senteloans_investments i
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         WHERE i.id = $1
           AND i.institution_id = $2
           ${isSuperAdmin ? "" : "AND i.branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      if (invRes.rowCount === 0) return { error: "investment_not_found" as const }
      const investment = invRes.rows[0]

      const partnersRes = await client.query(
        `SELECT
           p.id, p.counterparty_id, c.name AS counterparty_name, p.role, p.status,
           p.contribution_percentage, p.contribution_amount, p.ownership_percentage
         FROM senteloans_investment_partners p
         LEFT JOIN senteloans_clients c ON c.id = p.counterparty_id
         WHERE p.investment_id = $1
         ORDER BY p.created_at ASC`,
        [id],
      )

      const fundingRes = await client.query(
        `SELECT id, source_type, loan_id, amount
         FROM senteloans_investment_funding_sources
         WHERE investment_id = $1
         ORDER BY created_at ASC`,
        [id],
      )

      const latestValuationRes = await client.query(
        `SELECT valuation_date, value
         FROM senteloans_investment_valuations
         WHERE investment_id = $1
         ORDER BY valuation_date DESC, created_at DESC
         LIMIT 1`,
        [id],
      )
      const latestValuation = latestValuationRes.rows[0] || null

      return { investment, partners: partnersRes.rows, funding: fundingRes.rows, latestValuation }
    })

    if (result && "error" in result) {
      const code = result.error === "investment_not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: code })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const providerId = String(body.providerId || body.provider_id || "").trim() || null
    const category = String(body.investmentType || body.category || "").trim()
    const investmentName = String(body.investmentName || body.investment_name || "").trim() || null
    const investmentAddress = String(body.investmentAddress || body.investment_address || "").trim() || null
    const description = String(body.description || "").trim() || null
    const initialAmount = Number(body.principalAmount ?? body.initial_amount ?? 0)
    const currentValue = Number(body.currentValue ?? body.current_value ?? initialAmount)
    const expectedPercentage = Number(body.expectedPercentagePerAnnum ?? body.expected_percentage ?? 0)
    const extractedReturns = Number(
      body.extractedReturns ?? body.extracted_returns ?? body.expectedReturns ?? body.expected_returns ?? 0,
    )
    const riskLevel = String(body.riskLevel || body.risk_level || "").trim().toLowerCase()
    const startDate = normalizeDate(body.startDate ?? body.start_date)
    const maturityDate = normalizeDate(body.maturityDate ?? body.maturity_date)
    const status = String(body.status || "pending").trim().toLowerCase()
    const periodInMonths = body.period_in_months === null || typeof body.period_in_months === "undefined" ? null : Number(body.period_in_months)
    const periodInYears = body.period_in_years === null || typeof body.period_in_years === "undefined" ? null : Number(body.period_in_years)

    if (!category) return NextResponse.json({ error: "investment_type_required" }, { status: 400 })
    if (!["fixed_income", "project", "equity", "partnership"].includes(category)) return NextResponse.json({ error: "invalid_investment_type" }, { status: 400 })
    if (category === "project" && providerId) return NextResponse.json({ error: "project_investments_cannot_have_provider" }, { status: 400 })
    if (!["low", "medium", "high"].includes(riskLevel)) return NextResponse.json({ error: "invalid_risk_level" }, { status: 400 })
    if (!startDate) return NextResponse.json({ error: "start_date_required" }, { status: 400 })
    if (maturityDate && maturityDate < startDate) return NextResponse.json({ error: "maturity_before_start" }, { status: 400 })
    if (Number.isNaN(initialAmount) || initialAmount < 0) return NextResponse.json({ error: "invalid_initial_amount" }, { status: 400 })
    if (Number.isNaN(currentValue) || currentValue < 0) return NextResponse.json({ error: "invalid_current_value" }, { status: 400 })
    if (Number.isNaN(extractedReturns) || extractedReturns < 0) return NextResponse.json({ error: "invalid_extracted_returns" }, { status: 400 })
    if (periodInMonths !== null && (Number.isNaN(periodInMonths) || periodInMonths <= 0)) return NextResponse.json({ error: "invalid_period_in_months" }, { status: 400 })
    if (periodInYears !== null && (Number.isNaN(periodInYears) || periodInYears <= 0)) return NextResponse.json({ error: "invalid_period_in_years" }, { status: 400 })
    if (periodInMonths !== null && periodInYears !== null) return NextResponse.json({ error: "period_months_and_years_cannot_both_be_set" }, { status: 400 })
    if (!["pending", "approved", "under_development", "active", "matured", "closed", "cancelled"].includes(status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "edit_investment")
      if (!allowed) return { error: "missing_permission:edit_investment" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      await client.query("BEGIN")
      try {
        const existsRes = await client.query(
          `SELECT
             branch_id,
             provider_id, category, description, initial_amount, current_value, expected_percentage, extracted_returns,
             risk_level, start_date, period_in_months, period_in_years, maturity_date, status,
             investment_name, address
           FROM senteloans_investments
           WHERE id = $1 AND institution_id = $2
           ${isSuperAdmin ? "" : "AND branch_id = $3"}
           LIMIT 1`,
          isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
        )
        if (existsRes.rowCount === 0) {
          await client.query("ROLLBACK")
          return { error: "investment_not_found" as const }
        }
        const prevInv = existsRes.rows[0] as Record<string, unknown>
        const investmentBranchId = String(prevInv.branch_id || actor.branch_id || "")

        const updInv = await client.query(
          `UPDATE senteloans_investments
           SET provider_id = $1,
               category = $2,
               description = $3,
               initial_amount = $4,
               current_value = $5,
               expected_percentage = $6,
               extracted_returns = $7,
               risk_level = $8,
               start_date = $9,
               period_in_months = $10,
               period_in_years = $11,
               maturity_date = $12,
               status = $13,
               investment_name = $14,
               address = $15,
               modified_by = $16,
               updated_at = NOW()
           WHERE id = $17
           RETURNING
             provider_id, category, description, initial_amount, current_value, expected_percentage, extracted_returns,
             risk_level, start_date, period_in_months, period_in_years, maturity_date, status,
             investment_name, address`,
          [
            providerId,
            category,
            description,
            initialAmount,
            currentValue,
            expectedPercentage,
            extractedReturns,
            riskLevel,
            startDate,
            periodInMonths,
            periodInYears,
            maturityDate,
            status,
            investmentName,
            investmentAddress,
            actor.id,
            id,
          ],
        )
        const newInv = updInv.rows[0] as Record<string, unknown>

        await auditLogger.logUpdate(
          "senteloans_investments",
          id,
          {
            provider_id: prevInv.provider_id,
            category: prevInv.category,
            description: prevInv.description,
            initial_amount: prevInv.initial_amount,
            current_value: prevInv.current_value,
            expected_percentage: prevInv.expected_percentage,
            extracted_returns: prevInv.extracted_returns,
            risk_level: prevInv.risk_level,
            start_date: prevInv.start_date,
            period_in_months: prevInv.period_in_months,
            period_in_years: prevInv.period_in_years,
            maturity_date: prevInv.maturity_date,
            status: prevInv.status,
            investment_name: prevInv.investment_name,
            address: prevInv.address,
          },
          {
            provider_id: newInv.provider_id,
            category: newInv.category,
            description: newInv.description,
            initial_amount: newInv.initial_amount,
            current_value: newInv.current_value,
            expected_percentage: newInv.expected_percentage,
            extracted_returns: newInv.extracted_returns,
            risk_level: newInv.risk_level,
            start_date: newInv.start_date,
            period_in_months: newInv.period_in_months,
            period_in_years: newInv.period_in_years,
            maturity_date: newInv.maturity_date,
            status: newInv.status,
            investment_name: newInv.investment_name,
            address: newInv.address,
          },
          actor.institution_id,
          actor.id,
          { branch_id: investmentBranchId },
          client,
        )

        await client.query("COMMIT")
        return { ok: true, id }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    })

    if (result && "error" in result) {
      const code = result.error === "investment_not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: code })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const status = String(body.status || "").trim().toLowerCase()
    if (!["pending", "approved", "under_development", "active", "matured", "closed", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "edit_investment_status")
      if (!allowed) return { error: "missing_permission:edit_investment_status" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const prevRes = await client.query(
        `SELECT id, status, institution_id, branch_id
         FROM senteloans_investments
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdmin ? "" : "AND branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      if (prevRes.rowCount === 0) return { error: "investment_not_found" as const }
      const prevStatus = String(prevRes.rows[0]?.status || "")
      const institutionId = String(prevRes.rows[0]?.institution_id || actor.institution_id)
      const investmentBranchId = String(prevRes.rows[0]?.branch_id || actor.branch_id || "")

      await client.query(
        `UPDATE senteloans_investments
         SET status = $1,
             modified_by = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [status, actor.id, id],
      )
      await auditLogger.logUpdate(
        "senteloans_investments",
        id,
        { status: prevStatus },
        { status },
        institutionId,
        actor.id,
        { branch_id: investmentBranchId },
        client,
      )
      return { ok: true, id }
    })

    if (result && "error" in result) {
      const code = result.error === "investment_not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: code })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.status.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
