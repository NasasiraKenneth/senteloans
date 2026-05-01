import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type LoanRow = {
  application_id: string
  member_name: string
  product_name: string
  status: string
  loan_type: string
  principal_amount: number
  tenure_months: number
  outstanding_balance: number
  application_date: string | null
  next_payment_date: string | null
}

type LoanSheet = {
  branch_name: string
  rows: LoanRow[]
}

type Payload = {
  title: string
  sheets: LoanSheet[]
}

export async function renderLoansPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Application", "Member", "Product", "Status", "Type", "Amount", "Tenure", "Outstanding", "Applied", "Next Payment"]
  const doc = (
    <Document>
      {payload.sheets.map((sheet, idx) => (
        <Page key={idx} size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{payload.title}</Text>
          <Text style={styles.sectionName}>{sheet.branch_name}</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              {columns.map((c) => (
                <Text key={c} style={styles.headerCell}>{c}</Text>
              ))}
            </View>
            {sheet.rows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                <Text style={styles.cell}>{row.application_id || ""}</Text>
                <Text style={styles.cell}>{row.member_name || ""}</Text>
                <Text style={styles.cell}>{row.product_name || ""}</Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{row.loan_type || ""}</Text>
                <Text style={styles.cell}>{Number(row.principal_amount || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{String(row.tenure_months || 0)}</Text>
                <Text style={styles.cell}>{Number(row.outstanding_balance || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{row.application_date ? formatIsoDate(row.application_date) : ""}</Text>
                <Text style={styles.cell}>{row.next_payment_date ? formatIsoDate(row.next_payment_date) : ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}

