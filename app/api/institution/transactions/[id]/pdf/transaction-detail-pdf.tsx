import React from "react"
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"
import { toServerPdfBuffer } from "@/lib/export/server-pdf"
import { formatCurrency } from "@/lib/format-currency"
import { numberToWords } from "@/lib/invoices/utils"
import bwipjs from "bwip-js"
import path from "node:path"
import { existsSync } from "node:fs"

export type TransactionPdfData = {
  sacco_name: string
  branch_name: string
  branch_phone: string
  branch_address: string
  sacco_logo: string
  transaction_number: string
  type: string
  amount: number
  mode: string
  description: string
  reference_number: string
  balance_before: number | null
  balance_after: number | null
  charges: number | null
  transaction_date: string | null
  status: string
  assigned_to: string
  assigned_to_type: "member" | "client" | "staff" | null
  assigned_to_number: string
  account_type: string
  account_number: string
  transfer_to_account_number: string
  transfer_to_member_number: string
  transfer_to_member_name: string
  processed_by_name: string
  processed_by_id: string
  bank_name: string
  bank_account_number: string
}

const RECEIPT_WIDTH_PT = 226

try {
  const robotoRegular = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf")
  const robotoBold = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf")
  if (existsSync(robotoRegular) && existsSync(robotoBold)) {
    Font.register({
      family: "Roboto",
      fonts: [
        { src: robotoRegular, fontWeight: "normal" },
        { src: robotoBold, fontWeight: "bold" },
      ],
    })
  }
} catch (error) {
  console.warn("Failed to register Roboto font, falling back to defaults.", error)
}

const styles = StyleSheet.create({
  page: {
    width: RECEIPT_WIDTH_PT,
    paddingHorizontal: 5,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: "Roboto",
    fontSize: 7,
    lineHeight: 1.15,
  },
  logoWrap: { alignItems: "center", marginBottom: 2 },
  logoImage: { width: 72, objectFit: "contain" },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
    paddingVertical: 10,
  },
  centerTitle: {
    fontSize: 13,
    lineHeight: 0.9,
    textAlign: "center",
    fontWeight: "bold",
    marginTop: 5,
    marginBottom: 4,
  },
  centerSmall: { fontSize: 7, textAlign: "center", marginBottom: 1 },
  dash: {
    fontSize: 7,
    textAlign: "center",
    marginVertical: 3,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  label: { fontWeight: "bold", fontSize: 7, maxWidth: "48%" },
  value: { fontSize: 7, maxWidth: "52%", textAlign: "right" },
  valueBold: {
    fontWeight: "bold",
    fontSize: 7,
    maxWidth: "52%",
    textAlign: "right",
  },
  blockTitle: {
    fontWeight: "bold",
    fontSize: 7,
    marginTop: 3,
    marginBottom: 2,
  },
  narration: {
    fontSize: 7,
    textAlign: "left",
    marginBottom: 3,
    lineHeight: 1.25,
  },
  amountBox: {
    marginTop: 2,
    marginBottom: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 0.5,
    borderColor: "#000",
    borderStyle: "dashed",
  },
  amountLabel: { fontSize: 7, textAlign: "center", marginBottom: 1 },
  amountValue: { fontWeight: "bold", fontSize: 9, textAlign: "center" },
  words: { marginTop: 6, fontSize: 7 },
  footerNote: {
    fontSize: 5,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 1.2,
  },
  barcodeWrap: { marginTop: 4, alignItems: "center" },
})

const PLACEHOLDER_TEXT = new Set(["-", "—", "–", "n/a", "na", "null", "none", "."])

function isPlaceholderText(value: string): boolean {
  return PLACEHOLDER_TEXT.has(value.trim().toLowerCase())
}

function presentText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text || isPlaceholderText(text)) return null
  return text
}

function isPresent(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "number") return Number.isFinite(value)
  return presentText(value) != null
}

function isPositiveAmount(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0
}

function isBankMode(mode: string): boolean {
  const m = String(mode || "").trim()
  return m === "Bank Transfer" || m === "Cheque" || m === "Card"
}

function ReceiptRow({
  label,
  children,
  bold = false,
}: {
  label: string
  children: React.ReactNode
  bold?: boolean
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={bold ? styles.valueBold : styles.value}>{children}</Text>
    </View>
  )
}

function TransactionReceiptDoc({
  tx,
  barcodeDataUrl,
}: {
  tx: TransactionPdfData
  barcodeDataUrl: string
}) {
  const logoSrc = String(tx.sacco_logo || "").trim()
  const isTransfer = String(tx.type || "").trim().toUpperCase() === "TRANSFER"
  const postedAt = tx.transaction_date
    ? new Date(tx.transaction_date).toLocaleString("en-UG", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null
  const txnType = String(tx.type || "").trim()
  const words = isPresent(tx.amount) ? numberToWords(tx.amount) : null
  const processedBy = presentText(tx.processed_by_name)
  const showMember =
    tx.assigned_to_type === "member" &&
    (isPresent(tx.assigned_to_number) || isPresent(tx.assigned_to))
  const showClient = tx.assigned_to_type === "client" && isPresent(tx.assigned_to)
  const showStaff = tx.assigned_to_type === "staff" && isPresent(tx.assigned_to)
  const accountType = presentText(tx.account_type)
  const accountNumber = presentText(tx.account_number)
  const showAccount = !!(accountType || accountNumber)
  const showTransaction = isPresent(txnType) || isPresent(tx.mode)
  const showBank =
    isBankMode(tx.mode) &&
    (isPresent(tx.bank_name) || isPresent(tx.bank_account_number))
  const showTransfer =
    isTransfer &&
    (isPresent(tx.transfer_to_account_number) ||
      isPresent(tx.transfer_to_member_number) ||
      isPresent(tx.transfer_to_member_name))

  return (
    <Document>
      <Page size={[RECEIPT_WIDTH_PT]} style={styles.page} wrap={false}>
        {isPresent(logoSrc) && (
          <View style={styles.logoWrap}>
            <Image src={logoSrc} style={styles.logoImage} />
          </View>
        )}
        {isPresent(tx.sacco_name) && <Text style={styles.centerTitle}>{tx.sacco_name}</Text>}
        {isPresent(tx.branch_name) && <Text style={styles.centerSmall}>{tx.branch_name}</Text>}
        {isPresent(tx.branch_address) && (
          <Text style={styles.centerSmall}>{tx.branch_address}</Text>
        )}
        {isPresent(tx.branch_phone) && (
          <Text style={styles.centerSmall}>Tel: {tx.branch_phone}</Text>
        )}
        <Text style={styles.title}>SACCO RECEIPT</Text>

        <Text style={styles.dash}>
          ---------------------------------------------------------------------------------------
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Receipt no.</Text>
          <Text style={styles.valueBold}>{tx.transaction_number}</Text>
        </View>
        {isPresent(postedAt) && <ReceiptRow label="Date & time">{postedAt}</ReceiptRow>}
        {isPresent(tx.reference_number) && (
          <ReceiptRow label="Reference no." bold>
            {tx.reference_number}
          </ReceiptRow>
        )}
        {isPresent(tx.status) && <ReceiptRow label="Status">{tx.status}</ReceiptRow>}

        {showMember && (
          <>
            <Text style={styles.blockTitle}>Member</Text>
            {isPresent(tx.assigned_to_number) && (
              <ReceiptRow label="Member no.">{tx.assigned_to_number}</ReceiptRow>
            )}
            {isPresent(tx.assigned_to) && (
              <ReceiptRow label="Name">{tx.assigned_to}</ReceiptRow>
            )}
          </>
        )}

        {showClient && (
          <>
            <Text style={styles.blockTitle}>Client</Text>
            <ReceiptRow label="Name">{tx.assigned_to}</ReceiptRow>
          </>
        )}

        {showStaff && (
          <>
            <Text style={styles.blockTitle}>Staff</Text>
            <ReceiptRow label="Name">{tx.assigned_to}</ReceiptRow>
          </>
        )}

        {showAccount && (
          <>
            <Text style={styles.blockTitle}>Account</Text>
            {accountType && <ReceiptRow label="Type">{accountType}</ReceiptRow>}
            {accountNumber && <ReceiptRow label="Account no.">{accountNumber}</ReceiptRow>}
          </>
        )}

        {showTransaction && (
          <>
            <Text style={styles.blockTitle}>Transaction</Text>
            {isPresent(txnType) && (
              <ReceiptRow label="Type" bold>
                {txnType.toUpperCase()}
              </ReceiptRow>
            )}
            {isPresent(tx.mode) && <ReceiptRow label="Mode">{tx.mode}</ReceiptRow>}
          </>
        )}

        {showBank && (
          <>
            <Text style={styles.blockTitle}>Bank information</Text>
            {isPresent(tx.bank_name) && (
              <ReceiptRow label="Bank name">{tx.bank_name}</ReceiptRow>
            )}
            {isPresent(tx.bank_account_number) && (
              <ReceiptRow label="Bank account">{tx.bank_account_number}</ReceiptRow>
            )}
          </>
        )}

        {showTransfer && (
          <>
            <Text style={styles.blockTitle}>Transfer information</Text>
            {isPresent(tx.transfer_to_account_number) && (
              <ReceiptRow label="To account no.">{tx.transfer_to_account_number}</ReceiptRow>
            )}
            {isPresent(tx.transfer_to_member_number) && (
              <ReceiptRow label="Member no.">{tx.transfer_to_member_number}</ReceiptRow>
            )}
            {isPresent(tx.transfer_to_member_name) && (
              <ReceiptRow label="Member name">{tx.transfer_to_member_name}</ReceiptRow>
            )}
          </>
        )}

        {isPresent(tx.description) && (
          <Text style={styles.narration}>{tx.description}</Text>
        )}

        {isPresent(tx.amount) && (
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>AMOUNT</Text>
            <Text style={styles.amountValue}>{formatCurrency(tx.amount)}</Text>
          </View>
        )}

        {isPositiveAmount(tx.charges) && (
          <ReceiptRow label="Charges" bold>
            {formatCurrency(tx.charges as number)}
          </ReceiptRow>
        )}

        {isPresent(words) && (
          <View style={styles.row}>
            <Text style={styles.words}>Amount in words: {words}</Text>
          </View>
        )}

        {tx.balance_before != null && Number.isFinite(tx.balance_before) && (
          <ReceiptRow label="Balance before">{formatCurrency(tx.balance_before)}</ReceiptRow>
        )}

        {tx.balance_after != null && Number.isFinite(tx.balance_after) && (
          <ReceiptRow label="Balance after" bold>
            {formatCurrency(tx.balance_after)}
          </ReceiptRow>
        )}

        {isPresent(processedBy) && (
          <ReceiptRow label="Processed by">{processedBy}</ReceiptRow>
        )}

        <Text style={styles.dash}>
          ---------------------------------------------------------------------------------------
        </Text>

        <View style={styles.barcodeWrap}>
          <Image
            src={barcodeDataUrl}
            style={{ width: RECEIPT_WIDTH_PT - 20, height: 46 }}
          />
        </View>

        <Text style={styles.footerNote}>
          Retain for your records. Queries within 30 days with this receipt no.
          {"\n"}
          Thank you for saving with us.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderTransactionDetailPdfBuffer(
  tx: TransactionPdfData,
): Promise<Buffer> {
  const barcodeText = String(tx.transaction_number || "").trim() || "N-A"
  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcodeText,
    scale: 2,
    height: 10,
    includetext: false,
  })
  const barcodeDataUrl = `data:image/png;base64,${barcodePng.toString("base64")}`

  return toServerPdfBuffer(<TransactionReceiptDoc tx={tx} barcodeDataUrl={barcodeDataUrl} />)
}
