"use client"

import { exportPdfTables, type PdfColumn, type PdfSection } from "@/components/export/pdf/pdf"

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

type ExportLoanReportsPdfParams = {
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

function buildReportTitle(params: {
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
  const applied = formatRange(params.applicationRange)
  const reviewed = formatRange(params.reviewedRange)
  const approved = formatRange(params.approvedRange)
  const disbursed = formatRange(params.disbursedRange)
  const hasAnyFilter = statusUsed || loanTypeUsed || productUsed || Boolean(applied || reviewed || approved || disbursed)
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
  if (applied) parts.push(`applied at : ${applied}`)
  if (reviewed) parts.push(`reviewed at : ${reviewed}`)
  if (approved) parts.push(`approved at : ${approved}`)
  if (disbursed) parts.push(`disbursed at : ${disbursed}`)
  return parts.join(" ")
}

function buildColumnsAndRows(rows: LoanReportRow[]): { columns: PdfColumn[]; dataRows: Record<string, string | number>[] } {
  const maxDisbursedByCols = Math.max(0, ...rows.map((r) => (Array.isArray(r.disbursed_by) ? r.disbursed_by.length : 0)))
  const maxGuarantorCols = Math.max(0, ...rows.map((r) => (Array.isArray(r.guarantors) ? r.guarantors.length : 0)))

  const columns: PdfColumn[] = [
    { key: "application_id", header: "Application ID" },
    { key: "memberName", header: "Member" },
    { key: "memberNumber", header: "Member No" },
    { key: "productName", header: "Product" },
    { key: "loan_type", header: "Loan type" },
    { key: "reviewed_at", header: "Reviewed at" },
    { key: "reviewed_by_name", header: "Reviewed by" },
    { key: "approved_at", header: "Approved at" },
    { key: "disbursed_at", header: "Disbursed at" },
    { key: "approved_by_name", header: "Approved by" },
    { key: "created_by_name", header: "Created by" },
    ...Array.from({ length: maxDisbursedByCols }).map((_, idx) => ({ key: `disbursed_by_${idx}`, header: `Disbursed by ${idx + 1}` })),
    ...Array.from({ length: maxGuarantorCols }).map((_, idx) => ({ key: `guarantor_${idx}`, header: `Guarantor ${idx + 1}` })),
    { key: "principal_amount", header: "Principal (UGX)" },
    { key: "outstanding_balance", header: "Outstanding (UGX)" },
    { key: "interest_rate", header: "Interest rate %" },
    { key: "tenure_months", header: "Tenure (mo)" },
    { key: "total_amount_paid", header: "Total amount paid (UGX)" },
    { key: "total_interest", header: "Total interest (UGX)" },
    { key: "penalties_collected", header: "Penalties collected (UGX)" },
    { key: "late_pay_days_avg", header: "Avg late pay days" },
    { key: "early_payments", header: "Total early payments" },
    { key: "overdue", header: "Overdue" },
    { key: "status", header: "Status" },
    { key: "application_date", header: "Applied" },
    { key: "next_payment_date", header: "Next due" },
  ]

  const dataRows = rows.map((r) => ({
    application_id: String(r.application_id || ""),
    memberName: String(r.memberName || ""),
    memberNumber: String(r.memberNumber || ""),
    productName: String(r.productName || ""),
    loan_type: String(r.loan_type || ""),
    reviewed_at: String(r.reviewed_at || "").slice(0, 10),
    reviewed_by_name: String(r.reviewed_by_name || ""),
    approved_at: String(r.approved_at || "").slice(0, 10),
    disbursed_at: String(r.disbursed_at || "").slice(0, 10),
    approved_by_name: String(r.approved_by_name || ""),
    created_by_name: String(r.created_by_name || ""),
    ...Object.fromEntries(Array.from({ length: maxDisbursedByCols }).map((_, idx) => [`disbursed_by_${idx}`, String(r.disbursed_by?.[idx] || "")])),
    ...Object.fromEntries(Array.from({ length: maxGuarantorCols }).map((_, idx) => [`guarantor_${idx}`, String(r.guarantors?.[idx] || "")])),
    principal_amount: Number(r.principal_amount || 0),
    outstanding_balance: Number(r.outstanding_balance || 0),
    interest_rate: Number(r.interest_rate || 0),
    tenure_months: Number(r.tenure_months || 0),
    total_amount_paid: Number(r.total_amount_paid || 0),
    total_interest: Number(r.total_interest || 0),
    penalties_collected: Number(r.penalties_collected || 0),
    late_pay_days_avg: Number(r.late_pay_days_avg || 0),
    early_payments: Number(r.early_payments || 0),
    overdue: r.overdue ? "Yes" : "No",
    status: String(r.status || ""),
    application_date: String(r.application_date || "").slice(0, 10),
    next_payment_date: String(r.next_payment_date || "").slice(0, 10),
  }))

  return { columns, dataRows }
}

export async function exportLoanReportsPdf({
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
}: ExportLoanReportsPdfParams): Promise<number> {
  const title = buildReportTitle({
    statusFilter,
    loanTypeFilter,
    productId,
    products,
    applicationRange,
    reviewedRange,
    approvedRange,
    disbursedRange,
  })
  const sections: PdfSection[] = []
  let exportedRows = 0

  const addSection = (sectionName: string | undefined, rows: LoanReportRow[]) => {
    const { columns, dataRows } = buildColumnsAndRows(rows)
    sections.push({ title, sectionName, columns, rows: dataRows })
    exportedRows += rows.length
  }

  if (isSuperAdmin && branchIds.length > 1) {
    for (const branchId of branchIds) {
      const branch = branches.find((b) => b.id === branchId)
      const branchLabel = branch?.name || "Branch"
      const q = buildQuery()
      q.set("branches", branchId)
      const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) continue
      const branchRows = Array.isArray(data.items) ? (data.items as LoanReportRow[]) : []
      addSection(branchLabel, branchRows)
    }
  } else {
    const activeBranch = branchIds.length === 1 ? branches.find((b) => b.id === branchIds[0]) : null
    addSection(activeBranch?.name, items)
  }

  if (sections.length === 0) return 0

  const stamp = new Date().toISOString().slice(0, 10)
  await exportPdfTables({
    filename: `loan-portfolio-report-${stamp}.pdf`,
    sections,
  })
  return exportedRows
}
