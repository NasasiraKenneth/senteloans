"use client"

import { exportPdfTables, type PdfSection } from "@/components/export/pdf/pdf"

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

type ExportStaffAuditPdfParams = {
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

function toSection(sectionName: string | undefined, rows: AuditRow[]): PdfSection {
  return {
    title: "Staff Audit Report",
    sectionName,
    columns: [
      { key: "date", header: "Date" },
      { key: "staff", header: "Staff" },
      { key: "branch", header: "Branch" },
      { key: "category", header: "Category" },
      { key: "operation", header: "Operation" },
      { key: "changes", header: "Changes" },
    ],
    rows: rows.map((row) => ({
      date: String(row.created_at || "").replace("T", " ").slice(0, 19),
      staff: row.staff_name || "—",
      branch: row.branch_name || "—",
      category: row.category || "—",
      operation: row.operation || "—",
      changes: getChanges(row),
    })),
  }
}

export async function exportStaffAuditPdf({
  items,
  isSuperAdmin,
  branchIds,
  branches,
  buildQuery,
  apiPath = "/api/institution/reports/staff-audit",
}: ExportStaffAuditPdfParams): Promise<number> {
  const sections: PdfSection[] = []
  let exportedRows = 0

  const addSection = (name: string | undefined, rows: AuditRow[]) => {
    sections.push(toSection(name, rows))
    exportedRows += rows.length
  }

  if (isSuperAdmin && branchIds.length > 1) {
    for (const branchId of branchIds) {
      const label = branches.find((b) => b.id === branchId)?.name || "Branch"
      const q = buildQuery()
      q.set("branches", branchId)
      const res = await fetch(`${apiPath}?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) continue
      addSection(label, Array.isArray(data.items) ? (data.items as AuditRow[]) : [])
    }
  } else {
    const activeBranch = branchIds.length === 1 ? branches.find((b) => b.id === branchIds[0]) : null
    addSection(activeBranch?.name, items)
  }

  if (sections.length === 0) return 0
  const stamp = new Date().toISOString().slice(0, 10)
  await exportPdfTables({ filename: `staff-audit-report-${stamp}.pdf`, sections })
  return exportedRows
}
