import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import {
  formatIsoDate,
  serverPdfStyles,
  toServerPdfBuffer,
} from "@/lib/export/server-pdf"

type BankAccountExportRow = {
  bank_name: string
  bank_account_number: string
  total_amount: number
  updated_at: string | null
}

export type BankAccountsPdfSheet = {
  branch_name: string
  rows: BankAccountExportRow[]
}

type Payload = {
  title: string
  sheets: BankAccountsPdfSheet[]
}

const colFixed = StyleSheet.create({
  col: { width: "25%", flexGrow: 0, flexShrink: 0, flexBasis: "25%" },
})

const textStyles = StyleSheet.create({
  headerText: { fontWeight: 700, lineHeight: 1.35 },
  cellText: { lineHeight: 1.35 },
})

const rowStretch = { alignItems: "stretch" as const }

function hardWrap(value: string | null | undefined, chunkSize = 22): string {
  const text = String(value ?? "")
  if (!text) return ""
  const out: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize))
  }
  return out.join("\n")
}

function BankAccountsTable({ rows }: { rows: BankAccountExportRow[] }) {
  return (
    <View style={serverPdfStyles.table}>
      <View style={[serverPdfStyles.row, rowStretch]}>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Bank</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Account number</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Total amount</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Updated</Text>
        </View>
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={[serverPdfStyles.row, rowStretch]}>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.bank_name)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.bank_account_number)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.total_amount || 0).toLocaleString("en-UG"))}
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

export async function renderBankAccountsPdfBuffer(payload: Payload): Promise<Buffer> {
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
          <BankAccountsTable rows={sheet.rows} />
        </Page>
      ))}
    </Document>
  )
  return toServerPdfBuffer(doc)
}
