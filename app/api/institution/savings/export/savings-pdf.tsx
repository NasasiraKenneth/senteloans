import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type SavingsRow = {
  account_number: string
  account_type: string
  member_name: string
  status: string
  available_balance: number
  total_balance: number
  open_date: string | null
}

type SavingsSheet = {
  branch_name: string
  rows: SavingsRow[]
}

type Payload = {
  title: string
  sheets: SavingsSheet[]
}

export async function renderSavingsPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Account", "Type", "Member", "Status", "Available", "Total", "Opened"]
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
                <Text style={styles.cell}>{row.account_number || ""}</Text>
                <Text style={styles.cell}>{row.account_type || ""}</Text>
                <Text style={styles.cell}>{row.member_name || ""}</Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{Number(row.available_balance || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.total_balance || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{row.open_date ? formatIsoDate(row.open_date) : ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
