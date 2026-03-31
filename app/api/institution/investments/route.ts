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

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "investments.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "investments.list.denied", { method: "GET", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const investmentType = (url.searchParams.get("investment_type") || "").trim()
    const riskLevel = (url.searchParams.get("risk_level") || "").trim()
    const startDateStart = (url.searchParams.get("startDateStart") || "").trim()
    const startDateEnd = (url.searchParams.get("startDateEnd") || "").trim()
    const maturityDateStart = (url.searchParams.get("maturityDateStart") || "").trim()
    const maturityDateEnd = (url.searchParams.get("maturityDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "i.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (!isSuperAdmin) {
        where += ` AND i.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND i.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }
      if (status) {
        where += ` AND LOWER(i.status) = LOWER($${idx++})`
        params.push(status)
      }
      if (investmentType) {
        where += ` AND LOWER(i.category) = LOWER($${idx++})`
        params.push(investmentType)
      }
      if (riskLevel) {
        where += ` AND LOWER(i.risk_level) = LOWER($${idx++})`
        params.push(riskLevel)
      }
      if (startDateStart) {
        where += ` AND i.start_date >= $${idx++}::date`
        params.push(startDateStart)
      }
      if (startDateEnd) {
        where += ` AND i.start_date <= $${idx++}::date`
        params.push(startDateEnd)
      }
      if (maturityDateStart) {
        where += ` AND i.maturity_date >= $${idx++}::date`
        params.push(maturityDateStart)
      }
      if (maturityDateEnd) {
        where += ` AND i.maturity_date <= $${idx++}::date`
        params.push(maturityDateEnd)
      }
      if (q) {
        where += ` AND (
          ('INV-' || UPPER(LEFT(i.id::text, 8))) ILIKE $${idx}
          OR c.name ILIKE $${idx}
          OR i.description ILIKE $${idx}
        )`
        params.push(`%${q}%`)
        idx++
      }

      const countRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM senteloans_investments i
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         WHERE ${where}`,
        params,
      )
      const total = Number(countRes.rows[0]?.c || 0)
      const offset = (page - 1) * pageSize

      const dataRes = await client.query(
        `SELECT
           i.id,
           i.provider_id,
           c.name AS client_name,
           i.category,
           i.risk_level,
           i.initial_amount,
           i.current_value,
           i.expected_percentage,
           i.expected_returns,
           i.start_date,
           i.maturity_date,
           i.status,
           i.description,
           i.created_by,
           u.full_name AS created_by_name,
           i.created_at
         FROM senteloans_investments i
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         LEFT JOIN senteloans_users u ON u.id = i.created_by
         WHERE ${where}
         ORDER BY i.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      )

      const items = dataRes.rows.map((row: any) => ({
        id: row.id,
        investment_number: `INV-${String(row.id || "").slice(0, 8).toUpperCase()}`,
        provider_id: row.provider_id,
        client_name: row.client_name || "",
        product_name: row.category || "",
        investment_type: row.category || "",
        risk_level: row.risk_level || "",
        principal_amount: Number(row.initial_amount || 0),
        expected_return_amount: Number(row.expected_returns || 0),
        expected_percentage_per_annum: Number(row.expected_percentage || 0),
        start_date: row.start_date,
        maturity_date: row.maturity_date,
        status: row.status || "pending",
        description: row.description || "",
        created_by: row.created_by,
        created_by_name: row.created_by_name || "",
        created_at: row.created_at,
      }))

      return { items, total, page, pageSize }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "investments.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "investments.list.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "investments.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "investments.create.denied", { method: "POST", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const providerId = String(body.providerId || body.provider_id || body.clientId || body.client_id || "").trim() || null
    const category = String(body.investmentType || body.category || "").trim()
    const description = String(body.description || "").trim() || null
    const initialAmount = Number(body.principalAmount ?? body.initial_amount ?? 0)
    const currentValue = Number(body.currentValue ?? body.current_value ?? initialAmount)
    const expectedPercentage = Number(body.expectedPercentagePerAnnum ?? body.expected_percentage ?? 0)
    const expectedReturns = Number(body.expectedReturns ?? body.expected_returns ?? 0)
    const riskLevel = String(body.riskLevel || body.risk_level || "").trim().toLowerCase()
    const startDate = normalizeDate(body.startDate ?? body.start_date)
    const maturityDate = normalizeDate(body.maturityDate ?? body.maturity_date)
    const status = String(body.status || "pending").trim().toLowerCase()
    const funding = Array.isArray(body.funding) ? (body.funding as Array<Record<string, unknown>>) : []

    if (!category) return NextResponse.json({ error: "investment_type_required" }, { status: 400 })
    if (!["fixed_income", "project", "equity", "partnership"].includes(category)) {
      return NextResponse.json({ error: "invalid_investment_type" }, { status: 400 })
    }
    if (!["low", "medium", "high"].includes(riskLevel)) return NextResponse.json({ error: "invalid_risk_level" }, { status: 400 })
    if (!startDate) return NextResponse.json({ error: "start_date_required" }, { status: 400 })
    if (Number.isNaN(initialAmount) || initialAmount < 0) return NextResponse.json({ error: "invalid_initial_amount" }, { status: 400 })
    if (Number.isNaN(currentValue) || currentValue < 0) return NextResponse.json({ error: "invalid_current_value" }, { status: 400 })
    if (Number.isNaN(expectedPercentage)) return NextResponse.json({ error: "invalid_expected_percentage" }, { status: 400 })
    if (Number.isNaN(expectedReturns) || expectedReturns < 0) return NextResponse.json({ error: "invalid_expected_returns" }, { status: 400 })
    if (!["pending", "active", "matured", "closed", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      if (providerId) {
        const clientRes = await client.query(
          `SELECT id FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
          [providerId, actor.institution_id],
        )
        if (clientRes.rowCount === 0) return { error: "client_not_found" as const }
      }

      await client.query("BEGIN")
      try {
        const insertRes = await client.query<{ id: string }>(
          `INSERT INTO senteloans_investments (
             institution_id, branch_id, provider_id, category, description, initial_amount, current_value,
             expected_percentage, expected_returns, risk_level, start_date, maturity_date, status,
             created_by, modified_by, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13,
             $14, $14, NOW()
           )
           RETURNING id`,
          [
            actor.institution_id,
            actor.branch_id,
            providerId,
            category,
            description,
            initialAmount,
            currentValue,
            expectedPercentage,
            expectedReturns,
            riskLevel,
            startDate,
            maturityDate,
            status,
            actor.id,
          ],
        )

        const investmentId = insertRes.rows[0].id

        for (const row of funding) {
          const sourceType = String(row.type || row.source_type || "").trim().toLowerCase()
          const amount = Number(row.amount || 0)
          const loanId = String(row.loanId || row.loan_id || "").trim() || null
          if (!sourceType) continue
          if (!["savings", "shares", "reserves", "loan", "grant"].includes(sourceType)) {
            await client.query("ROLLBACK")
            return { error: "invalid_funding_source_type" as const }
          }
          if (!(amount > 0)) {
            await client.query("ROLLBACK")
            return { error: "invalid_funding_amount" as const }
          }
          if (sourceType === "loan" && !loanId) {
            await client.query("ROLLBACK")
            return { error: "loan_id_required_for_funding_type_loan" as const }
          }
          await client.query(
            `INSERT INTO senteloans_investment_funding_sources (investment_id, source_type, loan_id, amount)
             VALUES ($1, $2, $3, $4)`,
            [investmentId, sourceType, sourceType === "loan" ? loanId : null, amount],
          )
        }

        await client.query("COMMIT")

        await client.query(
          `INSERT INTO senteloans_audit_logs
             (institution_id, branch_id, user_id, table_name, operation, record_id, new_values)
           VALUES ($1, $2, $3, 'senteloans_investments', 'INSERT', $4, $5)`,
          [
            actor.institution_id,
            actor.branch_id,
            actor.id,
            investmentId,
            JSON.stringify({
              provider_id: providerId,
              category,
              initial_amount: initialAmount,
              current_value: currentValue,
              expected_percentage: expectedPercentage,
              expected_returns: expectedReturns,
              risk_level: riskLevel,
              start_date: startDate,
              maturity_date: maturityDate,
              status,
              funding_count: funding.length,
            }),
          ],
        )

        return { ok: true, id: investmentId }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "client_not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "investments.create.denied", { method: "POST", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "investments.create.success", { method: "POST", apiPath, status: 201, investmentId: result.id, authUserId: session.user.authUserId })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investments.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
