"use client"

import { exportExcelWorkbook, type ExcelSheet } from "@/components/export/excel/excel"

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

type ExportSharesExcelParams = {
  items: ShareRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function toRows(rows: ShareRow[]) {
  const headers = [
    "Member Number",
    "Member Name",
    "Phone",
    "Member Type",
    "Number of Shares",
    "Share Value (UGX)",
    "Total Share Value (UGX)",
    "First Purchase",
    "Last Purchase",
  ]
  const body = rows.map((r) => [
    String(r.member_number || ""),
    String(r.full_name || ""),
    String(r.phone_number || ""),
    String(r.member_type || ""),
    Number(r.number_of_shares || 0),
    Number(r.share_value || 0),
    Number(r.total_share_value || 0),
    String(r.first_purchase_date || "").slice(0, 10),
    String(r.last_purchase_date || "").slice(0, 10),
  ])
  return { headers, body }
}

export async function exportSharesExcel({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/shares",
}: ExportSharesExcelParams): Promise<number> {
  const sheets: ExcelSheet[] = []
  let exportedRows = 0
  const addSheet = (name: string, rows: ShareRow[]) => {
    const { headers, body } = toRows(rows)
    sheets.push({ name, headers, rows: body })
    exportedRows += rows.length
  }

  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    if (targetBranchIds.length === 0) {
      addSheet("All branches", items)
    } else {
      for (const bid of targetBranchIds) {
        const branchName = branches.find((b) => b.id === bid)?.name || "Branch"
        const q = buildQuery()
        q.set("branches", bid)
        const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) continue
        const rows = Array.isArray(data.items) ? (data.items as ShareRow[]) : []
        addSheet(branchName, rows)
      }
    }
  } else {
    addSheet("My branch", items)
  }

  if (sheets.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportExcelWorkbook({
    filename: `shares-report-${stamp}.xlsx`,
    sheets,
  })
  return exportedRows
}
