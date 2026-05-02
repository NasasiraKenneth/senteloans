import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  formatIsoDate,
  serverPdfStyles as styles,
  toServerPdfBuffer,
} from "@/lib/export/server-pdf";

export type InvestmentExportRow = {
  investment_number: string;
  provider_name: string;
  product_name: string;
  investment_type: string;
  risk_level: string;
  principal: number;
  expected_return: number;
  start_date: string | null;
  maturity_date: string | null;
  status: string;
  created_by_name: string;
};

export type InvestmentsPdfSheet = {
  branch_name: string;
  rows: InvestmentExportRow[];
};

type Payload = {
  title: string;
  sheets: InvestmentsPdfSheet[];
};

function hardWrap(value: string | null | undefined, chunkSize = 15): string {
  const text = String(value ?? "");
  if (!text) return "";
  const out: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize));
  }
  return out.join("\n");
}

export async function renderInvestmentsPdfBuffer(
  payload: Payload,
): Promise<Buffer> {
  const columns = [
    "Inv #",
    "Provider",
    "Product",
    "Type",
    "Risk",
    "Principal",
    "Exp. return",
    "Start",
    "Maturity",
    "Status",
    "Created by",
  ];

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
                <Text style={styles.cell}>
                  {hardWrap(row.investment_number) || ""}
                </Text>
                <Text style={styles.cell}>
                  {hardWrap(row.provider_name) || ""}
                </Text>
                <Text style={styles.cell}>
                  {row.product_name || ""}
                </Text>
                <Text style={styles.cell}>
                  {hardWrap(row.investment_type) || ""}
                </Text>
                <Text style={styles.cell}>
                  {hardWrap(row.risk_level) || ""}
                </Text>
                <Text style={styles.cell}>
                  {Number(row.principal || 0).toLocaleString("en-UG")}
                </Text>
                <Text style={styles.cell}>
                  {Number(row.expected_return || 0).toLocaleString("en-UG")}
                </Text>
                <Text style={styles.cell}>{formatIsoDate(row.start_date)}</Text>
                <Text style={styles.cell}>
                  {formatIsoDate(row.maturity_date)}
                </Text>
                <Text style={styles.cell}>{row.status || ""}</Text>
                <Text style={styles.cell}>{row.created_by_name || ""}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );

  return toServerPdfBuffer(doc);
}
