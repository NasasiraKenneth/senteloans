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
import { exportInvoiceReportsExcel } from "./components/excel-export"
import { exportInvoiceReportsPdf } from "./components/pdf-export"
import { exportInvoiceSummaryPdf } from "./components/summaryPdf"

type BranchOption = { id: string; name: string }
type MemberOption = { id: string; label: string }
type ClientOption = { id: string; label: string }
type InvoiceRow = {
  id: string
  invoice_number: string
  invoice_date?: string | null
  invoice_due?: string | null
  assigned_to: string
  target_type: string
  invoice_type: string
  status: string
  subtotal: number
  vat: number
  total_amount: number
  branch_name: string
}
type Summary = {
  total_invoices: number
  total_amount: number
  paid_invoices: number
  overdue_invoices: number
  pending_invoices: number
}

const STATUS_OPTIONS = ["draft", "sent", "paid", "overdue", "cancelled"]

export default function InvoiceReportsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [summary, setSummary] = useState<Summary>({ total_invoices: 0, total_amount: 0, paid_invoices: 0, overdue_invoices: 0, pending_invoices: 0 })

  const [statusFilter, setStatusFilter] = useState("all")
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("all")
  const [assignedTo, setAssignedTo] = useState<"members" | "clients">("members")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [clientIds, setClientIds] = useState<string[]>([])
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [invoiceDateRange, setInvoiceDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [dueDateRange, setDueDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryInvoiceDateRange, setSummaryInvoiceDateRange] = useState<DateRangeValue>({ start: "", end: "" })

  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches])
  const memberOptions = useMemo(() => members.map((m) => ({ value: m.id, label: m.label })), [members])
  const clientOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.label })), [clients])
  const statusOptions = useMemo(
    () => [{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.toUpperCase() }))],
    []
  )
  const invoiceTypeOptions = useMemo(() => [{ value: "all", label: "All invoice types" }, { value: "Auto", label: "Auto" }, { value: "Manual", label: "Manual" }], [])
  

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

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/members?limit=200", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setMembers([])
      const raw = Array.isArray(data.members) ? data.members : Array.isArray(data.clients) ? data.clients : []
      setMembers(
        raw
          .map((m: { id?: string; full_name?: string; member_number?: string }) => ({
            id: String(m.id || ""),
            label: `${String(m.full_name || "Member")} (${String(m.member_number || "")})`,
          }))
          .filter((m: MemberOption) => Boolean(m.id))
      )
    } catch {
      setMembers([])
    }
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/clients?limit=200", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setClients([])
      const raw = Array.isArray(data.clients) ? data.clients : []
      setClients(
        raw
          .map((c: { id?: string; name?: string }) => ({
            id: String(c.id || ""),
            label: String(c.name || "Client"),
          }))
          .filter((c: ClientOption) => Boolean(c.id))
      )
    } catch {
      setClients([])
    }
  }, [])

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set("pageSize", "5000")
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (invoiceTypeFilter !== "all") p.set("invoice_type", invoiceTypeFilter)
    p.set("target_type", assignedTo === "members" ? "member" : "client")
    if (assignedTo === "members" && memberIds.length > 0) p.set("member_ids", memberIds.join(","))
    if (assignedTo === "clients" && clientIds.length > 0) p.set("client_ids", clientIds.join(","))
    if (invoiceDateRange.start.trim()) p.set("invoiceDateStart", invoiceDateRange.start.trim())
    if (invoiceDateRange.end.trim()) p.set("invoiceDateEnd", invoiceDateRange.end.trim())
    if (dueDateRange.start.trim()) p.set("dueDateStart", dueDateRange.start.trim())
    if (dueDateRange.end.trim()) p.set("dueDateEnd", dueDateRange.end.trim())
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    return p
  }, [statusFilter, invoiceTypeFilter, assignedTo, memberIds, clientIds, invoiceDateRange.start, invoiceDateRange.end, dueDateRange.start, dueDateRange.end, isSuperAdmin, branchIds])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/reports/invoices?${buildQuery().toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setItems(Array.isArray(data.items) ? (data.items as InvoiceRow[]) : [])
      const s = (data.summary || {}) as Partial<Summary>
      setSummary({
        total_invoices: Number(s.total_invoices ?? 0),
        total_amount: Number(s.total_amount ?? 0),
        paid_invoices: Number(s.paid_invoices ?? 0),
        overdue_invoices: Number(s.overdue_invoices ?? 0),
        pending_invoices: Number(s.pending_invoices ?? 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load invoice reports"
      toast({ variant: "destructive", title: "Could not load report", description: msg })
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery, toast])

  useEffect(() => {
    const s = getSession()
    const superAdmin = String(s?.role || "").trim().toLowerCase() === "super_admin"
    setIsSuperAdmin(superAdmin)
    if (superAdmin) void loadBranches()
    void loadMembers()
    void loadClients()
  }, [loadBranches, loadMembers, loadClients])

  useEffect(() => {
    if (assignedTo === "members") setClientIds([])
    if (assignedTo === "clients") setMemberIds([])
  }, [assignedTo])

  useEffect(() => {
    void loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReset = () => {
    setStatusFilter("all")
    setInvoiceTypeFilter("all")
    setAssignedTo("members")
    setMemberIds([])
    setClientIds([])
    setBranchIds([])
    setInvoiceDateRange({ start: "", end: "" })
    setDueDateRange({ start: "", end: "" })
    setSummaryInvoiceDateRange({ start: "", end: "" })
  }

  const handleExportExcel = async () => {
    const rows = await exportInvoiceReportsExcel({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in XLSX.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }
  const handleExportPdf = async () => {
    const rows = await exportInvoiceReportsPdf({ items, isSuperAdmin, branchIds, branches, buildQuery })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in PDF.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }
  const handleSummaryPdf = async () => {
    try {
      const q = buildQuery()
      q.delete("invoiceDateStart")
      q.delete("invoiceDateEnd")
      if (summaryInvoiceDateRange.start.trim()) q.set("invoiceDateStart", summaryInvoiceDateRange.start.trim())
      if (summaryInvoiceDateRange.end.trim()) q.set("invoiceDateEnd", summaryInvoiceDateRange.end.trim())
      const res = await fetch(`/api/institution/reports/invoices?${q.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      const s = (data.summary || {}) as Partial<Summary>
      const rows = await exportInvoiceSummaryPdf(
        {
          total_invoices: Number(s.total_invoices ?? 0),
          total_amount: Number(s.total_amount ?? 0),
          paid_invoices: Number(s.paid_invoices ?? 0),
          overdue_invoices: Number(s.overdue_invoices ?? 0),
          pending_invoices: Number(s.pending_invoices ?? 0),
        },
        summaryInvoiceDateRange
      )
      if (rows > 0) toast({ variant: "success", title: "Summary export started", description: `${rows} invoice(s) summarized.` })
      else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export summary PDF"
      toast({ variant: "destructive", title: "Summary export failed", description: msg })
    }
  }

  const statusPillClass = (status: string) => {
    const s = String(status || "").toLowerCase()
    if (s === "paid") return "bg-green-100 text-green-700 border border-green-200"
    if (s === "overdue") return "bg-rose-100 text-rose-700 border border-rose-200"
    if (s === "cancelled") return "bg-slate-100 text-slate-700 border border-slate-200"
    if (s === "sent") return "bg-blue-100 text-blue-700 border border-blue-200"
    return "bg-amber-100 text-amber-700 border border-amber-200"
  }

  const columns = useMemo<DataTableColumn<InvoiceRow>[]>(() => [
    { key: "invoice_number", header: "Invoice #", render: (r) => <div className="font-medium">{r.invoice_number}</div> },
    { key: "invoice_date", header: "Date", render: (r) => String(r.invoice_date || "").slice(0, 10) || "—" },
    { key: "invoice_due", header: "Due", render: (r) => String(r.invoice_due || "").slice(0, 10) || "—" },
    { key: "assigned_to", header: "Assigned to", render: (r) => r.assigned_to || "—" },
    { key: "target_type", header: "Target", render: (r) => r.target_type || "—" },
    { key: "invoice_type", header: "Type", render: (r) => r.invoice_type || "—" },
    { key: "status", header: "Status", render: (r) => <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPillClass(r.status)}`}>{r.status}</span> },
    { key: "total_amount", header: "Total", render: (r) => `UGX ${Number(r.total_amount || 0).toLocaleString()}` },
  ], [])

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Invoice Reports</h1>
        <p className="text-muted-foreground">Analyze invoice performance and export billing reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total invoices</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary.total_invoices}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total amount</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.total_amount).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Paid invoices</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-700">{summary.paid_invoices}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Overdue invoices</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-700">{summary.overdue_invoices}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters &amp; export</CardTitle>
              <CardDescription>Refine invoice scope by assignee, type, dates, and branch before exporting.</CardDescription>
            </div>
            <div className="space-y-2 min-w-[220px]">
              <div className="relative inline-grid grid-cols-2 rounded-full border border-[#f08c2b]/30 bg-[#f08c2b]/10 p-1 min-w-[220px]">
                <div
                  className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-[#f08c2b] shadow-sm transition-transform duration-200 ${
                    assignedTo === "clients" ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setAssignedTo("members")}
                  className={`relative z-10 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    assignedTo === "members" ? "text-white font-medium" : "text-[#a85a16] hover:text-[#8f4b12]"
                  }`}
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => setAssignedTo("clients")}
                  className={`relative z-10 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    assignedTo === "clients" ? "text-white font-medium" : "text-[#a85a16] hover:text-[#8f4b12]"
                  }`}
                >
                  Clients
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-end gap-2">
            {isSuperAdmin && <div className="space-y-2 w-auto min-w-[300px]"><Label>Branch</Label><StyledMultiSelect value={branchIds} onChange={setBranchIds} placeholder="All branches" options={branchOptions} searchable /></div>}
            <div className="space-y-2 w-auto min-w-[300px]"><Label>Status</Label><StyledSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={statusOptions} searchable /></div>
            <div className="space-y-2 w-auto min-w-[300px]"><Label>Invoice type</Label><StyledSelect value={invoiceTypeFilter} onChange={setInvoiceTypeFilter} placeholder="All invoice types" options={invoiceTypeOptions} /></div>
            {assignedTo === "members" ? (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Members</Label>
                <StyledMultiSelect value={memberIds} onChange={setMemberIds} placeholder="All members" options={memberOptions} searchable />
              </div>
            ) : (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Clients</Label>
                <StyledMultiSelect value={clientIds} onChange={setClientIds} placeholder="All clients" options={clientOptions} searchable />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[300px]"><Label>Invoice date range</Label><RangeDatePicker value={invoiceDateRange} onChange={setInvoiceDateRange} placeholder="Filter by invoice date" /></div>
            <div className="space-y-2 w-auto min-w-[300px]"><Label>Due date range</Label><RangeDatePicker value={dueDateRange} onChange={setDueDateRange} placeholder="Filter by due date" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TooltipButton tooltip="Apply filters" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}</TooltipButton>
            <TooltipButton tooltip="Reset filters" onClick={handleReset} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RiResetLeftFill className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Refresh" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></TooltipButton>
            <TooltipButton tooltip="Export XLS" onClick={() => void handleExportExcel()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"><RiFileExcel2Line className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Export PDF" onClick={() => void handleExportPdf()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFileEarmarkPdf className="h-4 w-4" /></TooltipButton>
            <div className="min-w-[260px]">
              <RangeDatePicker value={summaryInvoiceDateRange} onChange={setSummaryInvoiceDateRange} placeholder="Summary invoice-date range" />
            </div>
            <TooltipButton tooltip="Summary PDF" onClick={() => void handleSummaryPdf()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFiletypePdf className="h-4 w-4" /></TooltipButton>
          </div>
        </CardContent>
      </Card>

      <DataTable
        title="Invoice portfolio details"
        columns={columns}
        rows={items}
        loading={loading}
        emptyMessage="No invoices match the current filters."
      />
    </>
  )
}
