import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type LoanProductRow = {
  product_name: string
  product_code: string
  status: string
  interest_rate: number
  interest_calculation_method: string
  minimum_amount: number
  maximum_amount: number
  minimum_tenure_months: number
  maximum_tenure_months: number
  requirements: string
  eligibilities: string
}

type LoanProductSheet = {
  branch_name: string
  rows: LoanProductRow[]
}

type Payload = {
  title: string
  sheets: LoanProductSheet[]
}

export async function renderLoanProductsPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Product", "Code", "Status", "Interest %", "Calculation Method", "Amount Range", "Tenure", "Requirements", "Eligibilities"]
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
                <Text style={styles.cell}>{row.product_name || ""}</Text>
                <Text style={styles.cell}>{row.product_code || ""}</Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{Number(row.interest_rate || 0)}%</Text>
                <Text style={styles.cell}>{row.interest_calculation_method || ""}</Text>
                <Text style={styles.cell}>
                  {`${Number(row.minimum_amount || 0).toLocaleString("en-UG")} - ${Number(row.maximum_amount || 0).toLocaleString("en-UG")}`}
                </Text>
                <Text style={styles.cell}>{`${Number(row.minimum_tenure_months || 0)}-${Number(row.maximum_tenure_months || 0)} months`}</Text>
                <Text style={styles.cell}>{row.requirements || ""}</Text>
                <Text style={styles.cell}>{row.eligibilities || ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
