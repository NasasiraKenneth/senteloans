"use client"

import { exportExcelWorkbook, type ExcelSheet } from "@/components/export/excel/excel"

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

type ExportSavingsExcelParams = {
  items: SavingsRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function toRows(rows: SavingsRow[]) {
  const headers = [
    "Account Number",
    "Member",
    "Member No",
    "Account Type",
    "Status",
    "Open Date",
    "Last Transaction",
    "Available Balance (UGX)",
    "Total Balance (UGX)",
  ]
  const body = rows.map((r) => [
    String(r.account_number || ""),
    String(r.member_name || ""),
    String(r.member_number || ""),
    String(r.account_type || ""),
    String(r.status || ""),
    String(r.open_date || "").slice(0, 10),
    String(r.last_transaction_date || "").slice(0, 10),
    Number(r.available_balance || 0),
    Number(r.total_balance || 0),
  ])
  return { headers, body }
}

export async function exportSavingsExcel({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/savings",
}: ExportSavingsExcelParams): Promise<number> {
  const sheets: ExcelSheet[] = []
  let exportedRows = 0
  const addSheet = (name: string, rows: SavingsRow[]) => {
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
        const rows = Array.isArray(data.items) ? (data.items as SavingsRow[]) : []
        addSheet(branchName, rows)
      }
    }
  } else {
    const branchName = items[0]?.branch_name || branches[0]?.name || "My branch"
    addSheet(branchName, items)
  }

  if (sheets.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportExcelWorkbook({
    filename: `savings-report-${stamp}.xlsx`,
    sheets,
  })
  return exportedRows
}
