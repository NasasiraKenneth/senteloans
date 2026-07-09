import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"
import {
  buildLoanReportExportTable,
  type LoanReportExportPayload,
} from "@/lib/reports/loan-report-export"

export async function renderLoanReportPdfBuffer(payload: LoanReportExportPayload): Promise<Buffer> {
  const doc = (
    <Document>
      {payload.sheets.map((sheet, sheetIdx) => {
        const { headers, body } = buildLoanReportExportTable(sheet.rows, payload.currency)
        return (
          <Page key={sheetIdx} size="A4" orientation="landscape" style={styles.page}>
            <Text style={styles.title}>{payload.title}</Text>
            <Text style={styles.sectionName}>{sheet.branch_name}</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                {headers.map((header) => (
                  <Text key={header} style={[styles.headerCell, { flex: 1, fontSize: 5 }]}>
                    {header}
                  </Text>
                ))}
              </View>
              {body.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.row}>
                  {row.map((cell, cellIdx) => (
                    <Text key={cellIdx} style={[styles.cell, { flex: 1, fontSize: 5 }]}>
                      {String(cell ?? "")}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </Page>
        )
      })}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
