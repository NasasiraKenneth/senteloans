import React from "react"
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer"
import QRCode from "qrcode"
import path from "node:path"
import { existsSync } from "node:fs"
import { toServerPdfBuffer } from "@/lib/export/server-pdf"

export type SaccoLoanReviewPdfData = {
  sacco_name: string
  sacco_logo: string
  branch_name: string
  branch_address: string
  branch_phone: string
  branch_email: string
  member_number: string
  member_name: string
  application_id: string
  loan_product: string
  loan_product_code: string
  reviewed_at: string | null
  reviewed_by_name: string
  reviewed_by_role: string
  eligibilities: Array<{ eligibility: string; is_eligible: boolean }>
}

try {
  const regular = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf")
  const bold = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf")
  if (existsSync(regular) && existsSync(bold)) {
    Font.register({
      family: "Roboto",
      fonts: [
        { src: regular, fontWeight: "normal" },
        { src: bold, fontWeight: "bold" },
      ],
    })
  }
} catch {
  // fallback silently
}

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 30, paddingBottom: 30, fontFamily: "Roboto", fontSize: 10, color: "#111111", backgroundColor: "#ffffff" },
  title: { fontWeight: "bold", fontSize: 16, textAlign: "center", marginBottom: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  qrBlock: { width: 110, alignItems: "flex-end" },
  qrCaption: { marginTop: 5, fontSize: 8, lineHeight: 1.2 },
  brandBlock: { flex: 1, alignItems: "center" },
  logo: { width: 65, objectFit: "cover", marginBottom: 5 },
  saccoName: { fontWeight: "bold", fontSize: 12, textAlign: "center", marginBottom: 2 },
  smallCenter: { fontSize: 9, textAlign: "center", lineHeight: 1.25 },
  section: { marginTop: 8 },
  sectionTitle: { fontWeight: "bold", fontSize: 11, marginBottom: 5 },
  memberLoanRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 10, alignItems: "flex-start", marginTop: 4 },
  memberLoanCol: { width: "34%" },
  compactInfoRow: { marginBottom: 4 },
  compactLabel: { fontWeight: "bold", fontSize: 10 },
  compactValue: { fontSize: 10 },
  tableHeader: { flexDirection: "row", borderWidth: 1, borderColor: "#222222", backgroundColor: "#f4f4f4", marginTop: 4 },
  colEligibility: { flex: 1, borderRightWidth: 1, borderColor: "#222222", paddingVertical: 6, paddingHorizontal: 8, fontWeight: "bold", fontSize: 10 },
  colCheck: { width: 58, paddingVertical: 6, textAlign: "center", fontWeight: "bold", fontSize: 10 },
  eligibilityRow: { flexDirection: "row", borderWidth: 1, borderTopWidth: 0, borderColor: "#222222", minHeight: 30, alignItems: "stretch" },
  eligibilityCell: { flex: 1, borderRightWidth: 1, borderColor: "#222222", justifyContent: "center" },
  eligibilityText: { paddingHorizontal: 8, paddingVertical: 6, fontSize: 10 },
  checkboxCell: { width: 58, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  checkboxTickIcon: { width: 13, height: 13 },
  notesBox: { marginTop: 8, borderWidth: 1, borderColor: "#222222", minHeight: 78, padding: 8 },
  notesTitle: { fontWeight: "bold", fontSize: 10, marginBottom: 5 },
  notesText: { fontSize: 10, lineHeight: 1.35 },
  footerMeta: { marginTop: 14, fontSize: 8, color: "#444444" },
  footerMetaLine: { fontSize: 8, color: "#444444", textAlign: "right", marginBottom: 2 },
  footerMetaRoleLine: { fontSize: 8, color: "#444444", textAlign: "right", marginBottom: 8 },
})

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })
}

function EligibilityTick() {
  return (
    <Svg viewBox="0 0 16 16" style={styles.checkboxTickIcon}>
      <Path d="M2.5 8.5l3.2 3.2 7-7" fill="none" stroke="#111111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export async function renderVerifiedLoanReviewPdfBuffer(review: SaccoLoanReviewPdfData): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(String(review.application_id || "LOAN"), {
    margin: 1,
    width: 420,
    errorCorrectionLevel: "H",
  })
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>SACCO LOAN REVIEW FORM</Text>

        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {review.sacco_logo ? <Image src={review.sacco_logo} style={styles.logo} /> : null}
            <Text style={styles.saccoName}>{review.sacco_name}</Text>
            <Text style={styles.smallCenter}>{review.branch_name}</Text>
            <Text style={styles.smallCenter}>{review.branch_address}</Text>
            <Text style={styles.smallCenter}>Tel: {review.branch_phone}</Text>
            <Text style={styles.smallCenter}>Email: {review.branch_email}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member & Loan Information</Text>
          <View style={styles.memberLoanRow}>
            <View style={styles.memberLoanCol}>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Member number</Text>
                <Text style={styles.compactValue}>{review.member_number}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Member name</Text>
                <Text style={styles.compactValue}>{review.member_name}</Text>
              </View>
            </View>
            <View style={styles.memberLoanCol}>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Loan product</Text>
                <Text style={styles.compactValue}>{review.loan_product}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Loan product code</Text>
                <Text style={styles.compactValue}>{review.loan_product_code}</Text>
              </View>
            </View>
            <View style={styles.qrBlock}>
              <Image src={qrDataUrl} style={{ width: 72, height: 72 }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibilities</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colEligibility}>Eligibility item</Text>
            <Text style={styles.colCheck}>Check</Text>
          </View>
          {review.eligibilities.map((eligibility, idx) => (
            <View key={`${eligibility.eligibility}-${idx}`} style={styles.eligibilityRow}>
              <View style={styles.eligibilityCell}>
                <Text style={styles.eligibilityText}>{eligibility.eligibility}</Text>
              </View>
              <View style={styles.checkboxCell}>
                {eligibility.is_eligible ? <EligibilityTick /> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>Eligibility Notes</Text>
          <Text style={styles.notesText}>
          </Text>
        </View>

        <View style={styles.footerMeta}>
          <Text style={styles.footerMetaLine}>Reviewed by: {review.reviewed_by_name || "—"} | Date: {formatDateTime(review.reviewed_at)}</Text>
          <Text style={styles.footerMetaRoleLine}>{review.reviewed_by_role || "—"}</Text>
          <Text style={styles.footerMetaLine}>Signature: ______________________</Text>
        </View>
      </Page>
    </Document>
  )
  return toServerPdfBuffer(doc)
}

