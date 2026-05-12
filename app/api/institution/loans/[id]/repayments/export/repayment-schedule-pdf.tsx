import React from "react"
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as baseStyles, toServerPdfBuffer } from "@/lib/export/server-pdf"

const styles = StyleSheet.create({
  page: { padding: 14, fontSize: 7, fontFamily: "Helvetica" },
  title: { fontSize: 9, textAlign: "center", marginBottom: 8, fontWeight: 700 },
  table: baseStyles.table,
  row: baseStyles.row,
  headerCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
    fontWeight: 700,
    fontSize: 6,
  },
  cell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    fontSize: 6,
  },
})

export type RepaymentSchedulePdfRow = {
  installment: number
  due_date: string | null
  principal: number
  interest: number
  monthly_payment: number
  amount_paid: number
  payment_date: string | null
  penalty: number
  amount_due: number
  days_overdue: number
  status: string
}

type Payload = {
  title: string
  rows: RepaymentSchedulePdfRow[]
}

const COLUMNS = [
  "#",
  "Due",
  "Principal",
  "Interest",
  "Monthly",
  "Paid",
  "Pay date",
  "Penalty",
  "Due amt",
  "Days",
  "Status",
] as const

export async function renderRepaymentSchedulePdfBuffer(payload: Payload): Promise<Buffer> {
  const fmt = (n: number) => Number(n || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{payload.title}</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            {COLUMNS.map((c) => (
              <Text key={c} style={styles.headerCell}>
                {c}
              </Text>
            ))}
          </View>
          {payload.rows.map((row, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={styles.cell}>{String(row.installment)}</Text>
              <Text style={styles.cell}>{row.due_date ? formatIsoDate(row.due_date) : "—"}</Text>
              <Text style={styles.cell}>{fmt(row.principal)}</Text>
              <Text style={styles.cell}>{fmt(row.interest)}</Text>
              <Text style={styles.cell}>{fmt(row.monthly_payment)}</Text>
              <Text style={styles.cell}>{fmt(row.amount_paid)}</Text>
              <Text style={styles.cell}>{row.payment_date ? formatIsoDate(row.payment_date) : ""}</Text>
              <Text style={styles.cell}>{fmt(row.penalty)}</Text>
              <Text style={styles.cell}>{fmt(row.amount_due)}</Text>
              <Text style={styles.cell}>{String(row.days_overdue ?? 0)}</Text>
              <Text style={styles.cell}>{row.status || ""}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
  return toServerPdfBuffer(doc as Parameters<typeof toServerPdfBuffer>[0])
}
