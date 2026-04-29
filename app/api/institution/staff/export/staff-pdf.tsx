"use server"

import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import { formatIsoDate, serverPdfStyles as styles, toServerPdfBuffer } from "@/lib/export/server-pdf"

type StaffRow = {
  full_name: string
  email: string
  phone_number: string | null
  role: string | null
  status: string | null
  last_login: string | null
  joined_at: string | null
  created_at: string | null
}

type StaffSheet = {
  branch_name: string
  rows: StaffRow[]
}

type Payload = {
  title: string
  sheets: StaffSheet[]
}

function fmtRole(role: string | null): string {
  switch ((role || "").trim()) {
    case "institution_admin":
      return "Admin"
    case "manager":
      return "Manager"
    case "loan_officer":
      return "Loan Officer"
    case "teller":
      return "Teller"
    default:
      return role || "—"
  }
}

export async function renderStaffPdfBuffer(payload: Payload): Promise<Buffer> {
  const columns = ["Name", "Email", "Phone", "Role", "Status", "Last Login", "Joined"]

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
                <Text style={styles.cell}>{row.full_name || "—"}</Text>
                <Text style={styles.cell}>{row.email || "—"}</Text>
                <Text style={styles.cell}>{row.phone_number || "—"}</Text>
                <Text style={styles.cell}>{fmtRole(row.role)}</Text>
                <Text style={styles.cell}>{row.status || "—"}</Text>
                <Text style={styles.cell}>{formatIsoDate(row.last_login)}</Text>
                <Text style={styles.cell}>{formatIsoDate(row.joined_at || row.created_at)}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )

  return toServerPdfBuffer(doc)
}

