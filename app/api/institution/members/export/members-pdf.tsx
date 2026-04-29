import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type MemberRow = {
  member_number: string
  full_name: string
  phone_number: string
  email: string | null
  district: string | null
  status: string
  kyc_status: string
  membership_fee_paid: number | null
  kyc_approved_at: string | null
  join_date: string | null
}

type MemberSheet = {
  branch_name: string
  rows: MemberRow[]
}

type Payload = {
  title: string
  sheets: MemberSheet[]
}

function hardWrap(value: string | null | undefined, chunkSize = 16): string {
  const text = String(value || "")
  if (!text) return ""
  const lines: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    lines.push(text.slice(i, i + chunkSize))
  }
  return lines.join("\n")
}

function wrapEmail(value: string | null | undefined, chunkSize = 16): string {
  return hardWrap(value, chunkSize)
}

function money(v: number | null): string {
  if (v === null || typeof v === "undefined") return ""
  const n = Number(v || 0)
  return Number.isFinite(n) ? n.toLocaleString("en-UG") : ""
}

export async function renderMembersPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Member #", "Name", "Phone", "Email", "District", "Status", "KYC", "Membership Paid", "KYC Approved At", "Join Date"]

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
                <Text style={styles.cell}>{hardWrap(row.member_number)}</Text>
                <Text style={styles.cell}>{hardWrap(row.full_name)}</Text>
                <Text style={styles.cell}>{hardWrap(row.phone_number)}</Text>
                <Text style={styles.cell}>{wrapEmail(row.email)}</Text>
                <Text style={styles.cell}>{hardWrap(row.district)}</Text>
                <Text style={styles.cell}>{hardWrap(row.status)}</Text>
                <Text style={styles.cell}>{hardWrap(row.kyc_status)}</Text>
                <Text style={styles.cell}>{money(row.membership_fee_paid)}</Text>
                <Text style={styles.cell}>{row.kyc_approved_at ? hardWrap(formatIsoDate(row.kyc_approved_at)) : ""}</Text>
                <Text style={styles.cell}>{row.join_date ? hardWrap(formatIsoDate(row.join_date)) : ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )

  return toServerPdfBuffer(doc)
}

