import type { PoolClient } from "pg"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import {
  buildLoanReportWhere,
  enrichLoanReportRows,
  type LoanReportFilters,
  type LoanReportItem,
} from "@/lib/reports/loan-report"
import { renderLoanReportPdfBuffer } from "@/lib/reports/loan-report-pdf"

type BranchScope = { id: string; name: string }

export type LoanReportExportSheet = {
  branch_name: string
  rows: LoanReportItem[]
}

export type LoanReportExportPayload = {
  title: string
  currency: string
  sheets: LoanReportExportSheet[]
  rowCount: number
}

export type LoanReportExportResult =
  | { ok: true; buffer: Buffer; filename: string; contentType: string; rowCount: number }
  | { ok: false; error: string }

const LIST_SQL = `SELECT
  l.id,
  l.application_id,
  l.member_id,
  l.loan_product_id,
  l.created_by,
  l.approved_by,
  l.principal_amount,
  l.interest_rate,
  l.tenure_months,
  l.outstanding_balance,
  l.status,
  l.loan_type,
  l.application_date,
  l.reviewed_at,
  l.approved_at,
  l.next_payment_date,
  l.disbursement_date,
  l.reviewed_by
FROM loans l
WHERE `

export function parseLoanReportFilters(filters: Record<string, string>): LoanReportFilters {
  const productIdRaw = (filters.product_id || "").trim()
  const branchesRaw = (filters.branches || "").trim()
  return {
    status: (filters.status || "").trim() || undefined,
    loanType: (filters.loan_type || "").trim().toLowerCase() || undefined,
    productIds: productIdRaw ? productIdRaw.split(",").map((v) => v.trim()).filter(Boolean) : [],
    selectedBranchIds: branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : [],
    applicationDateStart: (filters.applicationDateStart || "").trim() || undefined,
    applicationDateEnd: (filters.applicationDateEnd || "").trim() || undefined,
    reviewedDateStart: (filters.reviewedDateStart || "").trim() || undefined,
    reviewedDateEnd: (filters.reviewedDateEnd || "").trim() || undefined,
    approvedDateStart: (filters.approvedDateStart || "").trim() || undefined,
    approvedDateEnd: (filters.approvedDateEnd || "").trim() || undefined,
    disbursedDateStart: (filters.disbursedDateStart || "").trim() || undefined,
    disbursedDateEnd: (filters.disbursedDateEnd || "").trim() || undefined,
    search: (filters.search || "").trim() || undefined,
    overdueOnly: filters.overdue_only === "true",
  }
}

function formatRange(start?: string, end?: string): string {
  const s = String(start || "").trim()
  const e = String(end || "").trim()
  if (s && e) return `${s} - ${e}`
  if (s) return s
  if (e) return e
  return ""
}

export function buildLoanReportExportTitle(
  filters: LoanReportFilters,
  productName?: string,
): string {
  const statusUsed = Boolean(filters.status)
  const loanTypeUsed = Boolean(filters.loanType)
  const productUsed = Boolean(productName)
  const applied = formatRange(filters.applicationDateStart, filters.applicationDateEnd)
  const reviewed = formatRange(filters.reviewedDateStart, filters.reviewedDateEnd)
  const approved = formatRange(filters.approvedDateStart, filters.approvedDateEnd)
  const disbursed = formatRange(filters.disbursedDateStart, filters.disbursedDateEnd)
  const hasAnyFilter =
    statusUsed ||
    loanTypeUsed ||
    productUsed ||
    Boolean(applied || reviewed || approved || disbursed || filters.search || filters.overdueOnly)
  if (!hasAnyFilter) return "All Loans"

  const parts: string[] = []
  if (statusUsed) parts.push(String(filters.status))
  if (loanTypeUsed) parts.push(String(filters.loanType))
  if (productUsed) parts.push(`${productName}s`)
  else parts.push("Loans")
  if (applied) parts.push(`applied at : ${applied}`)
  if (reviewed) parts.push(`reviewed at : ${reviewed}`)
  if (approved) parts.push(`approved at : ${approved}`)
  if (disbursed) parts.push(`disbursed at : ${disbursed}`)
  if (filters.search) parts.push(`search: ${filters.search}`)
  if (filters.overdueOnly) parts.push("overdue only")
  return parts.join(" ")
}

export function buildLoanReportExportTable(rows: LoanReportItem[], currency: string) {
  const maxDisbursedByCols = Math.max(
    0,
    ...rows.map((r) => (Array.isArray(r.disbursed_by) ? r.disbursed_by.length : 0)),
  )
  const maxGuarantorCols = Math.max(
    0,
    ...rows.map((r) => (Array.isArray(r.guarantors) ? r.guarantors.length : 0)),
  )
  const headers = [
    "Application ID",
    "Member",
    "Member No",
    "Product",
    "Loan type",
    "Reviewed at",
    "Reviewed by",
    "Approved at",
    "Disbursed at",
    "Approved by",
    "Created by",
    ...Array.from({ length: maxDisbursedByCols }).map((_, idx) => `Disbursed by ${idx + 1}`),
    ...Array.from({ length: maxGuarantorCols }).map((_, idx) => `Guarantor ${idx + 1}`),
    `Principal (${currency})`,
    `Outstanding (${currency})`,
    "Interest rate %",
    "Tenure (mo)",
    `Total amount paid (${currency})`,
    `Total interest (${currency})`,
    `Penalties collected (${currency})`,
    "Avg late pay days",
    "Total early payments",
    "Overdue",
    "Status",
    "Applied",
    "Next due",
  ]
  const body = rows.map((r) => [
    String(r.application_id || ""),
    String(r.memberName || ""),
    String(r.memberNumber || ""),
    String(r.productName || ""),
    String(r.loan_type || ""),
    String(r.reviewed_at || "").slice(0, 10),
    String(r.reviewed_by_name || ""),
    String(r.approved_at || "").slice(0, 10),
    String(r.disbursed_at || "").slice(0, 10),
    String(r.approved_by_name || ""),
    String(r.created_by_name || ""),
    ...Array.from({ length: maxDisbursedByCols }).map((_, idx) => String(r.disbursed_by?.[idx] || "")),
    ...Array.from({ length: maxGuarantorCols }).map((_, idx) => String(r.guarantors?.[idx] || "")),
    Number(r.principal_amount || 0),
    Number(r.outstanding_balance || 0),
    Number(r.interest_rate || 0),
    Number(r.tenure_months || 0),
    Number(r.total_amount_paid || 0),
    Number(r.total_interest || 0),
    Number(r.penalties_collected || 0),
    Number(r.late_pay_days_avg || 0),
    Number(r.early_payments || 0),
    r.overdue ? "Yes" : "No",
    String(r.status || ""),
    String(r.application_date || "").slice(0, 10),
    String(r.next_payment_date || "").slice(0, 10),
  ])
  return { headers, body }
}

async function fetchLoanReportItems(
  client: PoolClient,
  actor: Awaited<ReturnType<typeof resolveActorContext>>,
  filters: LoanReportFilters,
): Promise<LoanReportItem[]> {
  if (!actor) return []
  const { where, params } = buildLoanReportWhere(actor, filters)
  const dataRes = await client.query(
    `${LIST_SQL}${where}
     ORDER BY l.application_date DESC NULLS LAST, l.created_at DESC`,
    params,
  )
  return enrichLoanReportRows(client, dataRes.rows)
}

async function resolveBranchScopes(
  client: PoolClient,
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
  selectedBranchIds: string[],
): Promise<BranchScope[]> {
  if (isSuperAdmin(actor)) {
    const branchRes = await client.query(
      `SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`,
      [actor.institution_id],
    )
    const allBranches = branchRes.rows as BranchScope[]
    if (selectedBranchIds.length > 0) {
      return allBranches.filter((b) => selectedBranchIds.includes(b.id))
    }
    return allBranches
  }
  if (!actor.branch_id) return []
  const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [
    actor.branch_id,
  ])
  return branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
}

export async function fetchLoanReportExportPayload(
  authUserId: string,
  filters: Record<string, string>,
): Promise<LoanReportExportPayload | { error: string }> {
  const parsed = parseLoanReportFilters(filters)

  return runWithAuth(authUserId, async (client) => {
    const actor = await resolveActorContext(client, authUserId)
    if (!actor?.institution_id) return { error: "user_not_linked" as const }
    const allowed = await hasPermission(client, actor, "view_loans")
    if (!allowed) return { error: "missing_permission:view_loans" as const }
    if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

    let productName: string | undefined
    if (parsed.productIds?.length === 1) {
      const pRes = await client.query(`SELECT product_name FROM loan_products WHERE id = $1 LIMIT 1`, [
        parsed.productIds[0],
      ])
      productName = pRes.rows[0]?.product_name ? String(pRes.rows[0].product_name) : undefined
    }

    const title = buildLoanReportExportTitle(parsed, productName)
    const branchScopes = await resolveBranchScopes(client, actor, parsed.selectedBranchIds ?? [])
    const sheets: LoanReportExportSheet[] = []

    if (isSuperAdmin(actor)) {
      const selected = parsed.selectedBranchIds ?? []
      const targetBranchIds =
        selected.length > 0 ? selected : branchScopes.map((b) => b.id)

      if (targetBranchIds.length === 0) {
        const rows = await fetchLoanReportItems(client, actor, parsed)
        sheets.push({ branch_name: "All branches", rows })
      } else {
        for (const branchId of targetBranchIds) {
          const branch = branchScopes.find((b) => b.id === branchId)
          const branchFilters = { ...parsed, selectedBranchIds: [branchId] }
          const rows = await fetchLoanReportItems(client, actor, branchFilters)
          sheets.push({ branch_name: branch?.name || "Branch", rows })
        }
      }
    } else {
      const rows = await fetchLoanReportItems(client, actor, parsed)
      const branchName = branchScopes[0]?.name || "My branch"
      sheets.push({ branch_name: branchName, rows })
    }

    const cfgRes = actor.branch_id
      ? await client.query(`SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`, [actor.branch_id])
      : await client.query(
          `SELECT c.currency FROM config c
           JOIN branches b ON b.id = c.branch_id
           WHERE b.institution_id = $1
           ORDER BY b.name ASC
           LIMIT 1`,
          [actor.institution_id],
        )
    const currency = String(cfgRes.rows[0]?.currency || "UGX")
    const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0)

    return { title, currency, sheets, rowCount }
  })
}

export async function buildLoanReportExcelBuffer(payload: LoanReportExportPayload): Promise<Buffer> {
  const workbook = await createExcelWorkbook()
  for (const sheet of payload.sheets) {
    const { headers, body } = buildLoanReportExportTable(sheet.rows, payload.currency)
    const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
    addExcelTitleAndHeaders(ws, payload.title, headers, `A1:Z1`)
    ws.columns = headers.map(() => ({ width: 16 }))
    for (const row of body) {
      ws.addRow(row)
    }
  }
  const out = await workbook.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

export async function generateLoanReportExport(input: {
  authUserId: string
  format: "excel" | "pdf"
  filters: Record<string, string>
}): Promise<LoanReportExportResult> {
  const payload = await fetchLoanReportExportPayload(input.authUserId, input.filters)
  if ("error" in payload) {
    return { ok: false, error: payload.error }
  }
  if (payload.rowCount === 0) {
    return { ok: false, error: "no_rows" }
  }

  const date = new Date().toISOString().slice(0, 10)
  if (input.format === "excel") {
    const buffer = await buildLoanReportExcelBuffer(payload)
    return {
      ok: true,
      buffer,
      filename: `loan-portfolio-report-${date}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      rowCount: payload.rowCount,
    }
  }

  const buffer = await renderLoanReportPdfBuffer(payload)
  return {
    ok: true,
    buffer,
    filename: `loan-portfolio-report-${date}.pdf`,
    contentType: "application/pdf",
    rowCount: payload.rowCount,
  }
}
