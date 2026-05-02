import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

export type InvoiceExportRow = {
  invoice_number: string
  assigned_to: string
  target_label: string
  invoice_type: string
  status: string
  invoice_date: string | null
  invoice_due: string | null
  subtotal: number
  vat: number
  total_amount: number
  created_by_name: string
}

export type InvoicesPdfSheet = {
  branch_name: string
  rows: InvoiceExportRow[]
}

type Payload = {
  title: string
  sheets: InvoicesPdfSheet[]
}

export async function renderInvoicesPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = [
    "Invoice #",
    "Assigned to",
    "Target",
    "Type",
    "Status",
    "Inv date",
    "Due",
    "Subtotal",
    "VAT",
    "Total",
    "Created by",
  ]

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
                <Text style={styles.cell}>{row.invoice_number || ""}</Text>
                <Text style={styles.cell}>{(row.assigned_to || "").slice(0, 28)}</Text>
                <Text style={styles.cell}>{row.target_label || ""}</Text>
                <Text style={styles.cell}>{row.invoice_type || ""}</Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{formatIsoDate(row.invoice_date)}</Text>
                <Text style={styles.cell}>{formatIsoDate(row.invoice_due)}</Text>
                <Text style={styles.cell}>{Number(row.subtotal || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.vat || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.total_amount || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{(row.created_by_name || "").slice(0, 22)}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )

  return toServerPdfBuffer(doc)
}
