import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import {
  formatIsoDate,
  serverPdfStyles,
  toServerPdfBuffer,
} from "@/lib/export/server-pdf"

type GrantExportRow = {
  client_name: string
  total_amount: number
  available_balance: number
  percentage_received: number
  remaining_amount: number
  created_at: string | null
  updated_at: string | null
}

export type GrantsPdfSheet = {
  branch_name: string
  rows: GrantExportRow[]
}

type Payload = {
  title: string
  sheets: GrantsPdfSheet[]
}

const colFixed = StyleSheet.create({
  col: { width: "14.2857%", flexGrow: 0, flexShrink: 0, flexBasis: "14.2857%" },
})

const textStyles = StyleSheet.create({
  headerText: { fontWeight: 700, lineHeight: 1.35 },
  cellText: { lineHeight: 1.35 },
})

const rowStretch = { alignItems: "stretch" as const }

function hardWrap(value: string | null | undefined, chunkSize = 18): string {
  const text = String(value ?? "")
  if (!text) return ""
  const out: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize))
  }
  return out.join("\n")
}

function GrantsTable({ rows }: { rows: GrantExportRow[] }) {
  return (
    <View style={serverPdfStyles.table}>
      <View style={[serverPdfStyles.row, rowStretch]}>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Client</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Total grant</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Available</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>% received</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Remaining</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Created at</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Updated</Text>
        </View>
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={[serverPdfStyles.row, rowStretch]}>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.client_name)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.total_amount || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.available_balance || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(`${Number(row.percentage_received || 0)}%`)}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.remaining_amount || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(row.created_at ? formatIsoDate(row.created_at) : "")}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(row.updated_at ? formatIsoDate(row.updated_at) : "")}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export async function renderGrantsPdfBuffer(payload: Payload): Promise<Buffer> {
  const doc = (
    <Document>
      {payload.sheets.map((sheet, idx) => (
        <Page
          key={idx}
          size="A4"
          orientation="landscape"
          style={serverPdfStyles.page}
        >
          <Text style={serverPdfStyles.title}>{payload.title}</Text>
          <Text style={serverPdfStyles.sectionName}>{sheet.branch_name}</Text>
          <GrantsTable rows={sheet.rows} />
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
