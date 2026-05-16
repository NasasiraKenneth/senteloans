import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { toServerPdfBuffer } from "@/lib/export/server-pdf";
import bwipjs from "bwip-js";
import path from "node:path";
import { existsSync } from "node:fs";

export type TransactionPdfData = {
  sacco_name: string;
  branch_name: string;
  branch_phone: string;
  branch_address: string;
  sacco_logo: string;
  transaction_number: string;
  type: string;
  amount: number;
  mode: string;
  description: string;
  reference_number: string;
  balance_before: number;
  balance_after: number;
  transaction_date: string | null;
  status: string;
  assigned_to: string;
  assigned_to_type: "member" | "client" | "staff" | null;
  assigned_to_number: string;
  client_name: string;
  client_number: string;
  account_type: string;
  account_number: string;
  transfer_to_account_number: string;
  transfer_to_member_number: string;
  transfer_to_member_name: string;
  processed_by_name: string;
  processed_by_id: string;
};

const RECEIPT_WIDTH_PT = 226;

try {
  const robotoRegular = path.join(
    process.cwd(),
    "public",
    "fonts",
    "Roboto-Regular.ttf",
  );
  const robotoBold = path.join(
    process.cwd(),
    "public",
    "fonts",
    "Roboto-Bold.ttf",
  );
  if (existsSync(robotoRegular) && existsSync(robotoBold)) {
    Font.register({
      family: "Roboto",
      fonts: [
        { src: robotoRegular, fontWeight: "normal" },
        { src: robotoBold, fontWeight: "bold" },
      ],
    });
  }
} catch {
  // fallback silently
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
});

function formatUgx(amount: number) {
  const formatted = Number(amount || 0).toLocaleString("en-UG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `UGX ${formatted}`;
}

function numberToWords(num: number): string {
  const units = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const toWords = (n: number): string => {
    if (n < 20) return units[n];
    if (n < 100)
      return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${units[n % 10]}` : ""}`;
    if (n < 1000)
      return `${units[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${toWords(n % 100)}` : ""}`;
    if (n < 1000000)
      return `${toWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${toWords(n % 1000)}` : ""}`;
    return `${toWords(Math.floor(n / 1000000))} million${n % 1000000 ? ` ${toWords(n % 1000000)}` : ""}`;
  };
  const w = `${toWords(Math.floor(num || 0))} Ugandan shillings only`.trim();
  return w ? w[0].toUpperCase() + w.slice(1) : "Zero Ugandan shillings only";
}

export async function renderTransactionDetailPdfBuffer(
  tx: TransactionPdfData,
): Promise<Buffer> {
  const barcodeText = String(tx.transaction_number || "").trim() || "N-A";
  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcodeText,
    scale: 2,
    height: 10,
    includetext: false,
  });
  const barcodeDataUrl = `data:image/png;base64,${barcodePng.toString("base64")}`;
  const logoSrc = String(tx.sacco_logo || "").trim();
  const isTransfer =
    String(tx.type || "")
      .trim()
      .toUpperCase() === "TRANSFER";
  const assignedLabel =
    tx.assigned_to_type === "staff"
      ? "Staff"
      : tx.assigned_to_type === "client"
        ? "Client"
        : "Member";
  const assignedName = tx.assigned_to || tx.client_name || "—";
  const assignedNumber = tx.assigned_to_number || tx.client_number || "—";
  const showAssignedNumber = tx.assigned_to_type === "member";
  const postedAt = tx.transaction_date
    ? new Date(tx.transaction_date).toLocaleString("en-UG", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const doc = (
    <Document>
      <Page size={[RECEIPT_WIDTH_PT, 700]} style={styles.page} wrap={false}>
        {!!logoSrc && (
          <View style={styles.logoWrap}>
            <Image src={logoSrc} style={styles.logoImage} />
          </View>
        )}
        <Text style={styles.centerTitle}>{tx.sacco_name || "SACCO"}</Text>
        <Text style={styles.centerSmall}>{tx.branch_name || "Branch"}</Text>
        <Text style={styles.centerSmall}>{tx.branch_address || "—"}</Text>
        <Text style={styles.centerSmall}>Tel: {tx.branch_phone || "—"}</Text>
        <Text style={styles.title}>SACCO RECEIPT</Text>

        <Text style={styles.dash}>
          ------------------------------------------------------------------------------------------
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Receipt no.</Text>
          <Text style={styles.valueBold}>{tx.transaction_number || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date & time</Text>
          <Text style={styles.value}>{postedAt}</Text>
        </View>

        <Text style={styles.blockTitle}>Assigned to</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Party</Text>
          <Text style={styles.value}>{assignedLabel}</Text>
        </View>
        {showAssignedNumber && (
          <View style={styles.row}>
            <Text style={styles.label}>Member no.</Text>
            <Text style={styles.value}>{assignedNumber}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{assignedName}</Text>
        </View>

        <Text style={styles.blockTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text style={styles.value}>{tx.account_type || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Account no.</Text>
          <Text style={styles.value}>{tx.account_number || "—"}</Text>
        </View>

        <Text style={styles.blockTitle}>Transaction</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text style={styles.valueBold}>
            {String(tx.type || "—").toUpperCase()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Mode</Text>
          <Text style={styles.value}>{tx.mode || "—"}</Text>
        </View>
        {isTransfer && (
          <>
            <Text style={styles.blockTitle}>Transfer information</Text>
            <View style={styles.row}>
              <Text style={styles.label}>To account no.</Text>
              <Text style={styles.value}>
                {tx.transfer_to_account_number || "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Member no.</Text>
              <Text style={styles.value}>
                {tx.transfer_to_member_number || "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Member name</Text>
              <Text style={styles.value}>
                {tx.transfer_to_member_name || "—"}
              </Text>
            </View>
          </>
        )}
        <Text style={styles.narration}>{tx.description || "—"}</Text>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>AMOUNT</Text>
          <Text style={styles.amountValue}>{formatUgx(tx.amount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.words}>
            Amount in words: {numberToWords(tx.amount)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Balance after</Text>
          <Text style={styles.valueBold}>{formatUgx(tx.balance_after)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Processed By</Text>
          <Text style={styles.value}>{tx.processed_by_name || "—"}</Text>
        </View>

        <Text style={styles.dash}>
          ------------------------------------------------------------------------------------------
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
  );

  return toServerPdfBuffer(doc);
}
