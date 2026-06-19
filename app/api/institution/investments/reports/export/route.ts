import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"
import {
  renderInvestmentReportsPdfBuffer,
  type InvestmentReportExportRow,
} from "./investment-reports-pdf"

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

const MONTH_ORDER = [
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
]

type BranchScope = { id: string; name: string }

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

function capitalizeMonth(m: string): string {
  const s = m.trim().toLowerCase()
  if (!s) return m
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))
}

/** e.g. march-2026 → March 2026 */
function formatReportPeriodLabel(period: string): string {
  const raw = String(period || "").trim().toLowerCase()
  const m = raw.match(/^([a-z]+)-(\d{4})$/)
  if (!m) return period || "—"
  const month = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `${month} ${m[2]}`
}

function buildExportTitle(input: {
  periodMonths: string[]
  periodYears: number[]
  q: string
  recordedDateStart: string
  recordedDateEnd: string
}): string {
  const hasFilters =
    input.periodMonths.length > 0 ||
    input.periodYears.length > 0 ||
    !!input.q.trim() ||
    !!input.recordedDateStart ||
    !!input.recordedDateEnd

  if (!hasFilters) return "Investment Reports List"

  const parts: string[] = []

  if (input.periodMonths.length > 0) {
    parts.push(sortMonths(input.periodMonths).map(capitalizeMonth).join(" "))
  }

  if (input.periodYears.length > 0) {
    parts.push(
      [...input.periodYears]
        .sort((a, b) => a - b)
        .map((y) => String(y))
        .join(" "),
    )
  }

  parts.push("Investment Reports List")

  if (input.q.trim()) {
    parts.push(`For ${input.q.trim()}`)
  }

  if (input.recordedDateStart || input.recordedDateEnd) {
    parts.push(`Recorded from ${input.recordedDateStart || "—"} to ${input.recordedDateEnd || "—"}`)
  }

  return parts.join(" ").replace(/\s+/g, " ").trim()
}

type FilterBundle = {
  q: string
  recordedDateStart: string
  recordedDateEnd: string
  periodMonths: string[]
  periodYears: number[]
}

function appendReportFilters(where: string, params: unknown[], idx: number, filters: FilterBundle) {
  let w = where
  const p = [...params]
  let i = idx

  if (filters.q) {
    w += ` AND (
          r.report_number ILIKE $${i}
          OR i.investment_number ILIKE $${i}
          OR COALESCE(i.investment_name, '') ILIKE $${i}
          OR COALESCE(c.name, '') ILIKE $${i}
        )`
    p.push(`%${filters.q}%`)
    i++
  }

  if (isIsoDate(filters.recordedDateStart)) {
    w += ` AND r.created_at::date >= $${i++}::date`
    p.push(filters.recordedDateStart)
  }
  if (isIsoDate(filters.recordedDateEnd)) {
    w += ` AND r.created_at::date <= $${i++}::date`
    p.push(filters.recordedDateEnd)
  }

  if (filters.periodMonths.length > 0) {
    w += ` AND lower(split_part(r.report_period, '-', 1)) = ANY($${i++}::text[])`
    p.push(filters.periodMonths)
  }

  if (filters.periodYears.length > 0) {
    w += ` AND split_part(r.report_period, '-', 2) ~ '^[0-9]{4}$'
                AND split_part(r.report_period, '-', 2)::int = ANY($${i++}::int[])`
    p.push(filters.periodYears)
  }

  return { where: w, params: p, nextIdx: i }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
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
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const filterBundle: FilterBundle = {
      q,
      recordedDateStart,
      recordedDateEnd,
      periodMonths,
      periodYears,
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "view_investment_reports")
      if (!allowed) return { error: "missing_permission:view_investment_reports" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (actorRole === "super_admin") {
        const branchRes = await client.query(
          `SELECT id, name
           FROM branches
           WHERE institution_id = $1
           ORDER BY name ASC`,
          [actor.institution_id],
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [
          actor.branch_id,
        ])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildExportTitle({
        periodMonths,
        periodYears,
        q,
        recordedDateStart,
        recordedDateEnd,
      })

      const sheets: Array<{ branch_name: string; rows: InvestmentReportExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "i.institution_id = $1 AND i.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        const built = appendReportFilters(where, params, 3, filterBundle)
        where = built.where
        const queryParams = built.params

        const dataRes = await client.query(
          `SELECT
             r.report_number,
             r.report_period,
             i.investment_number,
             COALESCE(i.investment_name, '') AS investment_name,
             COALESCE(c.name, '') AS provider_name,
             r.opening_value,
             r.capital_inflow,
             r.capital_outflow,
             r.income,
             r.expenses,
             r.closing_value,
             r.notes,
             r.created_at,
             u.full_name AS created_by_name
           FROM senteloans_investment_reports r
           INNER JOIN senteloans_investments i ON i.id = r.investment_id
           LEFT JOIN senteloans_clients c ON c.id = i.provider_id
           LEFT JOIN users u ON u.id = r.created_by
           WHERE ${where}
           ORDER BY r.created_at DESC`,
          queryParams,
        )

        sheets.push({
          branch_name: branch.name,
          rows: dataRes.rows.map((row: Record<string, unknown>) => ({
            report_number: String(row.report_number || ""),
            report_period_label: formatReportPeriodLabel(String(row.report_period || "")),
            investment_number: String(row.investment_number || ""),
            investment_name: String(row.investment_name || ""),
            provider_name: String(row.provider_name || ""),
            opening_value: Number(row.opening_value || 0),
            capital_inflow: Number(row.capital_inflow || 0),
            capital_outflow: Number(row.capital_outflow || 0),
            income: Number(row.income || 0),
            expenses: Number(row.expenses || 0),
            closing_value: Number(row.closing_value || 0),
            notes: row.notes != null ? String(row.notes) : "",
            created_at: row.created_at != null ? String(row.created_at) : null,
            created_by_name: String(row.created_by_name || ""),
          })),
        })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "user_not_linked" || result.error.startsWith("missing_permission:") ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || "error" in result) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = [
        "Report #",
        "Period",
        "Investment #",
        "Investment name",
        "Provider",
        "Opening",
        "Capital inflow",
        "Capital outflow",
        "Income",
        "Expenses",
        "Closing",
        "Notes",
        "Recorded date",
        "Recorded by",
      ]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Investment Reports List", headers, "A1:N1")
        ws.columns = [
          { width: 16 },
          { width: 14 },
          { width: 14 },
          { width: 22 },
          { width: 20 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 12 },
          { width: 12 },
          { width: 14 },
          { width: 28 },
          { width: 12 },
          { width: 18 },
        ]
        for (const row of sheet.rows || []) {
          ws.addRow([
            row.report_number,
            row.report_period_label,
            row.investment_number,
            row.investment_name,
            row.provider_name,
            row.opening_value,
            row.capital_inflow,
            row.capital_outflow,
            row.income,
            row.expenses,
            row.closing_value,
            row.notes,
            row.created_at ? formatIsoDateForExcel(row.created_at) : "",
            row.created_by_name,
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="investment-reports-list-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderInvestmentReportsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="investment-reports-list-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: "invalid_format" }, { status: 400 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
