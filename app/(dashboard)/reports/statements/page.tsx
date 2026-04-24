"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { exportStatementsExcel } from "./components/excel-export"
import { exportStatementsPdf } from "./components/pdf-export"
import { exportStatementsSummaryPdf } from "./components/summaryPdf"

type BranchOption = { id: string; name: string }
type StatementRow = {
  id: string
  transaction_number: string
  type: string
  amount: number
  debit: number
  credit: number
  mode: string
  description: string
  reference_number: string
  balance_before: number
  balance_after: number
  transaction_date?: string | null
  member_id: string
  client_id?: string
  member_name: string
  member_number: string
  client_name?: string
  client_number?: string
  account_number: string
}
type StatementSummary = {
  opening_balance: number
  closing_balance: number
  total_debit: number
  total_credit: number
}
type MemberOption = { id: string; label: string }
type ClientOption = { id: string; label: string }

const STATEMENT_TYPES = [
  { value: "full", label: "Full statement" },
  { value: "sacco_loans", label: "Sacco loan statement" },
  { value: "investment", label: "Investment statement" },
]

export default function StatementsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<StatementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [summary, setSummary] = useState<StatementSummary>({
    opening_balance: 0,
    closing_balance: 0,
    total_debit: 0,
    total_credit: 0,
  })

  const [statementType, setStatementType] = useState("full")
  const [assignedTo, setAssignedTo] = useState<"members" | "clients">("members")
  const [memberId, setMemberId] = useState("all")
  const [clientId, setClientId] = useState("all")
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryDateRange, setSummaryDateRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [resetVersion, setResetVersion] = useState(0)
  const assigneeModeInitialized = useRef(false)

  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches])
  const memberSelectOptions = useMemo(
    () => [{ value: "all", label: "All members" }, ...members.map((m) => ({ value: m.id, label: m.label }))],
    [members]
  )
  const clientSelectOptions = useMemo(
    () => [{ value: "all", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.label }))],
    [clients]
  )

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
      const res = await fetch("/api/institution/members?limit=100", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setMembers([])
      const raw = Array.isArray(data.members) ? data.members : Array.isArray(data.clients) ? data.clients : []
      setMembers(
        raw.map((m: { id?: string; full_name?: string; member_number?: string }) => ({
          id: String(m.id || ""),
          label: `${String(m.full_name || "Member")} (${String(m.member_number || "")})`,
        })).filter((m: MemberOption) => Boolean(m.id))
      )
    } catch {
      setMembers([])
    }
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/clients?limit=100", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setClients([])
      const raw = Array.isArray(data.clients) ? data.clients : []
      setClients(
        raw
          .map((c: { id?: string; name?: string; email?: string }) => ({
            id: String(c.id || ""),
            label: String(c.name || c.email || "Client"),
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
    p.set("statement_type", statementType)
    p.set("assigned_to", assignedTo)
    if (assignedTo === "members" && memberId !== "all") p.set("member_id", memberId)
    if (assignedTo === "clients" && clientId !== "all") p.set("client_id", clientId)
    if (dateRange.start.trim()) p.set("dateStart", dateRange.start.trim())
    if (dateRange.end.trim()) p.set("dateEnd", dateRange.end.trim())
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    return p
  }, [statementType, assignedTo, memberId, clientId, dateRange.start, dateRange.end, isSuperAdmin, branchIds])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/reports/statements?${buildQuery().toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      const rawItems = Array.isArray(data.items) ? (data.items as StatementRow[]) : []
      const scopedItems = rawItems.filter((row) => {
        const hasMember = Boolean(String(row.member_id || "").trim())
        const hasClient = Boolean(String(row.client_id || "").trim())
        const hasClientName = Boolean(String(row.client_name || "").trim())
        // Classify rows with client_id as client-side first.
        return assignedTo === "clients" ? (hasClient || hasClientName) : hasMember && !hasClient
      })
      setItems(scopedItems)
      const s = (data.summary || {}) as Partial<StatementSummary>
      setSummary({
        opening_balance: Number(s.opening_balance ?? 0),
        closing_balance: Number(s.closing_balance ?? 0),
        total_debit: scopedItems.reduce((sum, row) => sum + Number(row.debit || 0), 0),
        total_credit: scopedItems.reduce((sum, row) => sum + Number(row.credit || 0), 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load statements"
      toast({ variant: "destructive", title: "Could not load statements", description: msg })
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
    void loadMembers()
    void loadClients()
  }, [loadBranches, loadMembers, loadClients])

  useEffect(() => {
    void loadReport()
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReset = () => {
    setStatementType("full")
    setAssignedTo("members")
    setMemberId("all")
    setClientId("all")
    setBranchIds([])
    setDateRange({ start: "", end: "" })
    setSummaryDateRange({ start: "", end: "" })
    setResetVersion((v) => v + 1)
  }

  useEffect(() => {
    if (resetVersion === 0) return
    void loadReport()
  }, [resetVersion, loadReport])

  useEffect(() => {
    if (assignedTo === "members") setClientId("all")
    if (assignedTo === "clients") setMemberId("all")
  }, [assignedTo])

  useEffect(() => {
    if (!assigneeModeInitialized.current) {
      assigneeModeInitialized.current = true
      return
    }
    void loadReport()
  }, [assignedTo, loadReport])

  const handleExportExcel = async () => {
    const rows = await exportStatementsExcel({ items, statementType, assignedTo })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in XLSX.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleExportPdf = async () => {
    const rows = await exportStatementsPdf({ items, statementType, assignedTo })
    if (rows > 0) toast({ variant: "success", title: "Export started", description: `${rows} row(s) in PDF.` })
    else toast({ variant: "warning", title: "No data exported", description: "No rows found for export." })
  }

  const handleSummaryPdf = async () => {
    try {
      const summaryQuery = new URLSearchParams()
      summaryQuery.set("pageSize", "5000")
      summaryQuery.set("statement_type", statementType)
      summaryQuery.set("assigned_to", assignedTo)
      if (assignedTo === "members" && memberId !== "all") summaryQuery.set("member_id", memberId)
      if (assignedTo === "clients" && clientId !== "all") summaryQuery.set("client_id", clientId)
      if (summaryDateRange.start.trim()) summaryQuery.set("dateStart", summaryDateRange.start.trim())
      if (summaryDateRange.end.trim()) summaryQuery.set("dateEnd", summaryDateRange.end.trim())
      if (isSuperAdmin && branchIds.length > 0) summaryQuery.set("branches", branchIds.join(","))

      const summaryRes = await fetch(`/api/institution/reports/statements?${summaryQuery.toString()}`, { cache: "no-store" })
      const summaryData = await summaryRes.json().catch(() => ({}))
      if (!summaryRes.ok) throw new Error(summaryData?.error || `Request failed (${summaryRes.status})`)
      const summaryItems = Array.isArray(summaryData.items) ? (summaryData.items as StatementRow[]) : []

      const exportedRows = await exportStatementsSummaryPdf({ items: summaryItems, statementType, assignedTo })
      if (exportedRows <= 0) {
        toast({ variant: "warning", title: "No data exported", description: "No rows found for summary export." })
        return
      }
      toast({ variant: "success", title: "Summary export started", description: `${exportedRows} row(s) summarized in PDF.` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export summary PDF"
      toast({ variant: "destructive", title: "Summary export failed", description: msg })
    }
  }

  const columns = useMemo<DataTableColumn<StatementRow>[]>(
    () => {
      const base: DataTableColumn<StatementRow>[] = [
        { key: "date", header: "Date", render: (r) => String(r.transaction_date || "").slice(0, 10) || "—" },
        { key: "transaction_number", header: "Transaction #", render: (r) => r.transaction_number || "—" },
        { key: "type", header: "Type", render: (r) => r.type || "—" },
        { key: "assigned_to", header: "Assigned to", render: (r) => (assignedTo === "clients" ? r.client_name || "—" : r.member_name || "—") },
      ]
      if (assignedTo !== "clients") {
        base.push({ key: "assigned_no", header: "Assigned No", render: (r) => r.member_number || "—" })
      }
      if (assignedTo !== "clients") {
        base.push({ key: "account", header: "Account", render: (r) => r.account_number || "—" })
      }
      base.push(
        { key: "mode", header: "Mode", render: (r) => r.mode || "—" },
        { key: "debit", header: "Debit", render: (r) => `UGX ${Number(r.debit || 0).toLocaleString()}` },
        { key: "credit", header: "Credit", render: (r) => `UGX ${Number(r.credit || 0).toLocaleString()}` },
        { key: "balance", header: "Balance", render: (r) => `UGX ${Number(r.balance_after || 0).toLocaleString()}` }
      )
      return base
    },
    [assignedTo]
  )

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Statements</h1>
        <p className="text-muted-foreground">Generate detailed member statements with export-ready transaction timelines.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Opening balance</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.opening_balance).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Closing balance</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">UGX {Math.round(summary.closing_balance).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total debit</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-rose-700">UGX {Math.round(summary.total_debit).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total credit</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-green-700">UGX {Math.round(summary.total_credit).toLocaleString()}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters &amp; export</CardTitle>
              <CardDescription>Refine statement scope by assignee, type, dates, and branch before exporting.</CardDescription>
            </div>
            <div className="space-y-2 min-w-[220px]">
              <Label>Assigned to</Label>
              <div className="inline-flex rounded-md border border-input bg-background p-1">
                <button
                  type="button"
                  onClick={() => setAssignedTo("members")}
                  className={`px-3 py-1.5 text-sm rounded ${assignedTo === "members" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => setAssignedTo("clients")}
                  className={`px-3 py-1.5 text-sm rounded ${assignedTo === "clients" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Clients
                </button>
              </div>
            </div>
          </div>
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
              <Label>Statement type</Label>
              <StyledSelect value={statementType} onChange={setStatementType} placeholder="Statement type" options={STATEMENT_TYPES} />
            </div>
            {assignedTo === "members" ? (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Member</Label>
                <StyledSelect value={memberId} onChange={setMemberId} placeholder="All members" options={memberSelectOptions} searchable />
              </div>
            ) : (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Client</Label>
                <StyledSelect value={clientId} onChange={setClientId} placeholder="All clients" options={clientSelectOptions} searchable />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Date range</Label>
              <RangeDatePicker value={dateRange} onChange={setDateRange} placeholder="Filter by transaction date" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TooltipButton tooltip="Apply filters" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}</TooltipButton>
            <TooltipButton tooltip="Reset filters" onClick={handleReset} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RiResetLeftFill className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Refresh" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></TooltipButton>
            <TooltipButton tooltip="Export XLS" onClick={() => void handleExportExcel()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"><RiFileExcel2Line className="h-4 w-4" /></TooltipButton>
            <TooltipButton tooltip="Export PDF" onClick={() => void handleExportPdf()} disabled={loading || items.length === 0} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFileEarmarkPdf className="h-4 w-4" /></TooltipButton>
            <div className="min-w-[260px]">
              <RangeDatePicker
                value={summaryDateRange}
                onChange={setSummaryDateRange}
                placeholder="Summary date range"
              />
            </div>
            <TooltipButton tooltip="Summary PDF" onClick={() => void handleSummaryPdf()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"><BsFiletypePdf className="h-4 w-4" /></TooltipButton>
          </div>
        </CardContent>
      </Card>

      <DataTable
        title="Statement entries"
        columns={columns}
        rows={items}
        loading={loading}
        emptyMessage="No statement entries match the current filters."
      />
    </>
  )
}
