import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { serverPdfStyles, formatIsoDate, toServerPdfBuffer } from "@/lib/export/server-pdf"

export function ClientSharesPdfDocument({
  title,
  memberName,
  memberNumber,
  institutionName,
  rows,
  totalUnits,
  totalValue,
}: {
  title: string
  memberName: string
  memberNumber: string
  institutionName: string
  rows: any[]
  totalUnits: number
  totalValue: number
}) {
  return (
    <Document>
      <Page size="A4" style={serverPdfStyles.page}>
        <Text style={serverPdfStyles.title}>{title}</Text>
        <Text style={{ fontSize: 9, marginBottom: 4, textAlign: "center", color: "#4b5563" }}>
          Member: {memberName} ({memberNumber || "—"}) | Institution: {institutionName}
        </Text>
        <Text style={{ fontSize: 9, marginBottom: 8, textAlign: "center", color: "#111827", fontWeight: 700 }}>
          Total Shares: {totalUnits.toLocaleString()} Units | Total Valuation: UGX {totalValue.toLocaleString()}
        </Text>

        <View style={serverPdfStyles.table}>
          <View style={serverPdfStyles.row}>
            <Text style={[serverPdfStyles.headerCell, { flex: 1.6 }]}>Txn Number</Text>
            <Text style={[serverPdfStyles.headerCell, { flex: 1 }]}>Units Acquired</Text>
            <Text style={[serverPdfStyles.headerCell, { flex: 1.2 }]}>Unit Price (UGX)</Text>
            <Text style={[serverPdfStyles.headerCell, { flex: 1.4 }]}>Total Value (UGX)</Text>
            <Text style={[serverPdfStyles.headerCell, { flex: 1.2 }]}>Purchase Date</Text>
            <Text style={[serverPdfStyles.headerCell, { flex: 1.6 }]}>Description</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={serverPdfStyles.row}>
              <Text style={[serverPdfStyles.cell, { flex: 1.6 }]}>{r.transaction_number || "—"}</Text>
              <Text style={[serverPdfStyles.cell, { flex: 1, fontWeight: 700 }]}>+{Number(r.units || 0).toLocaleString()}</Text>
              <Text style={[serverPdfStyles.cell, { flex: 1.2 }]}>{Number(r.unit_price || 0).toLocaleString()}</Text>
              <Text style={[serverPdfStyles.cell, { flex: 1.4, fontWeight: 700 }]}>{Number(r.total_value || 0).toLocaleString()}</Text>
              <Text style={[serverPdfStyles.cell, { flex: 1.2 }]}>{formatIsoDate(r.date)}</Text>
              <Text style={[serverPdfStyles.cell, { flex: 1.6 }]}>{r.description || "Share Purchase"}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

export async function renderSharesPdfBuffer(data: {
  title: string
  memberName: string
  memberNumber: string
  institutionName: string
  rows: any[]
  totalUnits: number
  totalValue: number
}): Promise<Buffer> {
  return toServerPdfBuffer(<ClientSharesPdfDocument {...data} />)
}
