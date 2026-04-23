"use client"

import React from "react"
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"

type LoanReportRow = {
  memberName: string
  productName: string
  principal_amount?: number
  outstanding_balance?: number
  total_amount_paid?: number
  total_interest?: number
  penalties_collected?: number
  late_pay_days_avg?: number
  early_payments?: number
  status?: string
  tenure_months?: number
  application_date?: string | null
  reviewed_at?: string | null
  approved_at?: string | null
  disbursed_at?: string | null
  overdue?: boolean
  guarantors?: string[]
}

type BranchOption = { id: string; name: string }

type ExportLoanSummaryPdfParams = {
  items: LoanReportRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  hrow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderTopWidth: 1, borderTopColor: "#d1d5db", borderBottomWidth: 1, borderBottomColor: "#d1d5db" },
  cell: { flex: 1, padding: 4 },
  cellWide: { flex: 2, padding: 4 },
  small: { fontSize: 8, color: "#4b5563" },
})

const money = (n: number) => `UGX ${Math.round(n || 0).toLocaleString()}`
const toNum = (v: unknown) => Number(v || 0)

function monthKey(v: string | null | undefined): string {
  const s = String(v || "").slice(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : "Unknown"
}

function daysBetween(a?: string | null, b?: string | null): number {
  const x = String(a || "").slice(0, 10)
  const y = String(b || "").slice(0, 10)
  if (!x || !y) return 0
  const da = new Date(`${x}T12:00:00`).getTime()
  const db = new Date(`${y}T12:00:00`).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0
  return Math.max(0, Math.round((db - da) / (1000 * 60 * 60 * 24)))
}

export async function exportLoanSummaryPdf({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/loans",
}: ExportLoanSummaryPdfParams): Promise<number> {
  const statusCount = (s: string) => items.filter((i) => String(i.status || "") === s).length
  const disbursedCount = items.filter((i) => ["Partially Disbursed", "Fully Disbursed"].includes(String(i.status || ""))).length
  const totalPrincipal = items.reduce((a, i) => a + toNum(i.principal_amount), 0)
  const totalOutstanding = items.reduce((a, i) => a + toNum(i.outstanding_balance), 0)
  const expectedInterest = items.reduce((a, i) => a + toNum(i.total_interest), 0)
  const totalPaid = items.reduce((a, i) => a + toNum(i.total_amount_paid), 0)
  const totalDue = items.reduce((a, i) => a + toNum(i.total_amount_paid) + toNum(i.outstanding_balance), 0)
  const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0
  const totalPenalties = items.reduce((a, i) => a + toNum(i.penalties_collected), 0)

  const statusBuckets = ["Applied", "Under Review", "Approved", "Rejected", "Partially Disbursed", "Fully Disbursed", "Closed", "Defaulted"]
  const statusRows = statusBuckets.map((s) => ({
    status: s,
    count: items.filter((i) => String(i.status || "") === s).length,
    amount: items.filter((i) => String(i.status || "") === s).reduce((a, i) => a + toNum(i.principal_amount), 0),
  }))

  const productMap = new Map<string, { loans: number; total: number; interest: number }>()
  items.forEach((i) => {
    const key = i.productName || "Unknown"
    const v = productMap.get(key) || { loans: 0, total: 0, interest: 0 }
    v.loans += 1
    v.total += toNum(i.principal_amount)
    v.interest += toNum(i.total_interest)
    productMap.set(key, v)
  })
  const productRows = Array.from(productMap.entries()).map(([product, v]) => ({
    product,
    loans: v.loans,
    total: v.total,
    avg: v.loans > 0 ? v.total / v.loans : 0,
    interest: v.interest,
  }))
  const mostBorrowed = [...productRows].sort((a, b) => b.loans - a.loans)[0]?.product || "N/A"
  const leastBorrowed = [...productRows].sort((a, b) => a.loans - b.loans)[0]?.product || "N/A"

  const tenureAvg = items.length ? items.reduce((a, i) => a + toNum(i.tenure_months), 0) / items.length : 0
  const tenureMode = (() => {
    const m = new Map<number, number>()
    items.forEach((i) => {
      const t = toNum(i.tenure_months)
      m.set(t, (m.get(t) || 0) + 1)
    })
    let best = 0
    let freq = 0
    m.forEach((v, k) => {
      if (v > freq) {
        best = k
        freq = v
      }
    })
    return best
  })()

  const approvalTimes = items.map((i) => daysBetween(i.application_date, i.approved_at)).filter((d) => d > 0)
  const reviewTimes = items.map((i) => daysBetween(i.application_date, i.reviewed_at)).filter((d) => d > 0)
  const avgApproval = approvalTimes.length ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length : 0
  const avgReview = reviewTimes.length ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : 0
  const approvalRate = items.length ? (statusCount("Approved") / items.length) * 100 : 0
  const rejectionRate = items.length ? (statusCount("Rejected") / items.length) * 100 : 0

  const overdueLoans = items.filter((i) => Boolean(i.overdue))
  const overdueAmount = overdueLoans.reduce((a, i) => a + toNum(i.outstanding_balance), 0)
  const avgOverdueDays = overdueLoans.length ? overdueLoans.reduce((a, i) => a + toNum(i.late_pay_days_avg), 0) / overdueLoans.length : 0
  const highestOverdueMember = overdueLoans.sort((a, b) => toNum(b.late_pay_days_avg) - toNum(a.late_pay_days_avg))[0]?.memberName || "N/A"

  const buckets = { "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }
  overdueLoans.forEach((i) => {
    const d = toNum(i.late_pay_days_avg)
    const amt = toNum(i.outstanding_balance)
    if (d <= 30) buckets["1-30"] += amt
    else if (d <= 60) buckets["31-60"] += amt
    else if (d <= 90) buckets["61-90"] += amt
    else buckets["90+"] += amt
  })

  const guarantorCount = items.filter((i) => Array.isArray(i.guarantors) && i.guarantors.length > 0).length
  const guaranteedAmount = items
    .filter((i) => Array.isArray(i.guarantors) && i.guarantors.length > 0)
    .reduce((a, i) => a + toNum(i.principal_amount), 0)

  const monthly = new Map<string, { applied: number; approved: number; disbursed: number }>()
  items.forEach((i) => {
    const k = monthKey(i.application_date)
    const v = monthly.get(k) || { applied: 0, approved: 0, disbursed: 0 }
    v.applied += 1
    if (String(i.status || "") === "Approved") v.approved += 1
    if (["Partially Disbursed", "Fully Disbursed"].includes(String(i.status || ""))) v.disbursed += 1
    monthly.set(k, v)
  })
  const monthlyRows = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))

  const branchRows: Array<{ branch: string; loans: number; disbursed: number; outstanding: number }> = []
  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    for (const bid of targetBranchIds) {
      const label = branches.find((b) => b.id === bid)?.name || "Branch"
      const q = buildQuery()
      q.set("branches", bid)
      const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) continue
      const rows = Array.isArray(data.items) ? (data.items as LoanReportRow[]) : []
      branchRows.push({
        branch: label,
        loans: rows.length,
        disbursed: rows.filter((r) => ["Partially Disbursed", "Fully Disbursed"].includes(String(r.status || ""))).reduce((a, r) => a + toNum(r.principal_amount), 0),
        outstanding: rows.reduce((a, r) => a + toNum(r.outstanding_balance), 0),
      })
    }
  } else {
    const scopedBranch = branches[0]?.name || "My Branch"
    branchRows.push({
      branch: scopedBranch,
      loans: items.length,
      disbursed: items.filter((r) => ["Partially Disbursed", "Fully Disbursed"].includes(String(r.status || ""))).reduce((a, r) => a + toNum(r.principal_amount), 0),
      outstanding: totalOutstanding,
    })
  }

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Loan Portfolio Overview (Executive Summary)</Text>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Metric</Text><Text style={styles.cell}>Value</Text></View>
        {[
          ["Total Loans Applied", String(items.length)],
          ["Total Loans Approved", String(statusCount("Approved"))],
          ["Total Loans Rejected", String(statusCount("Rejected"))],
          ["Total Loans Disbursed", String(disbursedCount)],
          ["Total Principal Issued", money(totalPrincipal)],
          ["Total Outstanding Loan Balance", money(totalOutstanding)],
          ["Expected Interest Income", money(expectedInterest)],
          ["Collection Rate", `${collectionRate.toFixed(1)}%`],
          ["Default Rate", `${items.length ? ((statusCount("Defaulted") / items.length) * 100).toFixed(1) : "0.0"}%`],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{k}</Text><Text style={styles.cell}>{v}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Loan Status Distribution</Text>
        <View style={styles.hrow}><Text style={styles.cell}>Status</Text><Text style={styles.cell}>Count</Text><Text style={styles.cell}>Amount</Text></View>
        {statusRows.map((r, idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cell}>{r.status}</Text><Text style={styles.cell}>{String(r.count)}</Text><Text style={styles.cell}>{money(r.amount)}</Text></View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 2: Loan Portfolio Breakdown</Text>
        <Text style={styles.sectionTitle}>Loan Product Performance</Text>
        <Text style={styles.small}>Most borrowed: {mostBorrowed} | Least borrowed: {leastBorrowed}</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Product</Text><Text style={styles.cell}>Loans</Text><Text style={styles.cell}>Total</Text><Text style={styles.cell}>Avg Loan</Text></View>
        {productRows.map((r, idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{r.product}</Text><Text style={styles.cell}>{String(r.loans)}</Text><Text style={styles.cell}>{money(r.total)}</Text><Text style={styles.cell}>{money(r.avg)}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Branch Performance</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Branch</Text><Text style={styles.cell}>Loans</Text><Text style={styles.cell}>Disbursed</Text><Text style={styles.cell}>Outstanding</Text></View>
        {branchRows.map((r, idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{r.branch}</Text><Text style={styles.cell}>{String(r.loans)}</Text><Text style={styles.cell}>{money(r.disbursed)}</Text><Text style={styles.cell}>{money(r.outstanding)}</Text></View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 3: Repayment Performance</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Metric</Text><Text style={styles.cell}>Value</Text></View>
        {[
          ["Total amount due", money(totalDue)],
          ["Total amount paid", money(totalPaid)],
          ["Collection rate", `${collectionRate.toFixed(1)}%`],
          ["Pending repayments", String(items.filter((i) => toNum(i.outstanding_balance) > 0).length)],
          ["Completed repayments", String(items.filter((i) => toNum(i.outstanding_balance) <= 0).length)],
          ["Partial repayments", String(items.filter((i) => toNum(i.total_amount_paid) > 0 && toNum(i.outstanding_balance) > 0).length)],
          ["Total penalties collected", money(totalPenalties)],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{k}</Text><Text style={styles.cell}>{v}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Overdue Aging Analysis</Text>
        <View style={styles.hrow}><Text style={styles.cell}>Days Overdue</Text><Text style={styles.cell}>Amount</Text></View>
        {Object.entries(buckets).map(([k, v]) => (
          <View key={k} style={styles.row}><Text style={styles.cell}>{k} days</Text><Text style={styles.cell}>{money(v)}</Text></View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 4: Risk Analysis</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Metric</Text><Text style={styles.cell}>Value</Text></View>
        {[
          ["Total overdue loans", String(overdueLoans.length)],
          ["Total overdue amount", money(overdueAmount)],
          ["Average overdue days", avgOverdueDays.toFixed(1)],
          ["Highest overdue member", highestOverdueMember],
          ["Loans past maturity (proxy: overdue)", String(overdueLoans.length)],
          ["Non-performing loans (defaulted)", String(statusCount("Defaulted"))],
          ["Guaranteed loans", String(guarantorCount)],
          ["Guaranteed amount", money(guaranteedAmount)],
          ["Settlement analysis", "Available in detailed settlements export"],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{k}</Text><Text style={styles.cell}>{v}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Approval Efficiency</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Average approval time (days)</Text><Text style={styles.cell}>{avgApproval.toFixed(1)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Average review time (days)</Text><Text style={styles.cell}>{avgReview.toFixed(1)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Approval rate</Text><Text style={styles.cell}>{approvalRate.toFixed(1)}%</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Rejection rate</Text><Text style={styles.cell}>{rejectionRate.toFixed(1)}%</Text></View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 5: Monthly/Yearly Trends</Text>
        <Text style={styles.sectionTitle}>Monthly Applications / Approvals / Disbursements</Text>
        <View style={styles.hrow}><Text style={styles.cell}>Month</Text><Text style={styles.cell}>Applications</Text><Text style={styles.cell}>Approvals</Text><Text style={styles.cell}>Disbursements</Text></View>
        {monthlyRows.map((r) => (
          <View key={r.month} style={styles.row}><Text style={styles.cell}>{r.month}</Text><Text style={styles.cell}>{String(r.applied)}</Text><Text style={styles.cell}>{String(r.approved)}</Text><Text style={styles.cell}>{String(r.disbursed)}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Loan Tenure Analysis</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Average tenure (months)</Text><Text style={styles.cell}>{tenureAvg.toFixed(1)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Most common tenure (months)</Text><Text style={styles.cell}>{String(tenureMode)}</Text></View>
        <Text style={styles.small}>Additional insights (top borrowers, repeat borrowers, demographics) can be added when those fields are included in report rows.</Text>
      </Page>
    </Document>
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `loan-portfolio-summary-${stamp}.pdf`
  a.click()
  URL.revokeObjectURL(url)
  return items.length
}
