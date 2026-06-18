import React from "react"
import {
  Circle,
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer"
import { toServerPdfBuffer } from "@/lib/export/server-pdf"
import QRCode from "qrcode"
import InvoiceQrCode from "./invoice-qr-code"
import path from "node:path"
import { existsSync } from "node:fs"

export type SingleInvoicePdfItem = {
  description: string
  unit: string
  quantity: number
  unit_price: number
  total_price: number
}

export type SingleInvoicePdfData = {
  invoice_number: string
  sacco_name: string
  sacco_logo: string
  branch_name: string
  branch_phone: string
  branch_email: string
  website: string
  branch_address: string
  bank_accounts: string[]
  recipient_name: string
  recipient_phone: string
  recipient_address: string
  status: string
  invoice_type: string
  invoice_date: string | null
  invoice_due: string | null
  subtotal: number
  vat: number
  total_amount: number
  inwords: string
  items: SingleInvoicePdfItem[]
}

const c = {
  black: "#000000",
  white: "#ffffff",
  border: "#cccccc",
  headerGray: "#e8e8e8",
  muted: "#555555",
  footerBg: "#151515",
  footerPattern: "#2a2a2a",
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
} catch {
  // no-op fallback to default pdf font
}

const A4_WIDTH_PT = 595.28
const PAGE_PAD_X_PT = 40
const CONTENT_WIDTH_PT = A4_WIDTH_PT - PAGE_PAD_X_PT * 2
const BOTTOM_LEFT_WIDTH_PT = Math.round(CONTENT_WIDTH_PT * 0.52)
const BOTTOM_RIGHT_WIDTH_PT = Math.round(CONTENT_WIDTH_PT * 0.48)

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 9,
    color: c.black,
    paddingTop: 32,
    paddingBottom: 100,
    paddingHorizontal: 40,
    backgroundColor: c.white,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  brandLeft: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "62%",
  },
  logoWrap: { marginRight: 12, justifyContent: "center" },
  logoImage: { width: 42, height: 42, objectFit: "contain" },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 1.2 },
  companySlogan: { fontSize: 8, color: c.muted, marginTop: 4, maxWidth: 260, lineHeight: 1.35 },
  invoiceTitleWrap: { alignItems: "flex-end" },
  invoiceTitle: { fontFamily: "Times-Roman", fontSize: 36, color: c.black, letterSpacing: 0.5 },
  invoiceMeta: { marginTop: 6, fontSize: 8, color: c.muted, textAlign: "right" },
  midRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  contactCol: { width: "46%" },
  iconLine: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  iconCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  contactText: { fontSize: 9, color: c.black, flex: 1 },
  invoiceToWrap: { width: "48%", borderWidth: 1, borderColor: c.border },
  invoiceToHeader: {
    backgroundColor: c.headerGray,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  invoiceToHeaderText: { fontFamily: "Helvetica-Bold", fontSize: 10, letterSpacing: 0.8 },
  invoiceToRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, minHeight: 28 },
  invoiceToRowLast: { flexDirection: "row", minHeight: 28 },
  invoiceToLabel: {
    width: "28%",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: c.border,
    backgroundColor: "#f7f7f7",
  },
  invoiceToValueWrap: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, justifyContent: "center" },
  invoiceToValue: { fontSize: 8, lineHeight: 1.35 },
  table: { width: "100%", borderWidth: 1, borderColor: c.border, marginBottom: 0 },
  thRow: { flexDirection: "row", backgroundColor: c.black, textTransform: "uppercase", letterSpacing: 0.6 },
  thCell: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: c.white,
    justifyContent: "center",
  },
  thLast: { borderRightWidth: 0 },
  thText: { color: c.white, fontFamily: "Helvetica-Bold", fontSize: 8 },
  thTextRight: { color: c.white, fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "right", width: "100%" },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border },
  td: { borderRightWidth: 1, borderRightColor: c.border, paddingVertical: 8, paddingHorizontal: 8 },
  tdLast: { borderRightWidth: 0 },
  colSl: { width: "7%", alignItems: "center" },
  colDesc: { width: "40%" },
  colUnit: { width: "17%", alignItems: "flex-end" },
  colQty: { width: "15%", alignItems: "center" },
  colTot: { width: "21%", alignItems: "flex-end" },
  itemTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4, textTransform: "uppercase" },
  numText: { fontSize: 9, fontFamily: "Helvetica" },
  numBold: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  bottomSection: { flexDirection: "row", marginTop: 10, alignItems: "flex-start" },
  bottomLeft: { width: BOTTOM_LEFT_WIDTH_PT, paddingRight: 14, flexShrink: 0 },
  bottomRight: { width: BOTTOM_RIGHT_WIDTH_PT, paddingLeft: 6, flexShrink: 0 },
  totalsTable: {
    width: "100%",
    maxWidth: 220,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 28,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  totalsRowLast: { flexDirection: "row", borderBottomWidth: 0 },
  totalsLabel: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  totalsValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  grandRow: { flexDirection: "row", alignSelf: "flex-end", width: "100%", maxWidth: 220, marginBottom: 10 },
  grandBoxLeft: { flex: 1, backgroundColor: c.black, paddingVertical: 10, paddingHorizontal: 10, justifyContent: "center" },
  grandBoxRight: {
    flex: 1,
    backgroundColor: c.black,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  grandText: { color: c.white, fontFamily: "Helvetica-Bold", fontSize: 10 },
  blockTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 5, marginTop: 10 },
  blockTitleFirst: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 5, marginTop: 0 },
  blockLine: { fontSize: 8, color: c.black, lineHeight: 1.45, marginBottom: 2 },
  signatureBlock: {
    marginTop: 2,
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: 8,
    flexShrink: 0,
  },
  watermarkWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  watermarkImage: { width: 280, height: 280, opacity: 0.09, objectFit: "contain" },
  footerWrap: { position: "absolute", bottom: 0, left: 0, right: 0, height: 72 },
  footerPattern: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.footerBg,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingTop: 10,
    paddingLeft: 6,
    overflow: "hidden",
  },
  footerHex: {
    width: 10,
    height: 10,
    marginHorizontal: 2,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: c.footerPattern,
    transform: "rotate(30deg)",
  },
  footerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  footerThanks: { fontFamily: "Times-Italic", fontSize: 12, color: c.white, textAlign: "center", paddingHorizontal: 20 },
})

const CONTACT_ICON = 11

const GLOBE_SVGREPO_PATH_D =
  "M32,0C14.327,0,0,14.327,0,32s14.327,32,32,32s32-14.327,32-32S49.673,0,32,0z M49.972,31 c-0.138-5.582-1.414-10.878-3.613-15.667c2.652-1.022,5.169-2.317,7.515-3.854c4.824,5.14,7.854,11.976,8.102,19.521H49.972z M33.333,61.966c-0.11,0.005-0.222,0.005-0.333,0.009V50.035c3.324,0.087,6.547,0.581,9.605,1.47 C40.184,55.541,37.029,59.084,33.333,61.966z M44.549,52.141c2.283,0.801,4.462,1.817,6.523,3.018 c-3.991,3.29-8.849,5.563-14.178,6.438C39.902,58.861,42.484,55.672,44.549,52.141z M21.394,51.505 c3.059-0.89,6.282-1.383,9.606-1.47v11.939c-0.111-0.004-0.223-0.004-0.333-0.009C26.97,59.084,23.816,55.541,21.394,51.505z M27.105,61.596c-5.329-0.874-10.187-3.147-14.178-6.438c2.062-1.2,4.24-2.217,6.523-3.017 C21.515,55.672,24.098,58.861,27.105,61.596z M2.025,31c0.248-7.545,3.277-14.381,8.102-19.521c2.346,1.536,4.862,2.831,7.515,3.854 C15.442,20.122,14.166,25.418,14.028,31H2.025z M43.57,14.196c-3.345,1.069-6.894,1.67-10.57,1.766V2.025 c0.111,0.004,0.223,0.004,0.333,0.009C37.541,5.314,41.047,9.453,43.57,14.196z M36.895,2.404 c5.944,0.976,11.298,3.696,15.521,7.622c-2.176,1.391-4.496,2.57-6.944,3.499C43.278,9.326,40.369,5.562,36.895,2.404z M31,2.025 v13.937c-3.677-0.096-7.226-0.696-10.57-1.766c2.523-4.743,6.029-8.882,10.237-12.162C30.777,2.029,30.889,2.029,31,2.025z M18.529,13.525c-2.448-0.929-4.769-2.108-6.944-3.499c4.223-3.926,9.576-6.646,15.521-7.622 C23.631,5.562,20.722,9.326,18.529,13.525z M19.532,16.009c3.622,1.189,7.472,1.873,11.468,1.972V31H16.031 C16.17,25.654,17.403,20.584,19.532,16.009z M31,33v15.036c-3.684,0.092-7.245,0.665-10.615,1.689 C17.732,44.712,16.188,39.029,16.031,33H31z M33,48.036V33h14.969c-0.156,6.029-1.701,11.712-4.354,16.726 C40.245,48.701,36.684,48.128,33,48.036z M33,31V17.98c3.996-0.099,7.846-0.782,11.468-1.972c2.129,4.575,3.362,9.646,3.501,14.991 H33z M2.025,33h12.003c0.154,6.253,1.74,12.146,4.447,17.369c-2.496,0.899-4.871,2.044-7.109,3.396 C5.827,48.513,2.294,41.172,2.025,33z M52.634,53.766c-2.238-1.353-4.613-2.497-7.109-3.396c2.707-5.224,4.293-11.116,4.447-17.369 h12.003C61.706,41.172,58.173,48.513,52.634,53.766z"

function ContactPhoneIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={CONTACT_ICON} height={CONTACT_ICON}>
      <Path
        d="M22 16.92v2.5a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 3h2.66a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 10.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
        fill="none"
        stroke={c.black}
        strokeWidth={1.45}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  )
}

function ContactMailIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={CONTACT_ICON} height={CONTACT_ICON}>
      <Path
        d="M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"
        fill="none"
        stroke={c.black}
        strokeWidth={1.45}
        strokeLinejoin="round"
      />
      <Path
        d="M22 8l-10 6.5L2 8"
        fill="none"
        stroke={c.black}
        strokeWidth={1.45}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ContactGlobeIcon() {
  return (
    <Svg viewBox="0 0 64 64" width={CONTACT_ICON} height={CONTACT_ICON}>
      <Path d={GLOBE_SVGREPO_PATH_D} fill={c.black} />
    </Svg>
  )
}

function ContactMapPinIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={CONTACT_ICON} height={CONTACT_ICON}>
      <Path
        d="M12 21s-7-4.35-7-10a7 7 0 1114 0c0 5.65-7 10-7 10z"
        fill="none"
        stroke={c.black}
        strokeWidth={1.45}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={12} cy={10} r={2.5} fill="none" stroke={c.black} strokeWidth={1.45} />
    </Svg>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatMoney(amount: number) {
  const formatted = Number(amount || 0).toLocaleString("en-UG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return `UGX ${formatted}`
}

export async function renderSingleInvoicePdfBuffer(invoice: SingleInvoicePdfData): Promise<Buffer> {
  const qrPayload = String(invoice.invoice_number || "").trim() || "INVOICE"
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 70, margin: 1 })
  const bankDetails = invoice.bank_accounts.length > 0 ? invoice.bank_accounts : ["—"]
  const logoSrc = String(invoice.sacco_logo || "").trim()
  const showLogo = logoSrc.length > 0 && logoSrc !== "false" && logoSrc !== "null"

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brandLeft}>
            {showLogo ? (
              <View style={styles.logoWrap}>
                <Image src={logoSrc} style={styles.logoImage} />
              </View>
            ) : null}
            <View>
              <Text style={styles.companyName}>{invoice.sacco_name || "SACCO"}</Text>
              <Text style={styles.companySlogan}>{invoice.branch_name || "Branch"}</Text>
            </View>
          </View>
          <View style={styles.invoiceTitleWrap}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.invoiceMeta}>
              No. {invoice.invoice_number || "—"}
              {"  "}·{"  "}
              Date {formatDate(invoice.invoice_date)}
            </Text>
          </View>
        </View>

        <View style={styles.midRow}>
          <View style={styles.contactCol}>
            <View style={styles.iconLine}>
              <View style={styles.iconCircle}>
                <ContactPhoneIcon />
              </View>
              <Text style={styles.contactText}>Phone: {invoice.branch_phone || "—"}</Text>
            </View>
            <View style={styles.iconLine}>
              <View style={styles.iconCircle}>
                <ContactMailIcon />
              </View>
              <Text style={styles.contactText}>{invoice.branch_email || "—"}</Text>
            </View>
            <View style={styles.iconLine}>
              <View style={styles.iconCircle}>
                <ContactGlobeIcon />
              </View>
              <Text style={styles.contactText}>{invoice.website || "—"}</Text>
            </View>
            <View style={styles.iconLine}>
              <View style={styles.iconCircle}>
                <ContactMapPinIcon />
              </View>
              <Text style={styles.contactText}>{invoice.branch_address || "—"}</Text>
            </View>
          </View>

          <View style={styles.invoiceToWrap}>
            <View style={styles.invoiceToHeader}>
              <Text style={styles.invoiceToHeaderText}>INVOICE TO:</Text>
            </View>
            <View style={styles.invoiceToRow}>
              <Text style={styles.invoiceToLabel}>Name</Text>
              <View style={styles.invoiceToValueWrap}>
                <Text style={styles.invoiceToValue}>{invoice.recipient_name || "—"}</Text>
              </View>
            </View>
            <View style={styles.invoiceToRow}>
              <Text style={styles.invoiceToLabel}>Address</Text>
              <View style={styles.invoiceToValueWrap}>
                <Text style={styles.invoiceToValue}>{invoice.recipient_address || "—"}</Text>
              </View>
            </View>
            <View style={styles.invoiceToRowLast}>
              <Text style={styles.invoiceToLabel}>Phone</Text>
              <View style={styles.invoiceToValueWrap}>
                <Text style={styles.invoiceToValue}>{invoice.recipient_phone || "—"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <View style={[styles.thCell, styles.colSl]}>
              <Text style={styles.thText}>ITEM</Text>
            </View>
            <View style={[styles.thCell, styles.colDesc]}>
              <Text style={styles.thText}>DESCRIPTION</Text>
            </View>
            <View style={[styles.thCell, styles.colUnit]}>
              <Text style={styles.thTextRight}>UNIT PRICE</Text>
            </View>
            <View style={[styles.thCell, styles.colQty]}>
              <Text style={styles.thText}>QUANTITY</Text>
            </View>
            <View style={[styles.thCell, styles.colTot, styles.thLast]}>
              <Text style={styles.thTextRight}>TOTAL</Text>
            </View>
          </View>

          {invoice.items.map((item, idx) => (
            <View key={idx} style={styles.tr}>
              <View style={[styles.td, styles.colSl]}>
                <Text style={styles.numBold}>{String(idx + 1).padStart(2, "0")}</Text>
              </View>
              <View style={[styles.td, styles.colDesc]}>
                <Text style={styles.itemTitle}>{item.description || "—"}</Text>
              </View>
              <View style={[styles.td, styles.colUnit]}>
                <Text style={styles.numText}>{formatMoney(item.unit_price)}</Text>
              </View>
              <View style={[styles.td, styles.colQty]}>
                <Text style={styles.numText}>
                  {Number(item.quantity || 0).toLocaleString("en-UG")} {item.unit || ""}
                </Text>
              </View>
              <View style={[styles.td, styles.colTot, styles.tdLast]}>
                <Text style={styles.numBold}>{formatMoney(item.total_price)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.bottomLeft}>
            <Text style={styles.blockTitleFirst}>BANK INFORMATION</Text>
            {bankDetails.map((line, i) => (
              <Text key={i} style={styles.blockLine}>{line}</Text>
            ))}

            <Text style={styles.blockTitle}>PAYMENT METHOD WE ACCEPT</Text>
            <Text style={styles.blockLine}>
              We accept cash, bank deposits, and mobile money payments. All payments should be made through approved SACCO channels and properly receipted.
            </Text>

            <Text style={styles.blockTitle}>TERMS AND CONDITION</Text>
            <Text style={styles.blockLine}>
              All payments are subject to SACCO policies and must be verified before processing. Members are advised to confirm transaction details before payment.
            </Text>
          </View>

          <View style={styles.bottomRight}>
            <View style={styles.totalsTable}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>SUB TOTAL:</Text>
                <Text style={styles.totalsValue}>{formatMoney(invoice.subtotal)}</Text>
              </View>
              <View style={[styles.totalsRow, styles.totalsRowLast]}>
                <Text style={styles.totalsLabel}>VAT:</Text>
                <Text style={styles.totalsValue}>{formatMoney(invoice.vat)}</Text>
              </View>
            </View>

            <View style={styles.grandRow}>
              <View style={styles.grandBoxLeft}>
                <Text style={styles.grandText}>Grand Total:</Text>
              </View>
              <View style={styles.grandBoxRight}>
                <Text style={styles.grandText}>{formatMoney(invoice.total_amount)}</Text>
              </View>
            </View>

            <View style={styles.signatureBlock} wrap={false}>
              <InvoiceQrCode dataUrl={qrDataUrl} size={70} label={invoice.invoice_number || "Invoice"} />
            </View>
          </View>
        </View>

        {showLogo ? (
          <View style={styles.watermarkWrap} fixed>
            <Image src={logoSrc} style={styles.watermarkImage} />
          </View>
        ) : null}

        <View style={styles.footerWrap} fixed>
          <View style={styles.footerPattern}>
            {Array.from({ length: 72 }).map((_, i) => (
              <View key={i} style={styles.footerHex} />
            ))}
          </View>
          <View style={styles.footerOverlay}>
            <Text style={styles.footerThanks}>
              Thank you for your business. Your support contributes to the strength and growth of our SACCO.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )

  return toServerPdfBuffer(doc)
}
