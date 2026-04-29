"use client"

import { exportExcelWorkbook, type ExcelSheet } from "@/components/export/excel/excel"

type BranchOption = { id: string; name: string }
type InvoiceRow = {
  invoice_number: string
  invoice_date?: string | null
  invoice_due?: string | null
  assigned_to: string
  target_type: string
  invoice_type: string
  status: string
  subtotal: number
  vat: number
  total_amount: number
  branch_name: string
}

type Params = {
  items: InvoiceRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

const headers = ["Invoice #", "Date", "Due", "Assigned To", "Target", "Type", "Status", "Subtotal", "VAT", "Total", "Branch"]

function asRows(rows: InvoiceRow[]) {
  return rows.map((r) => [
    String(r.invoice_number || ""),
    String(r.invoice_date || "").slice(0, 10),
    String(r.invoice_due || "").slice(0, 10),
    String(r.assigned_to || ""),
    String(r.target_type || ""),
    String(r.invoice_type || ""),
    String(r.status || ""),
    Number(r.subtotal || 0),
    Number(r.vat || 0),
    Number(r.total_amount || 0),
    String(r.branch_name || ""),
  ])
}

export async function exportInvoiceReportsExcel({ items, isSuperAdmin, branchIds, branches, buildQuery, apiPath = "/api/institution/reports/invoices" }: Params): Promise<number> {
  const sheets: ExcelSheet[] = []
  let exported = 0
  const addSheet = (name: string, rows: InvoiceRow[]) => {
    sheets.push({ name, title: "Invoice Reports", headers, rows: asRows(rows) })
    exported += rows.length
  }

  if (isSuperAdmin) {
    const target = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    if (target.length === 0) addSheet("All branches", items)
    else {
      for (const bid of target) {
        const label = branches.find((b) => b.id === bid)?.name || "Branch"
        const q = buildQuery()
        q.set("branches", bid)
        const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) continue
        addSheet(label, Array.isArray(data.items) ? (data.items as InvoiceRow[]) : [])
      }
    }
  } else {
    addSheet(branches[0]?.name || "Branch", items)
  }

  if (sheets.length === 0) return 0
  await exportExcelWorkbook({ filename: `invoice-reports-${new Date().toISOString().slice(0, 10)}.xlsx`, sheets })
  return exported
}
