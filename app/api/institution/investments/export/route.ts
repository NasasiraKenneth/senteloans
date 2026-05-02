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
import { renderInvestmentsPdfBuffer, type InvestmentExportRow } from "./investments-pdf"

type BranchScope = { id: string; name: string }

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  fixed_income: "Fixed Income",
  project: "Project",
  equity: "Equity",
  partnership: "Partnership",
}

function investmentTypeLabel(slug: string): string {
  const k = slug.trim().toLowerCase()
  return INVESTMENT_TYPE_LABELS[k] || slug
}

function formatRiskForTitle(risk: string): string {
  const r = risk.trim().toLowerCase()
  if (r === "low") return "Low"
  if (r === "medium") return "Medium"
  if (r === "high") return "High"
  return risk.trim()
}

function formatStatusForRow(status: string): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function buildInvestmentsExportTitle(input: {
  status: string
  investmentType: string
  riskLevel: string
  startDateStart: string
  startDateEnd: string
  maturityDateStart: string
  maturityDateEnd: string
}): string {
  const hasStructured =
    !!input.status.trim() ||
    !!input.investmentType.trim() ||
    !!input.riskLevel.trim() ||
    !!input.startDateStart ||
    !!input.startDateEnd ||
    !!input.maturityDateStart ||
    !!input.maturityDateEnd

  if (!hasStructured) return "Investments List"

  const parts: string[] = []
  if (input.status.trim()) parts.push(input.status.trim())
  if (input.investmentType.trim()) parts.push(investmentTypeLabel(input.investmentType))
  if (input.riskLevel.trim()) parts.push(formatRiskForTitle(input.riskLevel))

  parts.push("Investments List")

  if (input.startDateStart || input.startDateEnd) {
    parts.push(`Starting from ${input.startDateStart || "—"} to ${input.startDateEnd || "—"}`)
  }
  if (input.maturityDateStart || input.maturityDateEnd) {
    parts.push(`Maturity from ${input.maturityDateStart || "—"} to ${input.maturityDateEnd || "—"}`)
  }

  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function appendInvestmentFilters(
  where: string,
  params: unknown[],
  idx: number,
  filters: {
    status: string
    investmentType: string
    riskLevel: string
    startDateStart: string
    startDateEnd: string
    maturityDateStart: string
    maturityDateEnd: string
    q: string
  },
): { where: string; params: unknown[]; nextIdx: number } {
  let w = where
  const p = [...params]
  let i = idx
  if (filters.status) {
    w += ` AND LOWER(i.status) = LOWER($${i++})`
    p.push(filters.status)
  }
  if (filters.investmentType) {
    w += ` AND LOWER(i.category) = LOWER($${i++})`
    p.push(filters.investmentType)
  }
  if (filters.riskLevel) {
    w += ` AND LOWER(i.risk_level) = LOWER($${i++})`
    p.push(filters.riskLevel)
  }
  if (filters.startDateStart) {
    w += ` AND i.start_date >= $${i++}::date`
    p.push(filters.startDateStart)
  }
  if (filters.startDateEnd) {
    w += ` AND i.start_date <= $${i++}::date`
    p.push(filters.startDateEnd)
  }
  if (filters.maturityDateStart) {
    w += ` AND i.maturity_date >= $${i++}::date`
    p.push(filters.maturityDateStart)
  }
  if (filters.maturityDateEnd) {
    w += ` AND i.maturity_date <= $${i++}::date`
    p.push(filters.maturityDateEnd)
  }
  if (filters.q) {
    w += ` AND (
          i.investment_number ILIKE $${i}
          OR c.name ILIKE $${i}
          OR ip.name ILIKE $${i}
          OR i.description ILIKE $${i}
        )`
    p.push(`%${filters.q}%`)
    i++
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
    const status = (url.searchParams.get("status") || "").trim()
    const investmentType = (url.searchParams.get("investment_type") || "").trim()
    const riskLevel = (url.searchParams.get("risk_level") || "").trim()
    const startDateStart = (url.searchParams.get("startDateStart") || "").trim()
    const startDateEnd = (url.searchParams.get("startDateEnd") || "").trim()
    const maturityDateStart = (url.searchParams.get("maturityDateStart") || "").trim()
    const maturityDateEnd = (url.searchParams.get("maturityDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const filterPayload = {
      status,
      investmentType,
      riskLevel,
      startDateStart,
      startDateEnd,
      maturityDateStart,
      maturityDateEnd,
      q,
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasInvestmentPermission(client, actor, "view_investments")
      if (!allowed) return { error: "missing_permission:view_investments" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (actorRole === "super_admin") {
        const branchRes = await client.query(
          `SELECT id, name
           FROM senteloans_branches
           WHERE institution_id = $1
           ORDER BY name ASC`,
          [actor.institution_id],
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM senteloans_branches WHERE id = $1 LIMIT 1`, [
          actor.branch_id,
        ])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildInvestmentsExportTitle({
        status,
        investmentType,
        riskLevel,
        startDateStart,
        startDateEnd,
        maturityDateStart,
        maturityDateEnd,
      })

      const sheets: Array<{ branch_name: string; rows: InvestmentExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "i.institution_id = $1 AND i.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        const built = appendInvestmentFilters(where, params, 3, filterPayload)
        where = built.where
        const queryParams = built.params

        const dataRes = await client.query(
          `SELECT
             i.investment_number,
             c.name AS provider_name,
             ip.name AS investment_name,
             i.category,
             i.risk_level,
             i.initial_amount,
             i.expected_returns,
             i.start_date,
             i.maturity_date,
             i.status,
             u.full_name AS created_by_name
           FROM senteloans_investments i
           LEFT JOIN senteloans_clients c ON c.id = i.provider_id
           LEFT JOIN senteloans_investment_products ip ON ip.investment_id = i.id
           LEFT JOIN senteloans_users u ON u.id = i.created_by
           WHERE ${where}
           ORDER BY i.created_at DESC`,
          queryParams,
        )

        sheets.push({
          branch_name: branch.name,
          rows: dataRes.rows.map((row: Record<string, unknown>) => ({
            investment_number: String(row.investment_number || ""),
            provider_name: String(row.provider_name || ""),
            product_name: String(row.investment_name || ""),
            investment_type: investmentTypeLabel(String(row.category || "")),
            risk_level: formatRiskForTitle(String(row.risk_level || "")),
            principal: Number(row.initial_amount || 0),
            expected_return: Number(row.expected_returns || 0),
            start_date: row.start_date ? String(row.start_date) : null,
            maturity_date: row.maturity_date ? String(row.maturity_date) : null,
            status: formatStatusForRow(String(row.status || "")),
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
        "Investment #",
        "Provider",
        "Product",
        "Type",
        "Risk",
        "Principal",
        "Expected return",
        "Start date",
        "Maturity",
        "Status",
        "Created by",
      ]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Investments List", headers, "A1:K1")
        ws.columns = [
          { width: 18 },
          { width: 22 },
          { width: 20 },
          { width: 14 },
          { width: 10 },
          { width: 14 },
          { width: 14 },
          { width: 12 },
          { width: 12 },
          { width: 12 },
          { width: 18 },
        ]
        for (const row of sheet.rows || []) {
          ws.addRow([
            row.investment_number,
            row.provider_name,
            row.product_name,
            row.investment_type,
            row.risk_level,
            row.principal,
            row.expected_return,
            row.start_date ? formatIsoDateForExcel(row.start_date) : "",
            row.maturity_date ? formatIsoDateForExcel(row.maturity_date) : "",
            row.status,
            row.created_by_name,
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="investments-list-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderInvestmentsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="investments-list-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: "invalid_format" }, { status: 400 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
