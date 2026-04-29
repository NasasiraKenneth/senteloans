"use client"

import { exportPdfTables } from "@/components/export/pdf/pdf"

type Summary = {
  total_invoices: number
  total_amount: number
  paid_invoices: number
  overdue_invoices: number
  pending_invoices: number
}

export async function exportInvoiceSummaryPdf(summary: Summary, summaryDateRange?: { start: string; end: string }): Promise<number> {
  const rangeLabel =
    summaryDateRange?.start || summaryDateRange?.end
      ? `${summaryDateRange?.start || "—"} to ${summaryDateRange?.end || "—"}`
      : "All dates"
  await exportPdfTables({
    filename: `invoice-summary-${new Date().toISOString().slice(0, 10)}.pdf`,
    sections: [
      {
        title: "Invoice Reports Summary",
        columns: [
          { key: "metric", header: "Metric" },
          { key: "value", header: "Value" },
        ],
        rows: [
          { metric: "Date range", value: rangeLabel },
          { metric: "Total invoices", value: Number(summary.total_invoices || 0) },
          { metric: "Total amount", value: Number(summary.total_amount || 0) },
          { metric: "Paid invoices", value: Number(summary.paid_invoices || 0) },
          { metric: "Overdue invoices", value: Number(summary.overdue_invoices || 0) },
          { metric: "Pending invoices", value: Number(summary.pending_invoices || 0) },
        ],
      },
    ],
  })
  return Number(summary.total_invoices || 0)
}
