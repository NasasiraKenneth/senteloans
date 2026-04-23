"use client"

import { exportExcelWorkbook, type ExcelSheet } from "@/components/export/excel/excel"

type LoanReportRow = {
  application_id: string
  memberName: string
  memberNumber: string
  productName: string
  loan_type: string
  reviewed_at?: string | null
  reviewed_by_name?: string | null
  approved_at?: string | null
  disbursed_at?: string | null
  approved_by_name?: string | null
  created_by_name?: string | null
  disbursed_by?: string[]
  guarantors?: string[]
  principal_amount?: number
  outstanding_balance?: number
  interest_rate?: number
  tenure_months?: number
  total_amount_paid?: number
  total_interest?: number
  penalties_collected?: number
  late_pay_days_avg?: number
  early_payments?: number
  overdue?: boolean
  status?: string
  application_date?: string | null
  next_payment_date?: string | null
}

type BranchOption = { id: string; name: string }
type ProductOption = { id: string; product_name: string }
type DateRange = { start: string; end: string }

type ExportLoanReportsExcelParams = {
  items: LoanReportRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  statusFilter: string
  loanTypeFilter: string
  productId: string
  products: ProductOption[]
  applicationRange: DateRange
  reviewedRange: DateRange
  approvedRange: DateRange
  disbursedRange: DateRange
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function formatRange(range: DateRange): string {
  const start = String(range.start || "").trim()
  const end = String(range.end || "").trim()
  if (start && end) return `${start} - ${end}`
  if (start) return start
  if (end) return end
  return ""
}

function buildSheetTitle(params: {
  statusFilter: string
  loanTypeFilter: string
  productId: string
  products: ProductOption[]
  applicationRange: DateRange
  reviewedRange: DateRange
  approvedRange: DateRange
  disbursedRange: DateRange
}): string {
  const statusUsed = params.statusFilter !== "all"
  const loanTypeUsed = params.loanTypeFilter !== "all"
  const productUsed = params.productId !== "all"
  const appliedUsed = Boolean(formatRange(params.applicationRange))
  const reviewedUsed = Boolean(formatRange(params.reviewedRange))
  const approvedUsed = Boolean(formatRange(params.approvedRange))
  const disbursedUsed = Boolean(formatRange(params.disbursedRange))

  const hasAnyFilter = statusUsed || loanTypeUsed || productUsed || appliedUsed || reviewedUsed || approvedUsed || disbursedUsed
  if (!hasAnyFilter) return "All Loans"

  const parts: string[] = []

  if (statusUsed) parts.push(params.statusFilter)
  if (loanTypeUsed) parts.push(params.loanTypeFilter)

  if (productUsed) {
    const productName = params.products.find((p) => p.id === params.productId)?.product_name || "Loan Product"
    parts.push(`${productName}s`)
  } else {
    parts.push("Loans")
  }

  const applied = formatRange(params.applicationRange)
  const reviewed = formatRange(params.reviewedRange)
  const approved = formatRange(params.approvedRange)
  const disbursed = formatRange(params.disbursedRange)

  if (applied) parts.push(`applied at : ${applied}`)
  if (reviewed) parts.push(`reviewed at : ${reviewed}`)
  if (approved) parts.push(`approved at : ${approved}`)
  if (disbursed) parts.push(`disbursed at : ${disbursed}`)

  return parts.join(" ")
}

function buildExportTable(rows: LoanReportRow[]) {
  const maxDisbursedByCols = Math.max(0, ...rows.map((r) => (Array.isArray(r.disbursed_by) ? r.disbursed_by.length : 0)))
  const maxGuarantorCols = Math.max(0, ...rows.map((r) => (Array.isArray(r.guarantors) ? r.guarantors.length : 0)))
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
    "Principal (UGX)",
    "Outstanding (UGX)",
    "Interest rate %",
    "Tenure (mo)",
    "Total amount paid (UGX)",
    "Total interest (UGX)",
    "Penalties collected (UGX)",
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

export async function exportLoanReportsExcel({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  statusFilter,
  loanTypeFilter,
  productId,
  products,
  applicationRange,
  reviewedRange,
  approvedRange,
  disbursedRange,
  buildQuery,
  apiPath = "/api/institution/reports/loans",
}: ExportLoanReportsExcelParams): Promise<number> {
  const sheets: ExcelSheet[] = []
  let exportedRows = 0
  const sheetTitleLabel = buildSheetTitle({
    statusFilter,
    loanTypeFilter,
    productId,
    products,
    applicationRange,
    reviewedRange,
    approvedRange,
    disbursedRange,
  })

  const addSheet = (worksheetName: string, rows: LoanReportRow[]) => {
    const { headers, body } = buildExportTable(rows)
    sheets.push({ name: worksheetName, title: sheetTitleLabel, headers, rows: body })
    exportedRows += rows.length
  }

  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)

    if (targetBranchIds.length === 0) {
      addSheet("All branches", items)
    } else {
      for (const branchId of targetBranchIds) {
        const branch = branches.find((b) => b.id === branchId)
        const branchLabel = branch?.name || "Branch"
        const q = buildQuery()
        q.set("branches", branchId)
        const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) continue
        const branchRows = Array.isArray(data.items) ? (data.items as LoanReportRow[]) : []
        addSheet(branchLabel, branchRows)
      }
    }
  } else {
    // Non-super-admin users are branch-scoped by API rules; export a single worksheet.
    let ownBranchName = branches[0]?.name || "My branch"
    if (!branches[0]?.name) {
      try {
        const res = await fetch("/api/institution/branches", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        const first = Array.isArray(data.items) ? data.items[0] : null
        if (first?.name) ownBranchName = String(first.name)
      } catch {
        // Keep fallback name if lookup fails.
      }
    }
    addSheet(ownBranchName, items)
  }

  if (sheets.length === 0) return 0

  const stamp = new Date().toISOString().slice(0, 10)
  await exportExcelWorkbook({
    filename: `loan-portfolio-report-${stamp}.xlsx`,
    sheets,
  })
  return exportedRows
}
