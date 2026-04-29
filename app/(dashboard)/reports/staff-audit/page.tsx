"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import StyledMultiSelect from "@/components/newUI/styled_multi_select"
import RangeDatePicker, { type DateRangeValue } from "@/components/newUI/range_date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"
import { Filter, Loader2, RefreshCw } from "lucide-react"
import { RiResetLeftFill } from "react-icons/ri"
import { RiFileExcel2Line } from "react-icons/ri"
import { BsFileEarmarkPdf, BsFiletypePdf } from "react-icons/bs"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"
import AuditRowDetail from "./components/audit-row-detail"
import { exportStaffAuditExcel } from "./components/excel-export"
import { exportStaffAuditPdf } from "./components/pdf-export"
import { exportStaffAuditSummaryPdf } from "./components/summaryPdf"

type BranchOption = { id: string; name: string; branch_code?: string }
type StaffOption = { id: string; full_name: string; branch_id?: string | null }
type AuditRow = {
  id: string
  created_at: string
  branch_id: string
  branch_name?: string | null
  user_id?: string | null
  staff_name?: string | null
  category: string
  operation: "INSERT" | "UPDATE" | "DELETE"
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  old_values_resolved?: Record<string, unknown> | null
  new_values_resolved?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
}
type AuditSummary = { total_logs: number; inserts: number; updates: number; deletes: number }

export default function StaffAuditReportsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [items, setItems] = useState<AuditRow[]>([])
  const [summary, setSummary] = useState<AuditSummary>({ total_logs: 0, inserts: 0, updates: 0, deletes: 0 })
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])

  const [staffIds, setStaffIds] = useState<string[]>([])
  const [operation, setOperation] = useState("all")
  const [category, setCategory] = useState("all")
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryDateRange, setSummaryDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [resetVersion, setResetVersion] = useState(0)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set())

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/branches", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setBranches([])
      const raw = Array.isArray(data.items) ? data.items : []
      setBranches(
        raw
          .map((b: { id?: string; name?: string; branch_code?: string }) => ({
            id: String(b.id || ""),
            name: String(b.name || "Branch"),
            branch_code: b.branch_code ? String(b.branch_code) : "",
          }))
          .filter((b: BranchOption) => Boolean(b.id))
      )
    } catch {
      setBranches([])
    }
  }, [])

  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/staff?limit=200", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setStaff([])
      const raw = Array.isArray(data.staff) ? data.staff : Array.isArray(data.items) ? data.items : []
      setStaff(
        raw
          .map((u: { id?: string; full_name?: string; branch_id?: string | null }) => ({
            id: String(u.id || ""),
            full_name: String(u.full_name || "Staff"),
            branch_id: u.branch_id ? String(u.branch_id) : null,
          }))
          .filter((u: StaffOption) => Boolean(u.id))
      )
    } catch {
      setStaff([])
    }
  }, [])

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: b.id, label: b.branch_code ? `${b.name} (${b.branch_code})` : b.name })),
    [branches]
  )
  const staffOptions = useMemo(() => staff.map((u) => ({ value: u.id, label: u.full_name })), [staff])
  const operationOptions = useMemo(
    () => [
      { value: "all", label: "All operations" },
      { value: "INSERT", label: "Insert" },
      { value: "UPDATE", label: "Update" },
      { value: "DELETE", label: "Delete" },
    ],
    []
  )
  const categoryOptions = useMemo(
    () => [
      { value: "all", label: "All categories" },
      { value: "members", label: "Members" },
      { value: "clients", label: "Clients" },
      { value: "loans", label: "Loans" },
      { value: "sacco loans", label: "Sacco loans" },
      { value: "loan products", label: "Loan products" },
      { value: "savings", label: "Savings" },
      { value: "transactions", label: "Transactions" },
      { value: "invoices", label: "Invoices" },
      { value: "staff", label: "Staff" },
      { value: "investments", label: "Investments" },
    ],
    []
  )
  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set("pageSize", "1000")
    if (staffIds.length > 0) p.set("staff_ids", staffIds.join(","))
    if (operation !== "all") p.set("operation", operation)
    if (category !== "all") p.set("category", category)
    if (dateRange.start.trim()) p.set("dateStart", dateRange.start.trim())
    if (dateRange.end.trim()) p.set("dateEnd", dateRange.end.trim())
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    return p
  }, [staffIds, operation, category, dateRange.start, dateRange.end, isSuperAdmin, branchIds])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/reports/staff-audit?${buildQuery().toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setItems(Array.isArray(data.items) ? data.items : [])
      setSummary({
        total_logs: Number(data?.summary?.total_logs || 0),
        inserts: Number(data?.summary?.inserts || 0),
        updates: Number(data?.summary?.updates || 0),
        deletes: Number(data?.summary?.deletes || 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load staff audit report"
      toast({ variant: "destructive", title: "Could not load staff audit report", description: msg })
      setItems([])
      setSummary({ total_logs: 0, inserts: 0, updates: 0, deletes: 0 })
    } finally {
      setLoading(false)
    }
  }, [buildQuery, toast])

  const handleApplyFilters = () => {
    void loadReport()
  }

  const handleExportExcel = async () => {
    const rows = await exportStaffAuditExcel({
      items,
      isSuperAdmin,
      branchIds,
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      buildQuery,
    })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in XLSX.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleExportPdf = async () => {
    const rows = await exportStaffAuditPdf({
      items,
      isSuperAdmin,
      branchIds,
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      buildQuery,
    })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in PDF.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleSummaryPdf = async () => {
    const q = buildQuery()
    if (summaryDateRange.start.trim()) q.set("dateStart", summaryDateRange.start.trim())
    if (summaryDateRange.end.trim()) q.set("dateEnd", summaryDateRange.end.trim())
    const res = await fetch(`/api/institution/reports/staff-audit?${q.toString()}`, { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ variant: "destructive", title: "Summary export failed", description: data?.error || "Failed to load summary data." })
      return
    }
    const s = data?.summary || { total_logs: 0, inserts: 0, updates: 0, deletes: 0 }
    await exportStaffAuditSummaryPdf(s)
    toast({ variant: "success", title: "Export started", description: "Staff audit summary PDF generated." })
  }

  useEffect(() => {
    const s = getSession()
    const role = String(s?.role || "").trim().toLowerCase()
    const superAdmin = role === "super_admin"
    setIsSuperAdmin(superAdmin)
    void loadStaff()
    if (superAdmin) void loadBranches()
  }, [loadBranches, loadStaff])

  useEffect(() => {
    void loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resetVersion === 0) return
    void loadReport()
  }, [resetVersion, loadReport])

  const columns = useMemo<DataTableColumn<AuditRow>[]>(
    () => [
      { key: "created_at", header: "Date", render: (r) => String(r.created_at || "").replace("T", " ").slice(0, 19) || "—" },
      { key: "staff_name", header: "Staff", render: (r) => r.staff_name || "—" },
      { key: "branch_name", header: "Branch", render: (r) => r.branch_name || "—" },
      { key: "category", header: "Category", render: (r) => r.category || "—" },
      { key: "operation", header: "Operation", render: (r) => r.operation || "—" },
      {
        key: "changes",
        header: "Changes",
        render: (row) => {
          if (!row.old_values || Object.keys(row.old_values).length === 0) return "—"
          const oldValues = row.old_values
          const newValues = row.new_values || {}
          const allKeys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
          const changedKeys = allKeys.filter((k) => JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k]))
          if (changedKeys.length === 0) return "—"
          const preview = changedKeys.slice(0, 4).join(", ")
          return changedKeys.length > 4 ? `${preview} +${changedKeys.length - 4} more` : preview
        },
      },
      { key: "ip_address", header: "IP", render: (r) => r.ip_address || "—" },
    ],
    []
  )

  const handleReset = () => {
    setStaffIds([])
    setOperation("all")
    setCategory("all")
    setBranchIds([])
    setDateRange({ start: "", end: "" })
    setSummaryDateRange({ start: "", end: "" })
    setResetVersion((v) => v + 1)
  }

  const toggleExpand = (rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Staff Audit Reports</h1>
        <p className="text-muted-foreground">Track staff-level system actions from the audit trail.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total logs</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{summary.total_logs.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Insert operations</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-green-700">{summary.inserts.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Update operations</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-blue-700">{summary.updates.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Delete operations</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-rose-700">{summary.deletes.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters</CardTitle>
          <CardDescription>Refine audit entries by staff, operation, scope, date, and branch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-end gap-2">
            {isSuperAdmin && (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Branch</Label>
                <StyledMultiSelect value={branchIds} onChange={setBranchIds} placeholder="All branches" options={branchOptions} searchable />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[260px]">
              <Label>Staff</Label>
              <StyledMultiSelect value={staffIds} onChange={setStaffIds} placeholder="All staff" options={staffOptions} searchable />
            </div>
            <div className="space-y-2 w-auto min-w-[220px]">
              <Label>Operation</Label>
              <StyledSelect value={operation} onChange={setOperation} placeholder="All operations" options={operationOptions} />
            </div>
            <div className="space-y-2 w-auto min-w-[240px]">
              <Label>Category</Label>
              <StyledSelect value={category} onChange={setCategory} placeholder="All categories" options={categoryOptions} />
            </div>
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Date range</Label>
              <RangeDatePicker value={dateRange} onChange={setDateRange} placeholder="Filter by audit date" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TooltipButton tooltip="Apply filters" onClick={handleApplyFilters} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
            </TooltipButton>
            <TooltipButton tooltip="Reset filters" onClick={handleReset} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RiResetLeftFill className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Refresh" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></TooltipButton>
            <TooltipButton tooltip="Export XLS" onClick={() => void handleExportExcel()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"><RiFileExcel2Line className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Export PDF" onClick={() => void handleExportPdf()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFileEarmarkPdf className="h-4 w-4" /></TooltipButton>
            <div className="min-w-[260px]">
              <RangeDatePicker value={summaryDateRange} onChange={setSummaryDateRange} placeholder="Summary date range" />
            </div>
            <TooltipButton tooltip="Summary PDF" onClick={() => void handleSummaryPdf()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFiletypePdf className="h-4 w-4" /></TooltipButton>
          </div>
        </CardContent>
      </Card>

      <DataTable
        title="Audit entries"
        columns={columns}
        rows={items}
        loading={loading}
        emptyMessage="No audit entries match the current filters."
        renderDetail={(row) => <AuditRowDetail oldValues={row.old_values_resolved || row.old_values} newValues={row.new_values_resolved || row.new_values} />}
        expandedRowIds={expandedRowIds}
        onToggleExpand={toggleExpand}
        onRowClick={(row) => toggleExpand(row.id)}
      />
    </>
  )
}
