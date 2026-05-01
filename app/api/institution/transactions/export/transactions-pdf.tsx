import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { formatIsoDate, toServerPdfBuffer } from "@/lib/export/server-pdf"

type TransactionRow = {
  transaction_number: string
  assigned_to: string
  account_number: string
  type: string
  amount: number
  mode: string
  transaction_date: string | null
  balance_after: number
}

type Payload = {
  title: string
  rows: TransactionRow[]
}

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 7, fontFamily: "Helvetica" },
  title: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: 700 },
  table: { display: "flex", width: "100%", borderWidth: 1, borderColor: "#d1d5db" },
  row: { flexDirection: "row", alignItems: "stretch" },
  headerCell: {
    padding: 3,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
  },
  cell: {
    padding: 3,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerText: {
    fontWeight: 700,
    lineHeight: 1.35,
  },
  cellText: {
    lineHeight: 1.35,
  },
  equalCol: {
    width: "12.5%",
  },
})

function hardWrap(value: string | null | undefined, chunkSize = 11): string {
  const text = String(value ?? "")
  if (!text) return ""
  const out: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize))
  }
  return out.join("\n")
}

export async function renderTransactionsPdfBuffer(payload: Payload): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{payload.title}</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Txn #</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Assigned To</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Account</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Type</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Amount</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Mode</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Date</Text></View>
            <View style={[styles.headerCell, styles.equalCol]}><Text style={styles.headerText}>Balance</Text></View>
          </View>
          {payload.rows.map((row, idx) => (
            <View key={idx} style={styles.row}>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.transaction_number)}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.assigned_to)}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.account_number)}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.type)}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(Number(row.amount || 0).toLocaleString("en-UG"))}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.mode)}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(row.transaction_date ? formatIsoDate(row.transaction_date) : "")}</Text></View>
              <View style={[styles.cell, styles.equalCol]}><Text style={styles.cellText}>{hardWrap(Number(row.balance_after || 0).toLocaleString("en-UG"))}</Text></View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
  return toServerPdfBuffer(doc)
}
