import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

export type InvestmentReportExportRow = {
  report_number: string
  report_period_label: string
  investment_number: string
  investment_name: string
  provider_name: string
  opening_value: number
  capital_added: number
  income: number
  expenses: number
  closing_value: number
  notes: string
  created_at: string | null
  created_by_name: string
}

export type InvestmentReportsPdfSheet = {
  branch_name: string
  rows: InvestmentReportExportRow[]
}

type Payload = {
  title: string
  sheets: InvestmentReportsPdfSheet[]
}

export async function renderInvestmentReportsPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = [
    "Report #",
    "Period",
    "Inv #",
    "Investment",
    "Provider",
    "Opening",
    "Capital",
    "Income",
    "Expenses",
    "Closing",
    "Recorded",
    "By",
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
                <Text style={styles.cell}>{row.report_number || ""}</Text>
                <Text style={styles.cell}>{row.report_period_label || ""}</Text>
                <Text style={styles.cell}>{row.investment_number || ""}</Text>
                <Text style={styles.cell}>{(row.investment_name || "").slice(0, 40)}</Text>
                <Text style={styles.cell}>{(row.provider_name || "").slice(0, 24)}</Text>
                <Text style={styles.cell}>{Number(row.opening_value || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.capital_added || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.income || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.expenses || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{Number(row.closing_value || 0).toLocaleString("en-UG")}</Text>
                <Text style={styles.cell}>{formatIsoDate(row.created_at)}</Text>
                <Text style={styles.cell}>{(row.created_by_name || "").slice(0, 20)}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )

  return toServerPdfBuffer(doc)
}
