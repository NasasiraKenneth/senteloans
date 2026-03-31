import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return actorRes.rows[0] || null
}

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
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const invRes = await client.query(
        `SELECT
           i.id, i.investment_number, i.provider_id, c.name AS provider_name, i.category, i.description,
           i.initial_amount, i.current_value, i.expected_percentage, i.expected_returns, i.risk_level,
           i.start_date, i.period_in_months, i.period_in_years, i.maturity_date, i.status,
           i.created_by, i.created_at, i.modified_by, i.updated_at,
           ip.name AS investment_name, ip.address AS investment_address
         FROM senteloans_investments i
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         LEFT JOIN senteloans_investment_products ip ON ip.investment_id = i.id
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

      return { investment, partners: partnersRes.rows, funding: fundingRes.rows }
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
    const investmentName = String(body.investmentName || body.investment_name || "").trim()
    const investmentAddress = String(body.investmentAddress || body.investment_address || "").trim()
    const description = String(body.description || "").trim() || null
    const initialAmount = Number(body.principalAmount ?? body.initial_amount ?? 0)
    const currentValue = Number(body.currentValue ?? body.current_value ?? initialAmount)
    const expectedPercentage = Number(body.expectedPercentagePerAnnum ?? body.expected_percentage ?? 0)
    const expectedReturns = Number(body.expectedReturns ?? body.expected_returns ?? 0)
    const riskLevel = String(body.riskLevel || body.risk_level || "").trim().toLowerCase()
    const startDate = normalizeDate(body.startDate ?? body.start_date)
    const maturityDate = normalizeDate(body.maturityDate ?? body.maturity_date)
    const status = String(body.status || "pending").trim().toLowerCase()
    const periodInMonths = body.period_in_months === null || typeof body.period_in_months === "undefined" ? null : Number(body.period_in_months)
    const periodInYears = body.period_in_years === null || typeof body.period_in_years === "undefined" ? null : Number(body.period_in_years)

    if (!category) return NextResponse.json({ error: "investment_type_required" }, { status: 400 })
    if (!["fixed_income", "project", "equity", "partnership"].includes(category)) return NextResponse.json({ error: "invalid_investment_type" }, { status: 400 })
    if (!["low", "medium", "high"].includes(riskLevel)) return NextResponse.json({ error: "invalid_risk_level" }, { status: 400 })
    if (!startDate) return NextResponse.json({ error: "start_date_required" }, { status: 400 })
    if (Number.isNaN(initialAmount) || initialAmount < 0) return NextResponse.json({ error: "invalid_initial_amount" }, { status: 400 })
    if (Number.isNaN(currentValue) || currentValue < 0) return NextResponse.json({ error: "invalid_current_value" }, { status: 400 })
    if (Number.isNaN(expectedReturns) || expectedReturns < 0) return NextResponse.json({ error: "invalid_expected_returns" }, { status: 400 })
    if (periodInMonths !== null && (Number.isNaN(periodInMonths) || periodInMonths <= 0)) return NextResponse.json({ error: "invalid_period_in_months" }, { status: 400 })
    if (periodInYears !== null && (Number.isNaN(periodInYears) || periodInYears <= 0)) return NextResponse.json({ error: "invalid_period_in_years" }, { status: 400 })
    if (periodInMonths !== null && periodInYears !== null) return NextResponse.json({ error: "period_months_and_years_cannot_both_be_set" }, { status: 400 })
    if (!["pending", "active", "matured", "closed", "cancelled"].includes(status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      await client.query("BEGIN")
      try {
        const existsRes = await client.query(
          `SELECT id
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

        await client.query(
          `UPDATE senteloans_investments
           SET provider_id = $1,
               category = $2,
               description = $3,
               initial_amount = $4,
               current_value = $5,
               expected_percentage = $6,
               expected_returns = $7,
               risk_level = $8,
               start_date = $9,
               period_in_months = $10,
               period_in_years = $11,
               maturity_date = $12,
               status = $13,
               modified_by = $14,
               updated_at = NOW()
           WHERE id = $15`,
          [
            providerId,
            category,
            description,
            initialAmount,
            currentValue,
            expectedPercentage,
            expectedReturns,
            riskLevel,
            startDate,
            periodInMonths,
            periodInYears,
            maturityDate,
            status,
            actor.id,
            id,
          ],
        )

        const productExists = await client.query(
          `SELECT id FROM senteloans_investment_products WHERE investment_id = $1 LIMIT 1`,
          [id],
        )
        if (productExists.rowCount > 0) {
          await client.query(
            `UPDATE senteloans_investment_products
             SET name = $1, address = $2, modified_by = $3, updated_at = NOW()
             WHERE investment_id = $4`,
            [investmentName || null, investmentAddress || null, actor.id, id],
          )
        } else if (investmentName || investmentAddress) {
          await client.query(
            `INSERT INTO senteloans_investment_products (investment_id, name, address, created_by, modified_by, updated_at)
             VALUES ($1, $2, $3, $4, $4, NOW())`,
            [id, investmentName || null, investmentAddress || null, actor.id],
          )
        }

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
