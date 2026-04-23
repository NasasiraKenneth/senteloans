"use client"

import { exportPdfTables, type PdfSection } from "@/components/export/pdf/pdf"

type ShareRow = {
  member_number: string
  full_name: string
  phone_number?: string
  member_type: string
  number_of_shares: number
  share_value: number
  total_share_value: number
  first_purchase_date?: string | null
  last_purchase_date?: string | null
}

type BranchOption = { id: string; name: string }

type ExportSharesPdfParams = {
  items: ShareRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function toSection(title: string, sectionName: string | undefined, rows: ShareRow[]): PdfSection {
  return {
    title,
    sectionName,
    columns: [
      { key: "member_number", header: "Member Number" },
      { key: "full_name", header: "Member Name" },
      { key: "phone_number", header: "Phone" },
      { key: "member_type", header: "Member Type" },
      { key: "number_of_shares", header: "Shares" },
      { key: "share_value", header: "Share Value (UGX)" },
      { key: "total_share_value", header: "Total Value (UGX)" },
      { key: "first_purchase_date", header: "First Purchase" },
      { key: "last_purchase_date", header: "Last Purchase" },
    ],
    rows: rows.map((r) => ({
      member_number: String(r.member_number || ""),
      full_name: String(r.full_name || ""),
      phone_number: String(r.phone_number || ""),
      member_type: String(r.member_type || ""),
      number_of_shares: Number(r.number_of_shares || 0),
      share_value: Number(r.share_value || 0),
      total_share_value: Number(r.total_share_value || 0),
      first_purchase_date: String(r.first_purchase_date || "").slice(0, 10),
      last_purchase_date: String(r.last_purchase_date || "").slice(0, 10),
    })),
  }
}

export async function exportSharesPdf({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/shares",
}: ExportSharesPdfParams): Promise<number> {
  const sections: PdfSection[] = []
  let exportedRows = 0
  const title = "Shareholding Report"

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
        const rows = Array.isArray(data.items) ? (data.items as ShareRow[]) : []
        sections.push(toSection(title, branchName, rows))
        exportedRows += rows.length
      }
    }
  } else {
    sections.push(toSection(title, "My branch", items))
    exportedRows += items.length
  }

  if (sections.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportPdfTables({
    filename: `shares-report-${stamp}.pdf`,
    sections,
  })
  return exportedRows
}
