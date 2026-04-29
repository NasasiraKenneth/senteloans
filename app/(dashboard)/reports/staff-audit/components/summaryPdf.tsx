"use client"

import { exportPdfTables } from "@/components/export/pdf/pdf"

type AuditSummary = { total_logs: number; inserts: number; updates: number; deletes: number }

export async function exportStaffAuditSummaryPdf(summary: AuditSummary): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10)
  await exportPdfTables({
    filename: `staff-audit-summary-${stamp}.pdf`,
    sections: [
      {
        title: "Staff Audit Summary",
        columns: [
          { key: "metric", header: "Metric" },
          { key: "value", header: "Value" },
        ],
        rows: [
          { metric: "Total logs", value: Number(summary.total_logs || 0) },
          { metric: "Insert operations", value: Number(summary.inserts || 0) },
          { metric: "Update operations", value: Number(summary.updates || 0) },
          { metric: "Delete operations", value: Number(summary.deletes || 0) },
        ],
      },
    ],
  })
}
