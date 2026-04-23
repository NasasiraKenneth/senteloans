"use client"

import type { ReactElement } from "react"
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"

export type PdfCell = string | number | boolean | null | undefined

export type PdfColumn = {
  key: string
  header: string
}

export type PdfSection = {
  sectionName?: string
  title: string
  columns: PdfColumn[]
  rows: Record<string, PdfCell>[]
}

type ExportPdfParams = {
  filename: string
  sections: PdfSection[]
}

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: 700 },
  sectionName: { fontSize: 9, marginBottom: 6, fontWeight: 700 },
  table: { display: "flex", width: "100%", borderWidth: 1, borderColor: "#d1d5db" },
  row: { flexDirection: "row" },
  headerCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
    fontWeight: 700,
  },
  cell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  pageBreak: { marginTop: 12 },
})

function cellText(v: PdfCell): string {
  if (v == null) return ""
  return String(v)
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

function buildDocument(sections: PdfSection[]): ReactElement {
  const pages: ReactElement[] = []

  sections.forEach((section, sectionIdx) => {
    const rowChunks = chunkRows(section.rows, 25)
    const chunks = rowChunks.length > 0 ? rowChunks : [[]]

    chunks.forEach((chunk, chunkIdx) => {
      pages.push(
        <Page key={`${sectionIdx}-${chunkIdx}`} size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{section.title}</Text>
          {section.sectionName ? <Text style={styles.sectionName}>{section.sectionName}</Text> : null}
          <View style={chunkIdx > 0 ? [styles.table, styles.pageBreak] : styles.table}>
            <View style={styles.row}>
              {section.columns.map((col) => (
                <Text key={col.key} style={styles.headerCell}>
                  {col.header}
                </Text>
              ))}
            </View>
            {chunk.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                {section.columns.map((col) => (
                  <Text key={`${rowIdx}-${col.key}`} style={styles.cell}>
                    {cellText(row[col.key])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </Page>
      )
    })
  })

  return <Document>{pages}</Document>
}

export async function exportPdfTables({ filename, sections }: ExportPdfParams): Promise<void> {
  const pdfDoc = buildDocument(sections)
  const blob = await pdf(pdfDoc as ReactElement<any>).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
