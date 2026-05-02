import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  formatIsoDate,
  serverPdfStyles,
  toServerPdfBuffer,
} from "@/lib/export/server-pdf";

type TransactionRow = {
  transaction_number: string;
  assigned_to: string;
  account_number: string;
  type: string;
  amount: number;
  mode: string;
  transaction_date: string | null;
  balance_after: number;
};

export type TransactionsPdfSheet = {
  branch_name: string;
  rows: TransactionRow[];
};

type Payload = {
  title: string;
  sheets: TransactionsPdfSheet[];
};

const colFixed = StyleSheet.create({
  col: { width: "12.5%", flexGrow: 0, flexShrink: 0, flexBasis: "12.5%" },
});

const textStyles = StyleSheet.create({
  headerText: { fontWeight: 700, lineHeight: 1.35 },
  cellText: { lineHeight: 1.35 },
});

const rowStretch = { alignItems: "stretch" as const };

function hardWrap(value: string | null | undefined, chunkSize = 20): string {
  const text = String(value ?? "");
  if (!text) return "";
  const out: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize));
  }
  return out.join("\n");
}

function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  return (
    <View style={serverPdfStyles.table}>
      <View style={[serverPdfStyles.row, rowStretch]}>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Txn #</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Assigned To</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Account</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Type</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Amount</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Mode</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Date</Text>
        </View>
        <View style={[serverPdfStyles.headerCell, colFixed.col]}>
          <Text style={textStyles.headerText}>Balance</Text>
        </View>
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={[serverPdfStyles.row, rowStretch]}>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(row.transaction_number)}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.assigned_to)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(row.account_number)}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.type)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.amount || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>{hardWrap(row.mode)}</Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(
                row.transaction_date ? formatIsoDate(row.transaction_date) : "",
              )}
            </Text>
          </View>
          <View style={[serverPdfStyles.cell, colFixed.col]}>
            <Text style={textStyles.cellText}>
              {hardWrap(Number(row.balance_after || 0).toLocaleString("en-UG"))}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export async function renderTransactionsPdfBuffer(
  payload: Payload,
): Promise<Buffer> {
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
          <TransactionsTable rows={sheet.rows} />
        </Page>
      ))}
    </Document>
  );
  return toServerPdfBuffer(doc);
}
