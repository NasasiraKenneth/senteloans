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
import { BsFileEarmarkPdf, BsFiletypePdf } from "react-icons/bs"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { exportSharesExcel } from "./components/excel-export"
import { exportSharesPdf } from "./components/pdf-export"
import { exportSharesSummaryPdf } from "./components/summaryPdf"

type ShareItem = {
  id: string
  full_name: string
  member_number: string
  phone_number?: string
  member_type: string
  branch_name: string
  number_of_shares: number
  share_value: number
  total_share_value: number
  first_purchase_date?: string | null
  last_purchase_date?: string | null
}

type BranchOption = { id: string; name: string }
type SharesSummary = {
  total_members: number
  total_shares: number
  total_share_value: number
  avg_shares_per_member: number
}

const MEMBER_TYPES = ["Individual", "Group", "Corporate"]

export default function ShareReportsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<ShareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [summary, setSummary] = useState<SharesSummary>({
    total_members: 0,
    total_shares: 0,
    total_share_value: 0,
    avg_shares_per_member: 0,
  })

  const [memberTypeFilter, setMemberTypeFilter] = useState("all")
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [purchaseRange, setPurchaseRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryPurchaseRange, setSummaryPurchaseRange] = useState<DateRangeValue>({ start: "", end: "" })

  const memberTypeOptions = useMemo(
    () => [{ value: "all", label: "All member types" }, ...MEMBER_TYPES.map((t) => ({ value: t, label: t }))],
    []
  )
  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches])

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
    if (memberTypeFilter !== "all") p.set("member_type", memberTypeFilter)
    if (purchaseRange.start.trim()) p.set("purchaseDateStart", purchaseRange.start.trim())
    if (purchaseRange.end.trim()) p.set("purchaseDateEnd", purchaseRange.end.trim())
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    return p
  }, [memberTypeFilter, purchaseRange.start, purchaseRange.end, isSuperAdmin, branchIds])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/reports/shares?${buildQuery().toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setItems(Array.isArray(data.items) ? (data.items as ShareItem[]) : [])
      const s = (data.summary || {}) as Partial<SharesSummary>
      setSummary({
        total_members: Number(s.total_members ?? 0),
        total_shares: Number(s.total_shares ?? 0),
        total_share_value: Number(s.total_share_value ?? 0),
        avg_shares_per_member: Number(s.avg_shares_per_member ?? 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load share report"
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
    setMemberTypeFilter("all")
    setBranchIds([])
    setPurchaseRange({ start: "", end: "" })
  }

  const handleExportExcel = async () => {
    const rows = await exportSharesExcel({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in XLSX.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleExportPdf = async () => {
    const rows = await exportSharesPdf({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in PDF.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleSummaryPdf = async () => {
    try {
      const q = new URLSearchParams()
      q.set("pageSize", "5000")
      if (summaryPurchaseRange.start.trim()) q.set("purchaseDateStart", summaryPurchaseRange.start.trim())
      if (summaryPurchaseRange.end.trim()) q.set("purchaseDateEnd", summaryPurchaseRange.end.trim())
      if (isSuperAdmin && branchIds.length > 0) q.set("branches", branchIds.join(","))
      const res = await fetch(`/api/institution/reports/shares?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      const summaryItems = Array.isArray(data.items) ? (data.items as ShareItem[]) : []
      const rows = await exportSharesSummaryPdf({ items: summaryItems })
      if (rows > 0) toast({ variant: "success", title: "Summary export started", description: `${rows} row(s) summarized in PDF.` })
      else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export summary PDF"
      toast({ variant: "destructive", title: "Summary export failed", description: msg })
    }
  }

  const columns = useMemo<DataTableColumn<ShareItem>[]>(
    () => [
      { key: "member_number", header: "Member #", render: (row) => <div className="font-medium">{row.member_number}</div> },
      { key: "full_name", header: "Name", render: (row) => row.full_name || "—" },
      { key: "phone_number", header: "Phone", render: (row) => row.phone_number || "—" },
      { key: "member_type", header: "Member Type", render: (row) => row.member_type || "—" },
      { key: "shares", header: "Number of Shares", render: (row) => Number(row.number_of_shares || 0).toLocaleString() },
      { key: "share_value", header: "Share Value", render: (row) => `UGX ${Number(row.share_value || 0).toLocaleString()}` },
      { key: "total_value", header: "Total Value", render: (row) => `UGX ${Number(row.total_share_value || 0).toLocaleString()}` },
      { key: "first_purchase_date", header: "First Purchase", render: (row) => String(row.first_purchase_date || "").slice(0, 10) || "—" },
      { key: "last_purchase_date", header: "Last Purchase", render: (row) => String(row.last_purchase_date || "").slice(0, 10) || "—" },
    ],
    []
  )

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Share reports</h1>
        <p className="text-muted-foreground">Analyze member shareholding performance and export detailed or summary reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total shareholders</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary.total_members}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total shares</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-700">{summary.total_shares.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total share value</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.total_share_value).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Avg shares/member</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{summary.avg_shares_per_member.toFixed(1)}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters &amp; export</CardTitle>
          <CardDescription>Use filters to refine share records, then export the report view.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-end gap-2">
            {isSuperAdmin && (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Branch</Label>
                <StyledMultiSelect value={branchIds} onChange={setBranchIds} placeholder="All branches" options={branchOptions} searchable />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Member type</Label>
              <StyledSelect value={memberTypeFilter} onChange={setMemberTypeFilter} placeholder="All member types" options={memberTypeOptions} />
            </div>
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Purchase date range</Label>
              <RangeDatePicker value={purchaseRange} onChange={setPurchaseRange} placeholder="Filter by purchase date" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TooltipButton tooltip="Apply filters" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}</TooltipButton>
            <TooltipButton tooltip="Reset filters" onClick={handleReset} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RiResetLeftFill className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Refresh" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></TooltipButton>
            <TooltipButton tooltip="Export XLS" onClick={() => void handleExportExcel()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"><RiFileExcel2Line className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Export PDF" onClick={() => void handleExportPdf()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFileEarmarkPdf className="h-4 w-4" /></TooltipButton>
            <div className="min-w-[260px]">
              <RangeDatePicker value={summaryPurchaseRange} onChange={setSummaryPurchaseRange} placeholder="Summary purchase-date range" />
            </div>
            <TooltipButton tooltip="Summary PDF" onClick={() => void handleSummaryPdf()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFiletypePdf className="h-4 w-4" /></TooltipButton>
          </div>
        </CardContent>
      </Card>

      <DataTable
        title="Shareholding details"
        columns={columns}
        rows={items}
        loading={loading}
        emptyMessage="No share records match the current filters."
      />
    </>
  )
}
