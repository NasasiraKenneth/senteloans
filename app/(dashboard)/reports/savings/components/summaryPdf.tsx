"use client"

import React from "react"
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"

type SavingsRow = {
  member_name: string
  account_type: string
  status: string
  open_date?: string | null
  last_transaction_date?: string | null
  available_balance?: number
  total_balance?: number
}

type BranchOption = { id: string; name: string }

type ExportSavingsSummaryPdfParams = {
  items: SavingsRow[]
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

const toNum = (v: unknown) => Number(v || 0)
const money = (n: number) => `UGX ${Math.round(n || 0).toLocaleString()}`

function monthKey(v: string | null | undefined): string {
  const s = String(v || "").slice(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : "Unknown"
}

function daysSince(v: string | null | undefined): number {
  const d = String(v || "").slice(0, 10)
  if (!d) return Number.POSITIVE_INFINITY
  const a = new Date(`${d}T12:00:00`).getTime()
  const b = Date.now()
  if (!Number.isFinite(a)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

export async function exportSavingsSummaryPdf({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/savings",
}: ExportSavingsSummaryPdfParams): Promise<number> {
  const totalAccounts = items.length
  const activeAccounts = items.filter((i) => i.status === "Active").length
  const dormantOrInactive = items.filter((i) => i.status === "Dormant" || i.status === "Inactive").length
  const totalBalance = items.reduce((s, i) => s + toNum(i.total_balance), 0)
  const totalAvailable = items.reduce((s, i) => s + toNum(i.available_balance), 0)
  const restrictedSavings = Math.max(0, totalBalance - totalAvailable)
  const liquidityRatio = totalBalance > 0 ? (totalAvailable / totalBalance) * 100 : 0

  const typeMap = new Map<string, { count: number; total: number }>()
  items.forEach((i) => {
    const key = String(i.account_type || "Other")
    const row = typeMap.get(key) || { count: 0, total: 0 }
    row.count += 1
    row.total += toNum(i.total_balance)
    typeMap.set(key, row)
  })
  const typeRows = Array.from(typeMap.entries()).map(([type, v]) => ({
    type,
    count: v.count,
    total: v.total,
    share: totalBalance > 0 ? (v.total / totalBalance) * 100 : 0,
  }))

  const memberMap = new Map<string, number>()
  items.forEach((i) => {
    const member = String(i.member_name || "Unknown")
    memberMap.set(member, (memberMap.get(member) || 0) + toNum(i.total_balance))
  })
  const memberRows = Array.from(memberMap.entries())
    .map(([member, total]) => ({ member, total }))
    .sort((a, b) => b.total - a.total)
  const top10 = memberRows.slice(0, 10)
  const lowest10 = [...memberRows].slice(-10)
  const top10Total = top10.reduce((s, r) => s + r.total, 0)
  const concentrationRatio = totalBalance > 0 ? (top10Total / totalBalance) * 100 : 0
  const avgSavingsPerMember = memberRows.length > 0 ? totalBalance / memberRows.length : 0

  const dormantAccounts = items.filter((i) => daysSince(i.last_transaction_date) > 180)
  const dormantBalance = dormantAccounts.reduce((s, i) => s + toNum(i.total_balance), 0)

  const monthlyOpenings = new Map<string, number>()
  const monthlyBalanceAdded = new Map<string, number>()
  items.forEach((i) => {
    const mk = monthKey(i.open_date)
    monthlyOpenings.set(mk, (monthlyOpenings.get(mk) || 0) + 1)
    monthlyBalanceAdded.set(mk, (monthlyBalanceAdded.get(mk) || 0) + toNum(i.total_balance))
  })
  const trendRows = Array.from(monthlyOpenings.keys())
    .sort()
    .map((m) => ({
      month: m,
      openings: monthlyOpenings.get(m) || 0,
      added: monthlyBalanceAdded.get(m) || 0,
    }))

  const closed = items.filter((i) => i.status === "Closed").length
  const suspended = items.filter((i) => i.status === "Suspended").length

  const branchRows: Array<{ branch: string; accounts: number; deposits: number; avgMember: number }> = []
  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    for (const bid of targetBranchIds) {
      const label = branches.find((b) => b.id === bid)?.name || "Branch"
      const q = buildQuery()
      q.set("branches", bid)
      const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) continue
      const rows = Array.isArray(data.items) ? (data.items as SavingsRow[]) : []
      const deposits = rows.reduce((s, r) => s + toNum(r.total_balance), 0)
      const uniqueMembers = new Set(rows.map((r) => String(r.member_name || "Unknown"))).size
      branchRows.push({
        branch: label,
        accounts: rows.length,
        deposits,
        avgMember: uniqueMembers > 0 ? deposits / uniqueMembers : 0,
      })
    }
  }

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Savings Portfolio Overview (Executive Summary)</Text>
        <Text style={styles.sectionTitle}>Executive KPIs</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Metric</Text><Text style={styles.cell}>Value</Text></View>
        {[
          ["Total savings accounts", String(totalAccounts)],
          ["Active accounts", String(activeAccounts)],
          ["Dormant/Inactive accounts", String(dormantOrInactive)],
          ["Total savings balance", money(totalBalance)],
          ["Total available balance", money(totalAvailable)],
          ["Restricted/locked savings", money(restrictedSavings)],
          ["Withdrawable liquidity ratio", `${liquidityRatio.toFixed(1)}%`],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{k}</Text><Text style={styles.cell}>{v}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Account Type Distribution</Text>
        <Text style={styles.small}>Best chart: Pie chart</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Type</Text><Text style={styles.cell}>Accounts</Text><Text style={styles.cell}>Total Balance</Text><Text style={styles.cell}>Share</Text></View>
        {typeRows.map((r) => (
          <View key={r.type} style={styles.row}><Text style={styles.cellWide}>{r.type}</Text><Text style={styles.cell}>{String(r.count)}</Text><Text style={styles.cell}>{money(r.total)}</Text><Text style={styles.cell}>{r.share.toFixed(1)}%</Text></View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 2: Account Distribution & Branch Performance</Text>
        <Text style={styles.sectionTitle}>Branch Savings Performance</Text>
        <Text style={styles.small}>Best chart: Bar/Column chart</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Branch</Text><Text style={styles.cell}>Accounts</Text><Text style={styles.cell}>Total Deposits</Text><Text style={styles.cell}>Avg per Member</Text></View>
        {branchRows.length === 0 ? (
          <View style={styles.row}><Text style={styles.cellWide}>Branch-scoped</Text><Text style={styles.cell}>{String(totalAccounts)}</Text><Text style={styles.cell}>{money(totalBalance)}</Text><Text style={styles.cell}>{money(avgSavingsPerMember)}</Text></View>
        ) : (
          branchRows.map((r) => (
            <View key={r.branch} style={styles.row}><Text style={styles.cellWide}>{r.branch}</Text><Text style={styles.cell}>{String(r.accounts)}</Text><Text style={styles.cell}>{money(r.deposits)}</Text><Text style={styles.cell}>{money(r.avgMember)}</Text></View>
          ))
        )}

        <Text style={styles.sectionTitle}>Available vs Restricted Funds</Text>
        <Text style={styles.small}>Best chart: Pie chart</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Available funds</Text><Text style={styles.cell}>{money(totalAvailable)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Locked/Restricted funds</Text><Text style={styles.cell}>{money(restrictedSavings)}</Text></View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 3: Growth Trends</Text>
        <Text style={styles.sectionTitle}>Savings Growth Trend (Proxy by account openings)</Text>
        <Text style={styles.small}>Best chart: Line chart</Text>
        <View style={styles.hrow}><Text style={styles.cell}>Month</Text><Text style={styles.cell}>New Accounts</Text><Text style={styles.cell}>Balance Added</Text></View>
        {trendRows.map((r) => (
          <View key={r.month} style={styles.row}><Text style={styles.cell}>{r.month}</Text><Text style={styles.cell}>{String(r.openings)}</Text><Text style={styles.cell}>{money(r.added)}</Text></View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 4: Risk Analysis</Text>
        <Text style={styles.sectionTitle}>Dormant Accounts Analysis</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Dormant accounts count (&gt; 6 months)</Text><Text style={styles.cell}>{String(dormantAccounts.length)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Dormant balance value</Text><Text style={styles.cell}>{money(dormantBalance)}</Text></View>

        <Text style={styles.sectionTitle}>Savings Concentration Risk</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Top 10 contribution ratio</Text><Text style={styles.cell}>{concentrationRatio.toFixed(1)}%</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Top 10 total balance</Text><Text style={styles.cell}>{money(top10Total)}</Text></View>

        <Text style={styles.sectionTitle}>Closed vs Active Accounts</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Active</Text><Text style={styles.cell}>{String(activeAccounts)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Closed</Text><Text style={styles.cell}>{String(closed)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Suspended</Text><Text style={styles.cell}>{String(suspended)}</Text></View>
        <View style={styles.row}><Text style={styles.cellWide}>Dormant/Inactive</Text><Text style={styles.cell}>{String(dormantOrInactive)}</Text></View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Page 5: Top Members</Text>
        <Text style={styles.sectionTitle}>Top Savers (Top 10)</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Member</Text><Text style={styles.cell}>Savings</Text></View>
        {top10.map((r) => (
          <View key={r.member} style={styles.row}><Text style={styles.cellWide}>{r.member}</Text><Text style={styles.cell}>{money(r.total)}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Lowest Savers (Bottom 10)</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Member</Text><Text style={styles.cell}>Savings</Text></View>
        {lowest10.map((r) => (
          <View key={`low-${r.member}`} style={styles.row}><Text style={styles.cellWide}>{r.member}</Text><Text style={styles.cell}>{money(r.total)}</Text></View>
        ))}
        <Text style={styles.sectionTitle}>Average Savings Per Member</Text>
        <View style={styles.row}><Text style={styles.cellWide}>Average savings</Text><Text style={styles.cell}>{money(avgSavingsPerMember)}</Text></View>
      </Page>
    </Document>
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `savings-portfolio-summary-${stamp}.pdf`
  a.click()
  URL.revokeObjectURL(url)
  return items.length
}
