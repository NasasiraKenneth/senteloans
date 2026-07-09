import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type AgentRow = {
  name: string
  status: string
  email: string | null
  address: string | null
  phone: string | null
  created_at: string | null
}

type AgentSheet = {
  branch_name: string
  rows: AgentRow[]
}

type Payload = {
  title: string
  sheets: AgentSheet[]
}

export async function renderThirdPartyAgentsPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Agent", "Status", "Email", "Phone", "Address", "Created"]
  const doc = (
    <Document>
      {payload.sheets.map((sheet, idx) => (
        <Page key={idx} size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{payload.title}</Text>
          <Text style={styles.sectionName}>{sheet.branch_name}</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              {columns.map((c) => (
                <Text key={c} style={styles.headerCell}>
                  {c}
                </Text>
              ))}
            </View>
            {sheet.rows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                <Text style={styles.cell}>{row.name || ""}</Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{row.email || ""}</Text>
                <Text style={styles.cell}>{row.phone || ""}</Text>
                <Text style={styles.cell}>{row.address || ""}</Text>
                <Text style={styles.cell}>{row.created_at ? formatIsoDate(row.created_at) : ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
