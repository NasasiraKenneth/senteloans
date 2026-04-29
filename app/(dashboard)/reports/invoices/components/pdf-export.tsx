"use client"

import { exportPdfTables, type PdfSection } from "@/components/export/pdf/pdf"

type BranchOption = { id: string; name: string }
type InvoiceRow = {
  invoice_number: string
  invoice_date?: string | null
  invoice_due?: string | null
  assigned_to: string
  target_type: string
  invoice_type: string
  status: string
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

function section(name: string | undefined, rows: InvoiceRow[]): PdfSection {
  return {
    title: "Invoice Reports",
    sectionName: name,
    columns: [
      { key: "invoice_number", header: "Invoice #" },
      { key: "invoice_date", header: "Date" },
      { key: "invoice_due", header: "Due" },
      { key: "assigned_to", header: "Assigned To" },
      { key: "target_type", header: "Target" },
      { key: "invoice_type", header: "Type" },
      { key: "status", header: "Status" },
      { key: "total_amount", header: "Total" },
      { key: "branch_name", header: "Branch" },
    ],
    rows: rows.map((r) => ({
      invoice_number: r.invoice_number || "",
      invoice_date: String(r.invoice_date || "").slice(0, 10),
      invoice_due: String(r.invoice_due || "").slice(0, 10),
      assigned_to: r.assigned_to || "",
      target_type: r.target_type || "",
      invoice_type: r.invoice_type || "",
      status: r.status || "",
      total_amount: Number(r.total_amount || 0),
      branch_name: r.branch_name || "",
    })),
  }
}

export async function exportInvoiceReportsPdf({ items, isSuperAdmin, branchIds, branches, buildQuery, apiPath = "/api/institution/reports/invoices" }: Params): Promise<number> {
  const sections: PdfSection[] = []
  let exported = 0
  const add = (name: string | undefined, rows: InvoiceRow[]) => {
    sections.push(section(name, rows))
    exported += rows.length
  }

  if (isSuperAdmin && branchIds.length > 1) {
    for (const bid of branchIds) {
      const label = branches.find((b) => b.id === bid)?.name || "Branch"
      const q = buildQuery()
      q.set("branches", bid)
      const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) continue
      add(label, Array.isArray(data.items) ? (data.items as InvoiceRow[]) : [])
    }
  } else {
    const active = branchIds.length === 1 ? branches.find((b) => b.id === branchIds[0]) : null
    add(active?.name, items)
  }
  if (sections.length === 0) return 0
  await exportPdfTables({ filename: `invoice-reports-${new Date().toISOString().slice(0, 10)}.pdf`, sections })
  return exported
}
