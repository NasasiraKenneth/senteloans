"use client"

import React from "react"
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"

type ShareRow = {
  full_name: string
  member_type: string
  number_of_shares: number
  total_share_value: number
  last_purchase_date?: string | null
}

type ExportSharesSummaryPdfParams = {
  items: ShareRow[]
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

const money = (n: number) => `UGX ${Math.round(n || 0).toLocaleString()}`
const toNum = (v: unknown) => Number(v || 0)

function daysSince(v: string | null | undefined): number {
  const d = String(v || "").slice(0, 10)
  if (!d) return Number.POSITIVE_INFINITY
  const a = new Date(`${d}T12:00:00`).getTime()
  const b = Date.now()
  if (!Number.isFinite(a)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

export async function exportSharesSummaryPdf({ items }: ExportSharesSummaryPdfParams): Promise<number> {
  const totalMembers = items.length
  const totalShares = items.reduce((s, i) => s + toNum(i.number_of_shares), 0)
  const totalValue = items.reduce((s, i) => s + toNum(i.total_share_value), 0)
  const avgShares = totalMembers > 0 ? totalShares / totalMembers : 0

  const typeMap = new Map<string, { members: number; value: number }>()
  items.forEach((i) => {
    const t = String(i.member_type || "Unknown")
    const row = typeMap.get(t) || { members: 0, value: 0 }
    row.members += 1
    row.value += toNum(i.total_share_value)
    typeMap.set(t, row)
  })
  const typeRows = Array.from(typeMap.entries()).map(([type, v]) => ({ type, ...v }))

  const top10 = [...items].sort((a, b) => toNum(b.total_share_value) - toNum(a.total_share_value)).slice(0, 10)
  const top10Value = top10.reduce((s, i) => s + toNum(i.total_share_value), 0)
  const concentration = totalValue > 0 ? (top10Value / totalValue) * 100 : 0
  const dormantCount = items.filter((i) => daysSince(i.last_purchase_date) > 180).length

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Share Portfolio Overview (Executive Summary)</Text>
        <Text style={styles.sectionTitle}>Executive KPIs</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Metric</Text><Text style={styles.cell}>Value</Text></View>
        {[
          ["Total shareholders", String(totalMembers)],
          ["Total shares", String(totalShares)],
          ["Total share value", money(totalValue)],
          ["Average shares per member", avgShares.toFixed(1)],
          ["Dormant shareholders (>6 months)", String(dormantCount)],
          ["Top 10 concentration ratio", `${concentration.toFixed(1)}%`],
        ].map(([k, v], idx) => (
          <View key={idx} style={styles.row}><Text style={styles.cellWide}>{k}</Text><Text style={styles.cell}>{v}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Member Type Distribution</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Member Type</Text><Text style={styles.cell}>Members</Text><Text style={styles.cell}>Share Value</Text></View>
        {typeRows.map((r) => (
          <View key={r.type} style={styles.row}><Text style={styles.cellWide}>{r.type}</Text><Text style={styles.cell}>{String(r.members)}</Text><Text style={styles.cell}>{money(r.value)}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Top 10 Shareholders</Text>
        <View style={styles.hrow}><Text style={styles.cellWide}>Member</Text><Text style={styles.cell}>Shares</Text><Text style={styles.cell}>Value</Text></View>
        {top10.map((r) => (
          <View key={r.full_name} style={styles.row}><Text style={styles.cellWide}>{r.full_name}</Text><Text style={styles.cell}>{String(r.number_of_shares)}</Text><Text style={styles.cell}>{money(r.total_share_value)}</Text></View>
        ))}
      </Page>
    </Document>
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `share-summary-${stamp}.pdf`
  a.click()
  URL.revokeObjectURL(url)
  return items.length
}
