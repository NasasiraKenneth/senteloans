"use client"

import { exportExcelWorkbook, type ExcelSheet } from "@/components/export/excel/excel"

type BranchOption = { id: string; name: string }
type AuditRow = {
  created_at: string
  staff_name?: string | null
  branch_name?: string | null
  category: string
  operation: "INSERT" | "UPDATE" | "DELETE"
  old_values_resolved?: Record<string, unknown> | null
  new_values_resolved?: Record<string, unknown> | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
}

type ExportStaffAuditExcelParams = {
  items: AuditRow[]
  isSuperAdmin: boolean
  branchIds: string[]
  branches: BranchOption[]
  buildQuery: () => URLSearchParams
  apiPath?: string
}

function getChanges(row: AuditRow): string {
  const oldValues = row.old_values_resolved || row.old_values || {}
  const newValues = row.new_values_resolved || row.new_values || {}
  if (!oldValues || Object.keys(oldValues).length === 0) return "—"
  const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
  const changed = keys.filter((k) => JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k]))
  return changed.length === 0 ? "—" : changed.join(", ")
}

function stringifyPayload(payload?: Record<string, unknown> | null): string {
  if (!payload || Object.keys(payload).length === 0) return "—"
  try {
    return JSON.stringify(payload)
  } catch {
    return "—"
  }
}

function toRows(rows: AuditRow[]): Array<Array<string>> {
  return rows.map((row) => [
    String(row.created_at || "").replace("T", " ").slice(0, 19),
    String(row.staff_name || "—"),
    String(row.branch_name || "—"),
    String(row.category || "—"),
    String(row.operation || "—"),
    getChanges(row),
    stringifyPayload(row.old_values_resolved || row.old_values || null),
    stringifyPayload(row.new_values_resolved || row.new_values || null),
  ])
}

export async function exportStaffAuditExcel({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/staff-audit",
}: ExportStaffAuditExcelParams): Promise<number> {
  const headers = ["Date", "Staff", "Branch", "Category", "Operation", "Changes", "Old values", "New values"]
  const sheets: ExcelSheet[] = []
  let exportedRows = 0

  const addSheet = (name: string, rows: AuditRow[]) => {
    sheets.push({
      name,
      title: "Staff Audit Report",
      headers,
      rows: toRows(rows),
    })
    exportedRows += rows.length
  }

  if (isSuperAdmin) {
    const targetBranchIds = branchIds.length > 0 ? branchIds : branches.map((b) => b.id)
    if (targetBranchIds.length === 0) {
      addSheet("All branches", items)
    } else {
      for (const branchId of targetBranchIds) {
        const label = branches.find((b) => b.id === branchId)?.name || "Branch"
        const q = buildQuery()
        q.set("branches", branchId)
        const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) continue
        addSheet(label, Array.isArray(data.items) ? (data.items as AuditRow[]) : [])
      }
    }
  } else {
    let ownBranchName = branches[0]?.name || "Branch"
    if (!branches[0]?.name) {
      try {
        const res = await fetch("/api/institution/branches", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        const first = Array.isArray(data.items) ? data.items[0] : null
        if (first?.name) ownBranchName = String(first.name)
      } catch {
        // Keep fallback label when branch lookup fails.
      }
    }
    addSheet(ownBranchName, items)
  }

  if (sheets.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportExcelWorkbook({ filename: `staff-audit-report-${stamp}.xlsx`, sheets })
  return exportedRows
}
