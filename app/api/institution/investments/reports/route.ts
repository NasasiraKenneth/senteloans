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

const ALLOWED_PERIOD_MONTHS = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
])

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

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

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()
    const recordedDateStart = (url.searchParams.get("recordedDateStart") || "").trim().slice(0, 10)
    const recordedDateEnd = (url.searchParams.get("recordedDateEnd") || "").trim().slice(0, 10)
    const periodMonthsRaw = (url.searchParams.get("periodMonths") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const periodMonths = [...new Set(periodMonthsRaw.filter((m) => ALLOWED_PERIOD_MONTHS.has(m)))]
    const periodYearsRaw = (url.searchParams.get("periodYears") || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100)
    const periodYears = [...new Set(periodYearsRaw)]

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
      }

      if (q) {
        where += ` AND (
          r.report_number ILIKE $${idx}
          OR i.investment_number ILIKE $${idx}
          OR COALESCE(ip.name, '') ILIKE $${idx}
          OR COALESCE(c.name, '') ILIKE $${idx}
        )`
        params.push(`%${q}%`)
        idx++
      }

      if (isIsoDate(recordedDateStart)) {
        where += ` AND r.created_at::date >= $${idx++}::date`
        params.push(recordedDateStart)
      }
      if (isIsoDate(recordedDateEnd)) {
        where += ` AND r.created_at::date <= $${idx++}::date`
        params.push(recordedDateEnd)
      }

      if (periodMonths.length > 0) {
        where += ` AND lower(split_part(r.report_period, '-', 1)) = ANY($${idx++}::text[])`
        params.push(periodMonths)
      }

      if (periodYears.length > 0) {
        where += ` AND split_part(r.report_period, '-', 2) ~ '^[0-9]{4}$'
                    AND split_part(r.report_period, '-', 2)::int = ANY($${idx++}::int[])`
        params.push(periodYears)
      }

      const countRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM senteloans_investment_reports r
         INNER JOIN senteloans_investments i ON i.id = r.investment_id
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         LEFT JOIN senteloans_investment_products ip ON ip.investment_id = i.id
         WHERE ${where}`,
        params,
      )
      const total = Number(countRes.rows[0]?.c || 0)
      const offset = (page - 1) * pageSize

      const dataRes = await client.query(
        `SELECT
           r.id,
           r.investment_id,
           i.investment_number,
           COALESCE(ip.name, '') AS investment_name,
           COALESCE(c.name, '') AS provider_name,
           r.report_number,
           r.report_period,
           r.opening_value,
           r.capital_added,
           r.income,
           r.expenses,
           r.closing_value,
           r.notes,
           r.created_at,
           r.updated_at,
           u.full_name AS created_by_name
         FROM senteloans_investment_reports r
         INNER JOIN senteloans_investments i ON i.id = r.investment_id
         LEFT JOIN senteloans_clients c ON c.id = i.provider_id
         LEFT JOIN senteloans_investment_products ip ON ip.investment_id = i.id
         LEFT JOIN senteloans_users u ON u.id = r.created_by
         WHERE ${where}
         ORDER BY r.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      )

      const items = dataRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        investment_id: String(row.investment_id || ""),
        investment_number: String(row.investment_number || ""),
        investment_name: String(row.investment_name || ""),
        provider_name: String(row.provider_name || ""),
        report_number: String(row.report_number || ""),
        report_period: String(row.report_period || ""),
        created_at: row.created_at != null ? String(row.created_at) : "",
        created_by_name: row.created_by_name != null ? String(row.created_by_name) : "",
        extended: {
          opening_value: Number(row.opening_value || 0),
          capital_added: Number(row.capital_added || 0),
          income: Number(row.income || 0),
          expenses: Number(row.expenses || 0),
          closing_value: Number(row.closing_value || 0),
          notes: row.notes != null ? String(row.notes) : null,
          updated_at: row.updated_at != null ? String(row.updated_at) : null,
        },
      }))

      return { items, total, page, pageSize }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "investment_reports.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "investment_reports.list.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "investment_reports.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
