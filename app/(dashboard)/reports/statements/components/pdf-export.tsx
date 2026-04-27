"use client"

import { exportPdfTables } from "@/components/export/pdf/pdf"

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
}

type ExportStatementsPdfParams = {
  items: StatementRow[]
  statementType: string
  assignedTo?: "members" | "clients"
}

export async function exportStatementsPdf({ items, statementType, assignedTo = "members" }: ExportStatementsPdfParams): Promise<number> {
  const stamp = new Date().toISOString().slice(0, 10)
  const columns = [
    { key: "transaction_date", header: "Date" },
    { key: "transaction_number", header: "Transaction #" },
    { key: "type", header: "Type" },
    { key: "assigned_to", header: "Assigned to" },
    { key: "assigned_no", header: "Assigned No" },
    { key: "mode", header: "Mode" },
    { key: "debit", header: "Debit" },
    { key: "credit", header: "Credit" },
    { key: "balance_after", header: "Balance" },
  ]
  if (assignedTo !== "clients") {
    columns.splice(5, 0, { key: "account_number", header: "Account" })
  }
  await exportPdfTables({
    filename: `${assignedTo}-statement-${statementType || "full"}-${stamp}.pdf`,
    sections: [
      {
        title: `${assignedTo === "clients" ? "Client" : "Member"} Statement`,
        columns,
        rows: items.map((r) => ({
          transaction_date: String(r.transaction_date || "").slice(0, 10),
          transaction_number: String(r.transaction_number || ""),
          type: String(r.type || ""),
          assigned_to: String(assignedTo === "clients" ? r.client_name || "" : r.member_name || ""),
          assigned_no: String(assignedTo === "clients" ? "" : r.member_number || ""),
          account_number: String(r.account_number || ""),
          mode: String(r.mode || ""),
          debit: Number(r.debit || 0),
          credit: Number(r.credit || 0),
          balance_after: Number(r.balance_after || 0),
        })),
      },
    ],
  })
  return items.length
}
