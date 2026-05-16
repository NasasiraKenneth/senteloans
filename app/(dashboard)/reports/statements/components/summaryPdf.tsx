"use client"

import React from "react"
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"
import {
  statementAssignedLabel,
  statementTopAssigneeColumnHeader,
  statementTopAssigneesTitle,
  type StatementAssigneeMode,
} from "@/lib/reports/statement-assignee"

type StatementRow = {
  transaction_date?: string | null
  transaction_number: string
  type: string
  member_name: string
  member_number: string
  client_name?: string
  staff_name?: string
  debit: number
  credit: number
  balance_after: number
}

type ExportStatementsSummaryPdfParams = {
  items: StatementRow[]
  statementType: string
  assignedTo?: StatementAssigneeMode
}

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  hrow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderTopWidth: 1, borderTopColor: "#d1d5db", borderBottomWidth: 1, borderBottomColor: "#d1d5db" },
  cell: { flex: 1, padding: 4 },
  cellWide: { flex: 2, padding: 4 },
})

const toNum = (v: unknown) => Number(v || 0)
const money = (n: number) => `UGX ${Math.round(n || 0).toLocaleString()}`

function monthKey(v: string | null | undefined): string {
  const s = String(v || "").slice(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : "Unknown"
}

export async function exportStatementsSummaryPdf({
  items,
  statementType,
  assignedTo = "members",
}: ExportStatementsSummaryPdfParams): Promise<number> {
  const totalRows = items.length
  const totalDebit = items.reduce((sum, row) => sum + toNum(row.debit), 0)
  const totalCredit = items.reduce((sum, row) => sum + toNum(row.credit), 0)
  const openingBalance = totalRows > 0 ? toNum(items[totalRows - 1].balance_after) - toNum(items[totalRows - 1].credit) + toNum(items[totalRows - 1].debit) : 0
  const closingBalance = totalRows > 0 ? toNum(items[0].balance_after) : 0
  const netFlow = totalCredit - totalDebit

  const typeMap = new Map<string, { count: number; debit: number; credit: number }>()
  const memberMap = new Map<string, { count: number; debit: number; credit: number }>()
  const monthlyMap = new Map<string, { count: number; debit: number; credit: number }>()

  items.forEach((row) => {
    const type = String(row.type || "Other")
    const member =
      assignedTo === "members"
        ? `${String(row.member_name || "Unknown")} (${String(row.member_number || "")})`
        : String(statementAssignedLabel(row, assignedTo) || "Unknown")
    const month = monthKey(row.transaction_date)
    const debit = toNum(row.debit)
    const credit = toNum(row.credit)

    const typeAgg = typeMap.get(type) || { count: 0, debit: 0, credit: 0 }
    typeAgg.count += 1
    typeAgg.debit += debit
    typeAgg.credit += credit
    typeMap.set(type, typeAgg)

    const memberAgg = memberMap.get(member) || { count: 0, debit: 0, credit: 0 }
    memberAgg.count += 1
    memberAgg.debit += debit
    memberAgg.credit += credit
    memberMap.set(member, memberAgg)

    const monthAgg = monthlyMap.get(month) || { count: 0, debit: 0, credit: 0 }
    monthAgg.count += 1
    monthAgg.debit += debit
    monthAgg.credit += credit
    monthlyMap.set(month, monthAgg)
  })

  const typeRows = Array.from(typeMap.entries())
    .map(([type, agg]) => ({ type, ...agg }))
    .sort((a, b) => b.count - a.count)

  const memberRows = Array.from(memberMap.entries())
    .map(([member, agg]) => ({ member, ...agg, net: agg.credit - agg.debit }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  const monthRows = Array.from(monthlyMap.entries())
    .map(([month, agg]) => ({ month, ...agg, net: agg.credit - agg.debit }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const topMembers = memberRows.slice(0, 10)

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Statement Summary Report</Text>

        <Text style={styles.sectionTitle}>Executive KPIs</Text>
        <View style={styles.hrow}>
          <Text style={styles.cellWide}>Metric</Text>
          <Text style={styles.cell}>Value</Text>
        </View>
        {[
          ["Statement type", statementType || "full"],
          ["Transactions", String(totalRows)],
          ["Opening balance", money(openingBalance)],
          ["Closing balance", money(closingBalance)],
          ["Total debit", money(totalDebit)],
          ["Total credit", money(totalCredit)],
          ["Net cash flow", money(netFlow)],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.cellWide}>{k}</Text>
            <Text style={styles.cell}>{v}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Transaction Type Distribution</Text>
        <View style={styles.hrow}>
          <Text style={styles.cellWide}>Type</Text>
          <Text style={styles.cell}>Count</Text>
          <Text style={styles.cell}>Debit</Text>
          <Text style={styles.cell}>Credit</Text>
        </View>
        {typeRows.map((row) => (
          <View key={row.type} style={styles.row}>
            <Text style={styles.cellWide}>{row.type}</Text>
            <Text style={styles.cell}>{String(row.count)}</Text>
            <Text style={styles.cell}>{money(row.debit)}</Text>
            <Text style={styles.cell}>{money(row.credit)}</Text>
          </View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Statement Trends and Assignee Activity</Text>

        <Text style={styles.sectionTitle}>Monthly Activity</Text>
        <View style={styles.hrow}>
          <Text style={styles.cell}>Month</Text>
          <Text style={styles.cell}>Count</Text>
          <Text style={styles.cell}>Debit</Text>
          <Text style={styles.cell}>Credit</Text>
          <Text style={styles.cell}>Net</Text>
        </View>
        {monthRows.map((row) => (
          <View key={row.month} style={styles.row}>
            <Text style={styles.cell}>{row.month}</Text>
            <Text style={styles.cell}>{String(row.count)}</Text>
            <Text style={styles.cell}>{money(row.debit)}</Text>
            <Text style={styles.cell}>{money(row.credit)}</Text>
            <Text style={styles.cell}>{money(row.net)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Top 10 {statementTopAssigneesTitle(assignedTo)} by Net Movement</Text>
        <View style={styles.hrow}>
          <Text style={styles.cellWide}>{statementTopAssigneeColumnHeader(assignedTo)}</Text>
          <Text style={styles.cell}>Txns</Text>
          <Text style={styles.cell}>Debit</Text>
          <Text style={styles.cell}>Credit</Text>
          <Text style={styles.cell}>Net</Text>
        </View>
        {topMembers.map((row) => (
          <View key={row.member} style={styles.row}>
            <Text style={styles.cellWide}>{row.member}</Text>
            <Text style={styles.cell}>{String(row.count)}</Text>
            <Text style={styles.cell}>{money(row.debit)}</Text>
            <Text style={styles.cell}>{money(row.credit)}</Text>
            <Text style={styles.cell}>{money(row.net)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement("a")
  a.href = url
  a.download = `statement-summary-${statementType || "full"}-${stamp}.pdf`
  a.click()
  URL.revokeObjectURL(url)
  return items.length
}
