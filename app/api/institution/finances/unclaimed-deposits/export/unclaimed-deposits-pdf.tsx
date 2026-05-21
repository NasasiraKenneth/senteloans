import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import {
  formatIsoDate,
  serverPdfStyles,
  toServerPdfBuffer,
} from "@/lib/export/server-pdf"

type UnclaimedDepositExportRow = {
  unclaimed_deposit_number: string
  transaction_number: string
  date: string | null
  assigned_to: string
  assigned_type: string
  mode: string
  amount: number
  status: string
}

export type UnclaimedDepositsPdfSheet = {
  branch_name: string
  rows: UnclaimedDepositExportRow[]
}

type Payload = {
  title: string
  sheets: UnclaimedDepositsPdfSheet[]
}

const colFixed = StyleSheet.create({
  col: { width: "12.5%", flexGrow: 0, flexShrink: 0, flexBasis: "12.5%" },
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

function UnclaimedDepositsTable({ rows }: { rows: UnclaimedDepositExportRow[] }) {
  return (
    <View style={serverPdfStyles.table}>
      <View style={[serverPdfStyles.row, rowStretch]}>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Deposit #</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Reference</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Date</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Assigned to</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Type</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Mode</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Amount</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Status</Text>
        </View>
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={[serverPdfStyles.row, rowStretch]}>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.unclaimed_deposit_number)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.transaction_number)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(row.date ? formatIsoDate(row.date) : "")}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.assigned_to)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.assigned_type)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.mode)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.amount || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.status)}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export async function renderUnclaimedDepositsPdfBuffer(payload: Payload): Promise<Buffer> {
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
          <UnclaimedDepositsTable rows={sheet.rows} />
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
