"use client"

import { exportExcelWorkbook } from "@/components/export/excel/excel"

type StatementRow = {
  transaction_date?: string | null
  transaction_number: string
  type: string
  member_name: string
  member_number: string
  client_name?: string
  account_number: string
  mode: string
  debit: number
  credit: number
  balance_after: number
  reference_number?: string
  description?: string
}

type ExportStatementsExcelParams = {
  items: StatementRow[]
  statementType: string
  assignedTo?: "members" | "clients"
}

export async function exportStatementsExcel({ items, statementType, assignedTo = "members" }: ExportStatementsExcelParams): Promise<number> {
  const headers = [
    "Date",
    "Transaction #",
    "Type",
    "Assigned to",
    "Assigned No",
    "Mode",
    "Debit",
    "Credit",
    "Balance",
    "Reference",
    "Description",
  ]
  if (assignedTo !== "clients") headers.splice(5, 0, "Account")
  const rows = items.map((r) => [
    String(r.transaction_date || "").slice(0, 10),
    String(r.transaction_number || ""),
    String(r.type || ""),
    String(assignedTo === "clients" ? r.client_name || "" : r.member_name || ""),
    String(assignedTo === "clients" ? "" : r.member_number || ""),
    String(r.mode || ""),
    Number(r.debit || 0),
    Number(r.credit || 0),
    Number(r.balance_after || 0),
    String(r.reference_number || ""),
    String(r.description || ""),
  ])
  if (assignedTo !== "clients") {
    rows.forEach((row, index) => {
      row.splice(5, 0, String(items[index]?.account_number || ""))
    })
  }
  const stamp = new Date().toISOString().slice(0, 10)
  await exportExcelWorkbook({
    filename: `${assignedTo}-statement-${statementType || "full"}-${stamp}.xlsx`,
    sheets: [{ name: "Statement", headers, rows }],
  })
  return items.length
}
