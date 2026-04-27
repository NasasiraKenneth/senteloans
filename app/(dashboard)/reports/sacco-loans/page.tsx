"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import StyledMultiSelect from "@/components/newUI/styled_multi_select"
import RangeDatePicker, { type DateRangeValue } from "@/components/newUI/range_date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"
import { Badge } from "@/components/ui/badge"
import { Filter, Loader2, RefreshCw } from "lucide-react"
import { BsFileEarmarkPdf } from "react-icons/bs"
import { BsFiletypePdf } from "react-icons/bs"
import { RiFileExcel2Line } from "react-icons/ri"
import { RiResetLeftFill } from "react-icons/ri"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { exportSaccoLoanReportsExcel } from "./components/excel-export"
import { exportSaccoLoanReportsPdf } from "./components/pdf-export"
import { exportSaccoLoanSummaryPdf } from "./components/summaryPdf"

const PAGE_SIZE = 100

const LOAN_STATUSES = [
  "Applied",
  "Under Review",
  "Reviewed",
  "Approved",
  "Partially Disbursed",
  "Fully Disbursed",
  "Active",
  "Closed",
  "Defaulted",
  "Rejected",
] as const

const ACTIVE_LIKE = new Set(["Partially Disbursed", "Fully Disbursed", "Active"])

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseYmd(s: string | null | undefined): number | null {
  const t = String(s || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const n = new Date(`${t}T12:00:00`).getTime()
  return Number.isFinite(n) ? n : null
}

export interface LoanReportRow {
  id: string
  application_id: string
  memberName: string
  memberNumber: string
  productName: string
  principal_amount: number
  interest_rate: number
  tenure_months: number
  outstanding_balance: number
  status: string
  loan_type: string
  application_date?: string | null
  reviewed_at?: string | null
  approved_at?: string | null
  disbursed_at?: string | null
  reviewed_by_name?: string | null
  next_payment_date?: string | null
  disbursement_date?: string | null
  approved_by_name?: string | null
  created_by_name?: string | null
  disbursed_by?: string[]
  guarantors?: string[]
  total_amount_paid?: number
  total_interest?: number
  penalties_collected?: number
  late_pay_days_avg?: number
  early_payments?: number
  overdue?: boolean
}

type ProductOption = { id: string; product_name: string }
type ClientOption = { id: string; label: string }
type BranchOption = { id: string; name: string; branch_code?: string }
type LoanReportSummary = {
  principal_booked: number
  outstanding: number
  total_amount_paid: number
  total_interest: number
  total_penalties_collected: number
  total_early_payments: number
  avg_late_pay_days: number
  with_balance: number
  overdue: number
  defaulted: number
  pipeline: number
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Defaulted") return "destructive"
  if (status === "Rejected") return "destructive"
  if (status === "Closed") return "secondary"
  if (ACTIVE_LIKE.has(status)) return "default"
  if (status === "Approved") return "outline"
  return "secondary"
}

function statusPillClass(status: string): string {
  switch (status) {
    case "Applied":
      return "bg-amber-100 text-amber-700 border border-amber-200"
    case "Under Review":
      return "bg-violet-70 text-violet-400 border border-violet-130"
    case "Reviewed":
      return "bg-violet-100 text-violet-700 border border-violet-200"
    case "Approved":
      return "bg-green-100 text-green-700 border border-green-200"
    case "Partially Disbursed":
      return "bg-blue-70 text-blue-400 border border-blue-130"
    case "Fully Disbursed":
      return "bg-blue-100 text-blue-700 border border-blue-200"
    case "Active":
      return "bg-cyan-100 text-cyan-700 border border-cyan-200"
    case "Rejected":
      return "bg-rose-100 text-rose-700 border border-rose-200"
    case "Defaulted":
      return "bg-red-100 text-red-700 border border-red-200"
    case "Closed":
      return "bg-slate-100 text-slate-700 border border-slate-200"
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200"
  }
}

export default function SaccoLoanReportsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<LoanReportRow[]>([])
  const [totalFromApi, setTotalFromApi] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [resetVersion, setResetVersion] = useState(0)
  const [summary, setSummary] = useState<LoanReportSummary>({
    principal_booked: 0,
    outstanding: 0,
    total_amount_paid: 0,
    total_interest: 0,
    total_penalties_collected: 0,
    total_early_payments: 0,
    avg_late_pay_days: 0,
    with_balance: 0,
    overdue: 0,
    defaulted: 0,
    pipeline: 0,
  })

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [loanTypeFilter, setLoanTypeFilter] = useState<string>("all")
  const [clientIds, setClientIds] = useState<string[]>([])
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [applicationRange, setApplicationRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [reviewedRange, setReviewedRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [approvedRange, setApprovedRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [disbursedRange, setDisbursedRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [summaryCreatedRange, setSummaryCreatedRange] = useState<DateRangeValue>({ start: "", end: "" })

  const statusSelectOptions = useMemo(
    () => [{ value: "all", label: "All statuses" }, ...LOAN_STATUSES.map((s) => ({ value: s, label: s }))],
    []
  )

  const loanTypeSelectOptions = useMemo(
    () => [
      { value: "all", label: "All types" },
      { value: "normal", label: "Normal" },
      { value: "top up", label: "Top up" },
      { value: "buy off", label: "Buy off" },
    ],
    []
  )

  const clientSelectOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.label })), [clients])
  const branchMultiOptions = useMemo(
    () =>
      branches.map((b) => ({
        value: b.id,
        label: b.branch_code ? `${b.name} (${b.branch_code})` : b.name,
      })),
    [branches]
  )

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
          .filter((c: ClientOption) => Boolean(c.id)),
      )
    } catch {
      setClients([])
    }
  }, [])

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/branches", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBranches([])
        return
      }
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

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set("pageSize", String(PAGE_SIZE))
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (loanTypeFilter !== "all") p.set("loan_type", loanTypeFilter)
    if (clientIds.length > 0) p.set("client_ids", clientIds.join(","))
    if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
    if (applicationRange.start.trim()) p.set("applicationDateStart", applicationRange.start.trim())
    if (applicationRange.end.trim()) p.set("applicationDateEnd", applicationRange.end.trim())
    if (reviewedRange.start.trim()) p.set("reviewedDateStart", reviewedRange.start.trim())
    if (reviewedRange.end.trim()) p.set("reviewedDateEnd", reviewedRange.end.trim())
    if (approvedRange.start.trim()) p.set("approvedDateStart", approvedRange.start.trim())
    if (approvedRange.end.trim()) p.set("approvedDateEnd", approvedRange.end.trim())
    if (disbursedRange.start.trim()) p.set("disbursedDateStart", disbursedRange.start.trim())
    if (disbursedRange.end.trim()) p.set("disbursedDateEnd", disbursedRange.end.trim())
    return p
  }, [
    statusFilter,
    loanTypeFilter,
    clientIds,
    isSuperAdmin,
    branchIds,
    applicationRange.start,
    applicationRange.end,
    reviewedRange.start,
    reviewedRange.end,
    approvedRange.start,
    approvedRange.end,
    disbursedRange.start,
    disbursedRange.end,
  ])

  const loadLoans = useCallback(async () => {
    setLoading(true)
    try {
      const base = buildQuery()
      const res = await fetch(`/api/institution/reports/sacco-loans?${base.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403 && data?.error === "missing_permission:view_loans") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to view loans.",
        })
        setItems([])
        setTotalFromApi(0)
        return
      }
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
      setItems(Array.isArray(data.items) ? (data.items as LoanReportRow[]) : [])
      setTotalFromApi(Number(data.total ?? 0))
      const s = (data.summary || {}) as Partial<LoanReportSummary>
      setSummary({
        principal_booked: Number(s.principal_booked ?? 0),
        outstanding: Number(s.outstanding ?? 0),
        total_amount_paid: Number(s.total_amount_paid ?? 0),
        total_interest: Number(s.total_interest ?? 0),
        total_penalties_collected: Number(s.total_penalties_collected ?? 0),
        total_early_payments: Number(s.total_early_payments ?? 0),
        avg_late_pay_days: Number(s.avg_late_pay_days ?? 0),
        with_balance: Number(s.with_balance ?? 0),
        overdue: Number(s.overdue ?? 0),
        defaulted: Number(s.defaulted ?? 0),
        pipeline: Number(s.pipeline ?? 0),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load loans"
      toast({ variant: "destructive", title: "Could not load report", description: msg })
      setItems([])
      setTotalFromApi(0)
      setSummary({
        principal_booked: 0,
        outstanding: 0,
        total_amount_paid: 0,
        total_interest: 0,
        total_penalties_collected: 0,
        total_early_payments: 0,
        avg_late_pay_days: 0,
        with_balance: 0,
        overdue: 0,
        defaulted: 0,
        pipeline: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [buildQuery, toast])

  useEffect(() => {
    const s = getSession()
    const role = String(s?.role || "").trim().toLowerCase()
    const superAdmin = role === "super_admin"
    setIsSuperAdmin(superAdmin)
    if (superAdmin) {
      void loadBranches()
    }
  }, [loadBranches])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  useEffect(() => {
    void loadLoans()
    // Intentionally once on mount; filter changes apply via "Apply filters" or "Refresh".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resetVersion > 0) {
      void loadLoans()
    }
  }, [resetVersion, loadLoans])

  const maxDisbursedByCols = useMemo(
    () => Math.max(0, ...items.map((r) => (Array.isArray(r.disbursed_by) ? r.disbursed_by.length : 0))),
    [items]
  )
  const maxGuarantorCols = useMemo(
    () => Math.max(0, ...items.map((r) => (Array.isArray(r.guarantors) ? r.guarantors.length : 0))),
    [items]
  )
  const loanColumns = useMemo<DataTableColumn<LoanReportRow>[]>(() => {
    const base: DataTableColumn<LoanReportRow>[] = [
      {
        key: "application",
        header: "Application",
        render: (loan) => (
          <Link href={`/sacco-loans/${loan.id}`} className="text-primary hover:underline">
            {loan.application_id}
          </Link>
        ),
      },
      {
        key: "member",
        header: "Member",
        render: (loan) => (
          <div>
            <div className="font-medium">{loan.memberName || "—"}</div>
            <div className="text-xs text-muted-foreground">{loan.memberNumber || ""}</div>
          </div>
        ),
      },
      { key: "product", header: "Product", render: (loan) => loan.productName || "—" },
      { key: "type", header: "Type", render: (loan) => loan.loan_type || "normal" },
      { key: "principal", header: "Principal", render: (loan) => `UGX ${Number(loan.principal_amount || 0).toLocaleString()}` },
      { key: "outstanding", header: "Outstanding", render: (loan) => `UGX ${Number(loan.outstanding_balance || 0).toLocaleString()}` },
      { key: "rate", header: "Interest rate %", render: (loan) => `${Number(loan.interest_rate || 0)}%` },
      {
        key: "status",
        header: "Status",
        render: (loan) => (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPillClass(String(loan.status))}`}>
            {loan.status}
          </span>
        ),
      },
      { key: "reviewedAt", header: "Reviewed at", render: (loan) => (loan.reviewed_at ? String(loan.reviewed_at).slice(0, 10) : "—") },
      { key: "reviewedBy", header: "Reviewed by", render: (loan) => loan.reviewed_by_name || "—" },
      { key: "approvedAt", header: "Approved at", render: (loan) => (loan.approved_at ? String(loan.approved_at).slice(0, 10) : "—") },
      { key: "disbursedAt", header: "Disbursed at", render: (loan) => (loan.disbursed_at ? String(loan.disbursed_at).slice(0, 10) : "—") },
      { key: "approvedBy", header: "Approved by", render: (loan) => loan.approved_by_name || "—" },
      { key: "createdBy", header: "Created by", render: (loan) => loan.created_by_name || "—" },
    ]

    const disbursedByColumns = Array.from({ length: maxDisbursedByCols }).map((_, idx) => ({
      key: `disbursedBy${idx + 1}`,
      header: `Disbursed by ${idx + 1}`,
      render: (loan: LoanReportRow) => loan.disbursed_by?.[idx] || "—",
    }))
    const guarantorColumns = Array.from({ length: maxGuarantorCols }).map((_, idx) => ({
      key: `guarantor${idx + 1}`,
      header: `Guarantor ${idx + 1}`,
      render: (loan: LoanReportRow) => loan.guarantors?.[idx] || "—",
    }))

    const metrics: DataTableColumn<LoanReportRow>[] = [
      { key: "amountPaid", header: "Amount paid", render: (loan) => `UGX ${Number(loan.total_amount_paid || 0).toLocaleString()}` },
      { key: "interest", header: "Interest", render: (loan) => `UGX ${Number(loan.total_interest || 0).toLocaleString()}` },
      { key: "penalties", header: "Penalties", render: (loan) => `UGX ${Number(loan.penalties_collected || 0).toLocaleString()}` },
      { key: "avgLateDays", header: "Avg late days", render: (loan) => Number(loan.late_pay_days_avg || 0).toLocaleString() },
      { key: "earlyPays", header: "Early pays", render: (loan) => Number(loan.early_payments || 0).toLocaleString() },
      {
        key: "overdue",
        header: "Overdue",
        render: (loan) => (loan.overdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="secondary">No</Badge>),
      },
      { key: "applied", header: "Applied", render: (loan) => (loan.application_date ? String(loan.application_date).slice(0, 10) : "—") },
      { key: "nextDue", header: "Next due", render: (loan) => (loan.next_payment_date ? String(loan.next_payment_date).slice(0, 10) : "—") },
    ]

    return [...base, ...disbursedByColumns, ...guarantorColumns, ...metrics]
  }, [maxDisbursedByCols, maxGuarantorCols])

  const handleExportExcel = async () => {
    try {
      const exportedRows = await exportSaccoLoanReportsExcel({
        items,
        isSuperAdmin,
        branchIds,
        branches,
        statusFilter,
        loanTypeFilter,
        productId: "all",
        products: [],
        applicationRange,
        reviewedRange,
        approvedRange,
        disbursedRange,
        buildQuery,
        apiPath: "/api/institution/reports/sacco-loans",
      })
      if (exportedRows <= 0) {
        toast({ variant: "warning", title: "No data exported", description: "No rows found for selected branches." })
        return
      }
      toast({ variant: "success", title: "Export started", description: `${exportedRows} row(s) in XLSX.` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export XLSX"
      toast({ variant: "destructive", title: "Export failed", description: msg })
    }
  }

  const handleExportPdf = async () => {
    try {
      const exportedRows = await exportSaccoLoanReportsPdf({
        items,
        isSuperAdmin,
        branchIds,
        branches,
        statusFilter,
        loanTypeFilter,
        productId: "all",
        products: [],
        applicationRange,
        reviewedRange,
        approvedRange,
        disbursedRange,
        buildQuery,
        apiPath: "/api/institution/reports/sacco-loans",
      })
      if (exportedRows <= 0) {
        toast({ variant: "warning", title: "No data exported", description: "No rows found for selected branches." })
        return
      }
      toast({ variant: "success", title: "Export started", description: `${exportedRows} row(s) in PDF.` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export PDF"
      toast({ variant: "destructive", title: "Export failed", description: msg })
    }
  }

  const handleSummaryPdf = async () => {
    try {
      const summaryQuery = new URLSearchParams()
      summaryQuery.set("pageSize", "5000")
      if (summaryCreatedRange.start.trim()) summaryQuery.set("applicationDateStart", summaryCreatedRange.start.trim())
      if (summaryCreatedRange.end.trim()) summaryQuery.set("applicationDateEnd", summaryCreatedRange.end.trim())
      if (isSuperAdmin && branchIds.length > 0) summaryQuery.set("branches", branchIds.join(","))

      const summaryRes = await fetch(`/api/institution/reports/sacco-loans?${summaryQuery.toString()}`, { cache: "no-store" })
      const summaryData = await summaryRes.json().catch(() => ({}))
      if (!summaryRes.ok) {
        throw new Error(summaryData?.error || `Request failed (${summaryRes.status})`)
      }
      const summaryItems = Array.isArray(summaryData.items) ? (summaryData.items as LoanReportRow[]) : []

      const exportedRows = await exportSaccoLoanSummaryPdf({
        items: summaryItems,
        isSuperAdmin,
        branchIds,
        branches,
        apiPath: "/api/institution/reports/sacco-loans",
        buildQuery: () => {
          const p = new URLSearchParams()
          p.set("pageSize", "5000")
          if (summaryCreatedRange.start.trim()) p.set("applicationDateStart", summaryCreatedRange.start.trim())
          if (summaryCreatedRange.end.trim()) p.set("applicationDateEnd", summaryCreatedRange.end.trim())
          if (isSuperAdmin && branchIds.length > 0) p.set("branches", branchIds.join(","))
          return p
        },
      })
      if (exportedRows <= 0) {
        toast({ variant: "warning", title: "No data exported", description: "No rows found for selected branches." })
        return
      }
      toast({ variant: "success", title: "Summary export started", description: `${exportedRows} row(s) summarized in PDF.` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export summary PDF"
      toast({ variant: "destructive", title: "Summary export failed", description: msg })
    }
  }

  const handleApplyFilters = () => {
    loadLoans()
  }

  const handleReset = () => {
    setStatusFilter("all")
    setLoanTypeFilter("all")
    setClientIds([])
    setBranchIds([])
    setApplicationRange({ start: "", end: "" })
    setReviewedRange({ start: "", end: "" })
    setApprovedRange({ start: "", end: "" })
    setDisbursedRange({ start: "", end: "" })
    setResetVersion((v) => v + 1)
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Sacco loan reports</h1>
        <p className="text-muted-foreground">
          Analyze SACCO loan performance across branches, products, statuses, and timelines, then export detailed or executive reports.
        </p>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading sacco loan report…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total loans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalFromApi}</div>
                <p className="text-xs text-muted-foreground mt-1">Total matching filters: {totalFromApi}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total disbursed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.principal_booked).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total outstanding balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.outstanding).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total interest</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.total_interest).toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters &amp; export
              </CardTitle>
              <CardDescription>Use filters to refine results, then export the current report view in your preferred format.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-row flex-wrap items-end gap-2">
                {isSuperAdmin && (
                  <div className="space-y-2 w-auto min-w-[300px]">
                    <Label>Branch</Label>
                    <StyledMultiSelect
                      value={branchIds}
                      onChange={setBranchIds}
                      placeholder="All branches"
                      options={branchMultiOptions}
                      searchable
                    />
                  </div>
                )}
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Status</Label>
                  <StyledSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    placeholder="All statuses"
                    options={statusSelectOptions}
                    searchable
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Loan type</Label>
                  <StyledSelect
                    value={loanTypeFilter}
                    onChange={setLoanTypeFilter}
                    placeholder="All types"
                    options={loanTypeSelectOptions}
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Clients</Label>
                  <StyledMultiSelect
                    value={clientIds}
                    onChange={setClientIds}
                    placeholder="All clients"
                    options={clientSelectOptions}
                    searchable
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Application date range</Label>
                  <RangeDatePicker
                    value={applicationRange}
                    onChange={setApplicationRange}
                    placeholder="Filter by application date"
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Reviewed date range</Label>
                  <RangeDatePicker
                    value={reviewedRange}
                    onChange={setReviewedRange}
                    placeholder="Filter by reviewed date"
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Approved date range</Label>
                  <RangeDatePicker
                    value={approvedRange}
                    onChange={setApprovedRange}
                    placeholder="Filter by approved date"
                  />
                </div>
                <div className="space-y-2 w-auto min-w-[300px]">
                  <Label>Disbursed date range</Label>
                  <RangeDatePicker
                    value={disbursedRange}
                    onChange={setDisbursedRange}
                    placeholder="Filter by disbursed date"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <TooltipButton
                  tooltip="Apply filters"
                  onClick={handleApplyFilters}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                </TooltipButton>
                <TooltipButton
                  tooltip="Reset filters"
                  onClick={handleReset}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <RiResetLeftFill className="h-4 w-4" />
                </TooltipButton>
                <TooltipButton
                  tooltip="Refresh"
                  onClick={() => loadLoans()}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </TooltipButton>
                <TooltipButton
                  tooltip="Export XLS"
                  onClick={() => void handleExportExcel()}
                  disabled={loading || items.length === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
                >
                  <RiFileExcel2Line className="h-4 w-4" />
                </TooltipButton>
                <TooltipButton
                  tooltip="Export PDF"
                  onClick={() => void handleExportPdf()}
                  disabled={loading || items.length === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <BsFileEarmarkPdf className="h-4 w-4" />
                </TooltipButton>
                <div className="min-w-[260px]">
                  <RangeDatePicker
                    value={summaryCreatedRange}
                    onChange={setSummaryCreatedRange}
                    placeholder="Summary created-at range"
                  />
                </div>
                <TooltipButton
                  tooltip="Summary PDF"
                  onClick={() => void handleSummaryPdf()}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <BsFiletypePdf className="h-4 w-4" />
                </TooltipButton>
              </div>
            </CardContent>
          </Card>

          <DataTable
            title="Sacco loan portfolio detail"
            columns={loanColumns}
            rows={items}
            loading={loading}
            emptyMessage="No loans match the current filters."
          />
        </>
      )}
    </>
  )
}
