import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type AccountStatementRow = {
  date: string | null
  type: string
  amount: number
  mode: string
  description: string
  balance: number
}

type Payload = {
  title: string
  rows: AccountStatementRow[]
}

export async function renderAccountStatementPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Date", "Type", "Amount", "Mode", "Description", "Balance"]
  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{payload.title}</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            {columns.map((c) => (
              <Text key={c} style={styles.headerCell}>
                {c}
              </Text>
            ))}
          </View>
          {payload.rows.map((row, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={styles.cell}>{row.date ? formatIsoDate(row.date) : ""}</Text>
              <Text style={styles.cell}>{row.type || ""}</Text>
              <Text style={styles.cell}>{Number(row.amount || 0).toLocaleString("en-UG")}</Text>
              <Text style={styles.cell}>{row.mode || ""}</Text>
              <Text style={styles.cell}>{row.description || ""}</Text>
              <Text style={styles.cell}>{Number(row.balance || 0).toLocaleString("en-UG")}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
  return toServerPdfBuffer(doc)
}
