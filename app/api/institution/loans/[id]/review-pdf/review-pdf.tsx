import React from "react"
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import QRCode from "qrcode"
import { toServerPdfBuffer } from "@/lib/export/server-pdf"
import path from "node:path"
import { existsSync } from "node:fs"

export type LoanReviewEligibilityRow = {
  eligibility: string
}

export type LoanReviewPdfData = {
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
  reviewed_by_name: string
  reviewed_by_role: string
  eligibilities: LoanReviewEligibilityRow[]
}

try {
  const robotoRegular = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf")
  const robotoBold = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf")
  if (!existsSync(robotoRegular) || !existsSync(robotoBold)) {
    throw new Error("Roboto font files not found in public/fonts")
  }
  Font.register({
    family: "Roboto",
    fonts: [
      { src: robotoRegular, fontWeight: "normal" },
      { src: robotoBold, fontWeight: "bold" },
    ],
  })
} catch (error) {
  console.warn("Failed to register Roboto font, falling back to defaults.", error)
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 30,
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  title: {
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  qrBlock: {
    width: 110,
    alignItems: "flex-end",
  },
  qrCaption: {
    marginTop: 5,
    fontSize: 8,
    lineHeight: 1.2,
  },
  brandBlock: {
    flex: 1,
    alignItems: "center",
  },
  logo: {
    width: 65,
    objectFit: "cover",
    marginBottom: 5,
  },
  saccoName: {
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 2,
  },
  smallCenter: {
    fontSize: 9,
    textAlign: "center",
    lineHeight: 1.25,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
    fontSize: 11,
    marginBottom: 8,
  },
  memberLoanRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
    alignItems: "flex-start",
    marginTop: 4,
  },
  memberLoanCol: {
    width: "34%",
  },
  memberLoanColTitle: {
    fontWeight: "bold",
    fontSize: 10,
    marginBottom: 4,
  },
  compactInfoRow: {
    marginBottom: 4,
  },
  compactLabel: {
    fontWeight: "bold",
    fontSize: 10,
  },
  compactValue: {
    fontSize: 10,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  infoLabel: {
    width: 155,
    fontWeight: "bold",
    fontSize: 10,
  },
  infoValue: {
    flex: 1,
    fontSize: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: "#222222",
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f4",
  },
  colEligibility: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: "#222222",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: "bold",
    fontSize: 10,
  },
  colCheck: {
    width: 72,
    paddingVertical: 6,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 10,
  },
  colNotes: {
    width: 210,
    borderRightWidth: 1,
    borderColor: "#222222",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: "bold",
    fontSize: 10,
  },
  eligibilityRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#222222",
    minHeight: 42,
    alignItems: "stretch",
  },
  eligibilityText: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: "#222222",
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 10,
  },
  checkboxCell: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  notesCell: {
    width: 210,
    minHeight: 42,
    borderRightWidth: 1,
    borderColor: "#222222",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  notesCellText: {
    fontSize: 10,
    lineHeight: 1.25,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.2,
    borderColor: "#111111",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 12,
    lineHeight: 1.3,
  },
  footerContainer: {
    marginTop: 20,
    flexDirection: "column",
    gap: 20,
  },
  dotLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dotted",
    borderColor: "black",
  },
  line4: { top: 12, left: 85 },
  line5: { top: 12, left: 70 },
  line6: { top: 11, left: 55 },
  nameSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },
  signature: {
    flex: 1,
    flexDirection: "row",
    fontSize: 12,
    maxWidth: "45%",
  },
})

export async function renderLoanReviewPdfBuffer(data: LoanReviewPdfData): Promise<Buffer> {
  const qrPayload = String(data.application_id || "").trim() || "LOAN"
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 420,
    margin: 1,
    errorCorrectionLevel: "H",
  })
  const logo = String(data.sacco_logo || "").trim()

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>SACCO FIELD REVIEW FORM</Text>

        <View style={styles.header}>
          <View style={styles.brandBlock}>
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text style={styles.saccoName}>{data.sacco_name || "SACCO"}</Text>
            <Text style={styles.smallCenter}>{data.branch_name || "Branch"}</Text>
            <Text style={styles.smallCenter}>{data.branch_address || "—"}</Text>
            <Text style={styles.smallCenter}>Tel: {data.branch_phone || "—"}</Text>
            <Text style={styles.smallCenter}>Email: {data.branch_email || "—"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member & Loan Information</Text>
          <View style={styles.memberLoanRow}>
            <View style={styles.memberLoanCol}>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Member number</Text>
                <Text style={styles.compactValue}>{data.member_number || "—"}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Member name</Text>
                <Text style={styles.compactValue}>{data.member_name || "—"}</Text>
              </View>
            </View>

            <View style={styles.memberLoanCol}>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Loan product</Text>
                <Text style={styles.compactValue}>{data.loan_product || "—"}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactLabel}>Loan product code</Text>
                <Text style={styles.compactValue}>{data.loan_product_code || "—"}</Text>
              </View>
            </View>

            <View style={styles.qrBlock}>
              <Image src={qrDataUrl} style={{ width: 72, height: 72 }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibilities</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colEligibility}>Eligibility item</Text>
              <Text style={styles.colNotes}>Notes</Text>
              <Text style={styles.colCheck}>Check</Text>
            </View>
            {data.eligibilities.length > 0 ? (
              data.eligibilities.map((row, idx) => (
                <View key={`${row.eligibility}-${idx}`} style={styles.eligibilityRow}>
                  <Text style={styles.eligibilityText}>{row.eligibility || "—"}</Text>
                  <View style={styles.notesCell}>
                    <Text style={styles.notesCellText}>
                      
                    </Text>
                  </View>
                  <View style={styles.checkboxCell}>
                    
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.eligibilityRow}>
                <Text style={styles.eligibilityText}>No eligibility rows found.</Text>
                <View style={styles.notesCell}>
                  <Text style={styles.notesCellText}>—</Text>
                </View>
                <View style={styles.checkboxCell}>
                  <Text style={styles.checkbox} />
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.footerContainer}>
          <View style={styles.nameSection}>
            <View style={styles.signature}>
              <View style={{ flexDirection: "row", gap: 5 }}>
                <Text>Applicant Name:</Text>
                <Text></Text>
              </View>
              <View style={[styles.dotLine, styles.line4]} />
            </View>
            <View style={styles.signature}>
              <Text>Reviewed By:</Text>
              <Text></Text>
              <View style={[styles.dotLine, styles.line5]} />
            </View>
          </View>
          <View style={styles.nameSection}>
            <View style={styles.signature}>
              <Text>Signature:</Text>
              <Text />
              <View style={[styles.dotLine, styles.line6]} />
            </View>
            <View style={styles.signature}>
              <Text>Signature:</Text>
              <Text />
              <View style={[styles.dotLine, styles.line6]} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )

  return toServerPdfBuffer(doc)
}

