"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import StyledMultiSelect from "@/components/newUI/styled_multi_select"
import RangeDatePicker, { type DateRangeValue } from "@/components/newUI/range_date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"
import { Filter, Loader2, RefreshCw } from "lucide-react"
import { RiFileExcel2Line, RiResetLeftFill } from "react-icons/ri"
import { BsFileEarmarkPdf } from "react-icons/bs"
import { BsFiletypePdf } from "react-icons/bs"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"
import { exportSavingsExcel } from "./components/excel-export"
import { exportSavingsPdf } from "./components/pdf-export"
import { exportSavingsSummaryPdf } from "./components/summaryPdf"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"

type SavingsItem = {
  id: string
  account_number: string
  member_name: string
  member_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date?: string | null
  last_transaction_date?: string | null
  branch_name: string
}

type BranchOption = { id: string; name: string }
type SavingsSummary = {
  total_accounts: number
  active_accounts: number
  total_balance: number
  average_balance: number
}

const STATUS_OPTIONS = ["Active", "Inactive", "Suspended", "Closed", "Dormant"]

export default function SavingsReportsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<SavingsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [summary, setSummary] = useState<SavingsSummary>({
    total_accounts: 0,
    active_accounts: 0,
    total_balance: 0,
    average_balance: 0,
  })

  const [statusFilter, setStatusFilter] = useState("all")
  const [accountTypeFilter, setAccountTypeFilter] = useState("all")
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [openDateRange, setOpenDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryOpenDateRange, setSummaryOpenDateRange] = useState<DateRangeValue>({ start: "", end: "" })

  const statusOptions = useMemo(
    () => [{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s }))],
    []
  )
  const accountTypeOptions = useMemo(() => {
    const unique = Array.from(new Set(items.map((i) => String(i.account_type || "").trim()).filter(Boolean)))
    return [{ value: "all", label: "All account types" }, ...unique.map((v) => ({ value: v, label: v }))]
  }, [items])
  const branchMultiOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches])

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/branches", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setBranches([])
      const raw = Array.isArray(data.items) ? data.items : []
      setBranches(raw.map((b: { id?: string; name?: string }) => ({ id: String(b.id || ""), name: String(b.name || "Branch") })).filter((b: BranchOption) => Boolean(b.id)))
    } catch {
      setBranches([])
    }
  }, [])

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set("pageSize", "5000")
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (accountTypeFilter !== "all") p.set("account_type", accountTypeFilter)
    if (openDateRange.start.trim()) p.set("openDateStart", openDateRange.start.trim())
    if (openDateRange.end.trim()) p.set("openDateEnd", openDateRange.end.trim())
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    return p
  }, [statusFilter, accountTypeFilter, openDateRange.start, openDateRange.end, isSuperAdmin, branchIds])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/reports/savings?${buildQuery().toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setItems(Array.isArray(data.items) ? (data.items as SavingsItem[]) : [])
      const s = (data.summary || {}) as Partial<SavingsSummary>
      setSummary({
        total_accounts: Number(s.total_accounts ?? 0),
        active_accounts: Number(s.active_accounts ?? 0),
        total_balance: Number(s.total_balance ?? 0),
        average_balance: Number(s.average_balance ?? 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load savings report"
      toast({ variant: "destructive", title: "Could not load report", description: msg })
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery, toast])

  useEffect(() => {
    const s = getSession()
    const role = String(s?.role || "").trim().toLowerCase()
    const superAdmin = role === "super_admin"
    setIsSuperAdmin(superAdmin)
    if (superAdmin) void loadBranches()
  }, [loadBranches])

  useEffect(() => {
    void loadReport()
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReset = () => {
    setStatusFilter("all")
    setAccountTypeFilter("all")
    setBranchIds([])
    setOpenDateRange({ start: "", end: "" })
  }

  const statusPillClass = (status: string) => {
    if (status === "Active") return "bg-green-100 text-green-700 border border-green-200"
    if (status === "Inactive" || status === "Dormant") return "bg-amber-100 text-amber-700 border border-amber-200"
    if (status === "Suspended") return "bg-rose-100 text-rose-700 border border-rose-200"
    if (status === "Closed") return "bg-slate-100 text-slate-700 border border-slate-200"
    return "bg-gray-100 text-gray-700 border border-gray-200"
  }

  const handleExportExcel = async () => {
    const rows = await exportSavingsExcel({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in XLSX.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleExportPdf = async () => {
    const rows = await exportSavingsPdf({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in PDF.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleSummaryPdf = async () => {
    try {
      const q = new URLSearchParams()
      q.set("pageSize", "5000")
      if (summaryOpenDateRange.start.trim()) q.set("openDateStart", summaryOpenDateRange.start.trim())
      if (summaryOpenDateRange.end.trim()) q.set("openDateEnd", summaryOpenDateRange.end.trim())
      if (isSuperAdmin && branchIds.length > 0) q.set("branches", branchIds.join(","))
      const res = await fetch(`/api/institution/reports/savings?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      const summaryItems = Array.isArray(data.items) ? (data.items as SavingsItem[]) : []
      const rows = await exportSavingsSummaryPdf({
        items: summaryItems,
        isSuperAdmin,
        branchIds,
        branches,
        buildQuery: () => {
          const p = new URLSearchParams()
          p.set("pageSize", "5000")
          if (summaryOpenDateRange.start.trim()) p.set("openDateStart", summaryOpenDateRange.start.trim())
          if (summaryOpenDateRange.end.trim()) p.set("openDateEnd", summaryOpenDateRange.end.trim())
          if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
          return p
        },
      })
      if (rows > 0) toast({ variant: "success", title: "Summary export started", description: `${rows} row(s) summarized in PDF.` })
      else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export summary PDF"
      toast({ variant: "destructive", title: "Summary export failed", description: msg })
    }
  }

  const columns = useMemo<DataTableColumn<SavingsItem>[]>(() => [
    { key: "account_number", header: "Account Number", render: (row) => <div className="font-medium">{row.account_number}</div> },
    { key: "member_name", header: "Member", render: (row) => row.member_name || "—" },
    { key: "account_type", header: "Account Type", render: (row) => row.account_type || "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPillClass(row.status)}`}>
          {row.status}
        </span>
      ),
    },
    { key: "open_date", header: "Open Date", render: (row) => String(row.open_date || "").slice(0, 10) || "—" },
    { key: "available_balance", header: "Available", render: (row) => `UGX ${Number(row.available_balance || 0).toLocaleString()}` },
    { key: "total_balance", header: "Total", render: (row) => `UGX ${Number(row.total_balance || 0).toLocaleString()}` },
  ], [])

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Savings Reports</h1>
        <p className="text-muted-foreground">Analyze savings account performance and export branch-level portfolio reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total accounts</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary.total_accounts}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Active accounts</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-700">{summary.active_accounts}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total balance</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.total_balance).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Average balance</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.average_balance).toLocaleString()}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters &amp; export</CardTitle>
          <CardDescription>Use filters to refine savings accounts, then export the report view.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-end gap-2">
            {isSuperAdmin && (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Branch</Label>
                <StyledMultiSelect value={branchIds} onChange={setBranchIds} placeholder="All branches" options={branchMultiOptions} searchable />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Status</Label>
              <StyledSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={statusOptions} searchable />
            </div>
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Account type</Label>
              <StyledSelect value={accountTypeFilter} onChange={setAccountTypeFilter} placeholder="All account types" options={accountTypeOptions} searchable />
            </div>
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Open date range</Label>
              <RangeDatePicker value={openDateRange} onChange={setOpenDateRange} placeholder="Filter by open date" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TooltipButton tooltip="Apply filters" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}</TooltipButton>
            <TooltipButton tooltip="Reset filters" onClick={handleReset} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RiResetLeftFill className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Refresh" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></TooltipButton>
            <TooltipButton tooltip="Export XLS" onClick={() => void handleExportExcel()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"><RiFileExcel2Line className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Export PDF" onClick={() => void handleExportPdf()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFileEarmarkPdf className="h-4 w-4" /></TooltipButton>
            <div className="min-w-[260px]">
              <RangeDatePicker value={summaryOpenDateRange} onChange={setSummaryOpenDateRange} placeholder="Summary open-date range" />
            </div>
            <TooltipButton tooltip="Summary PDF" onClick={() => void handleSummaryPdf()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFiletypePdf className="h-4 w-4" /></TooltipButton>
          </div>
        </CardContent>
      </Card>

      <DataTable
        title="Savings portfolio details"
        columns={columns}
        rows={items}
        loading={loading}
        emptyMessage="No savings accounts match the current filters."
      />
    </>
  )
}
