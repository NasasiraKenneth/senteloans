"use client"

import { downloadLoanReportExport } from "../export/export"

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

type ExportLoanReportsExcelParams = {
  items: LoanReportRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: { id: string; name: string }[]
  statusFilter: string
  loanTypeFilter: string
  productId: string
  products: { id: string; product_name: string }[]
  applicationRange: { start: string; end: string }
  reviewedRange: { start: string; end: string }
  approvedRange: { start: string; end: string }
  disbursedRange: { start: string; end: string }
  buildQuery: (opts?: { exportAll?: boolean }) => URLSearchParams
  apiPath?: string
}

export async function exportLoanReportsExcel({
  buildQuery,
}: ExportLoanReportsExcelParams): Promise<number> {
  const q = buildQuery({ exportAll: true })
  return downloadLoanReportExport(q, "excel")
}
