"use client"

import { exportPdfTables, type PdfSection } from "@/components/export/pdf/pdf"

type SavingsRow = {
  account_number: string
  member_name: string
  member_number: string
  account_type: string
  status: string
  branch_name: string
  open_date?: string | null
  last_transaction_date?: string | null
  available_balance?: number
  total_balance?: number
}

type BranchOption = { id: string; name: string }

type ExportSavingsPdfParams = {
  items: SavingsRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function toSection(title: string, sectionName: string | undefined, rows: SavingsRow[]): PdfSection {
  return {
    title,
    sectionName,
    columns: [
      { key: "account_number", header: "Account Number" },
      { key: "member_name", header: "Member" },
      { key: "member_number", header: "Member No" },
      { key: "account_type", header: "Account Type" },
      { key: "status", header: "Status" },
      { key: "branch_name", header: "Branch" },
      { key: "open_date", header: "Open Date" },
      { key: "last_transaction_date", header: "Last Transaction" },
      { key: "available_balance", header: "Available (UGX)" },
      { key: "total_balance", header: "Total (UGX)" },
    ],
    rows: rows.map((r) => ({
      account_number: String(r.account_number || ""),
      member_name: String(r.member_name || ""),
      member_number: String(r.member_number || ""),
      account_type: String(r.account_type || ""),
      status: String(r.status || ""),
      branch_name: String(r.branch_name || ""),
      open_date: String(r.open_date || "").slice(0, 10),
      last_transaction_date: String(r.last_transaction_date || "").slice(0, 10),
      available_balance: Number(r.available_balance || 0),
      total_balance: Number(r.total_balance || 0),
    })),
  }
}

export async function exportSavingsPdf({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/savings",
}: ExportSavingsPdfParams): Promise<number> {
  const title = "Savings Portfolio Report"
  const sections: PdfSection[] = []
  let exportedRows = 0

  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    if (targetBranchIds.length === 0) {
      sections.push(toSection(title, "All branches", items))
      exportedRows += items.length
    } else {
      for (const bid of targetBranchIds) {
        const branchName = branches.find((b) => b.id === bid)?.name || "Branch"
        const q = buildQuery()
        q.set("branches", bid)
        const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) continue
        const rows = Array.isArray(data.items) ? (data.items as SavingsRow[]) : []
        sections.push(toSection(title, branchName, rows))
        exportedRows += rows.length
      }
    }
  } else {
    const branchName = items[0]?.branch_name || branches[0]?.name || "My branch"
    sections.push(toSection(title, branchName, items))
    exportedRows += items.length
  }

  if (sections.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportPdfTables({
    filename: `savings-report-${stamp}.pdf`,
    sections,
  })
  return exportedRows
}
