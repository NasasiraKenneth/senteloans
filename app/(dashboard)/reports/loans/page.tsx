"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import StyledSelect from "@/components/newUI/styled_select"
import RangeDatePicker, { type DateRangeValue } from "@/components/newUI/range_date_picker"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, Filter, Loader2, RefreshCw } from "lucide-react"
import { RiFileExcel2Line } from "react-icons/ri"
import { RiResetLeftFill } from "react-icons/ri"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"

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

function escapeCsvCell(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`
  return v
}

function downloadCsv(rows: LoanReportRow[], filename: string) {
  const maxDisbursedByCols = Math.max(0, ...rows.map((r) => Array.isArray(r.disbursed_by) ? r.disbursed_by.length : 0))
  const maxGuarantorCols = Math.max(0, ...rows.map((r) => Array.isArray(r.guarantors) ? r.guarantors.length : 0))
  const headers = [
    "Application ID",
    "Member",
    "Member No",
    "Product",
    "Loan type",
    "Reviewed at",
    "Reviewed by",
    "Approved at",
    "Disbursed at",
    "Approved by",
    "Created by",
    ...Array.from({ length: maxDisbursedByCols }).map((_, idx) => `Disbursed by ${idx + 1}`),
    ...Array.from({ length: maxGuarantorCols }).map((_, idx) => `Guarantor ${idx + 1}`),
    "Principal (UGX)",
    "Outstanding (UGX)",
    "Rate %",
    "Tenure (mo)",
    "Total amount paid (UGX)",
    "Total interest (UGX)",
    "Penalties collected (UGX)",
    "Avg late pay days",
    "Total early payments",
    "Overdue",
    "Status",
    "Applied",
    "Next due",
  ]
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(String(r.application_id || "")),
        escapeCsvCell(String(r.memberName || "")),
        escapeCsvCell(String(r.memberNumber || "")),
        escapeCsvCell(String(r.productName || "")),
        escapeCsvCell(String(r.loan_type || "")),
        escapeCsvCell(String(r.reviewed_at || "").slice(0, 10)),
        escapeCsvCell(String(r.reviewed_by_name || "")),
        escapeCsvCell(String(r.approved_at || "").slice(0, 10)),
        escapeCsvCell(String(r.disbursed_at || "").slice(0, 10)),
        escapeCsvCell(String(r.approved_by_name || "")),
        escapeCsvCell(String(r.created_by_name || "")),
        ...Array.from({ length: maxDisbursedByCols }).map((_, idx) => escapeCsvCell(String(r.disbursed_by?.[idx] || ""))),
        ...Array.from({ length: maxGuarantorCols }).map((_, idx) => escapeCsvCell(String(r.guarantors?.[idx] || ""))),
        String(Number(r.principal_amount || 0)),
        String(Number(r.outstanding_balance || 0)),
        String(Number(r.interest_rate || 0)),
        String(Number(r.tenure_months || 0)),
        String(Number(r.total_amount_paid || 0)),
        String(Number(r.total_interest || 0)),
        String(Number(r.penalties_collected || 0)),
        String(Number(r.late_pay_days_avg || 0)),
        String(Number(r.early_payments || 0)),
        escapeCsvCell(r.overdue ? "Yes" : "No"),
        escapeCsvCell(String(r.status || "")),
        escapeCsvCell(String(r.application_date || "").slice(0, 10)),
        escapeCsvCell(String(r.next_payment_date || "").slice(0, 10)),
      ].join(",")
    ),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Defaulted") return "destructive"
  if (status === "Rejected") return "destructive"
  if (status === "Closed") return "secondary"
  if (ACTIVE_LIKE.has(status)) return "default"
  if (status === "Approved") return "outline"
  return "secondary"
}

export default function LoanReportsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<LoanReportRow[]>([])
  const [totalFromApi, setTotalFromApi] = useState(0)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ProductOption[]>([])
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
  const [productId, setProductId] = useState<string>("all")
  const [branchId, setBranchId] = useState<string>("all")
  const [applicationRange, setApplicationRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [reviewedRange, setReviewedRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [approvedRange, setApprovedRange] = useState<DateRangeValue>({ start: "", end: "" })
  const [disbursedRange, setDisbursedRange] = useState<DateRangeValue>({ start: "", end: "" })

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

  const productSelectOptions = useMemo(
    () => [{ value: "all", label: "All products" }, ...products.map((p) => ({ value: p.id, label: p.product_name }))],
    [products]
  )
  const branchSelectOptions = useMemo(
    () => [
      { value: "all", label: "All branches" },
      ...branches.map((b) => ({
        value: b.id,
        label: b.branch_code ? `${b.name} (${b.branch_code})` : b.name,
      })),
    ],
    [branches]
  )

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/loan-products?status=Active&limit=200", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      const raw = Array.isArray(data.items) ? data.items : []
      setProducts(
        raw.map((p: { id?: string; product_name?: string }) => ({
          id: String(p.id || ""),
          product_name: String(p.product_name || "Product"),
        })).filter((p: ProductOption) => p.id)
      )
    } catch {
      setProducts([])
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
    if (productId !== "all") p.set("product_id", productId)
    if (isSuperAdmin && branchId !== "all") p.set("branches", branchId)
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
    productId,
    isSuperAdmin,
    branchId,
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
      const res = await fetch(`/api/institution/reports/loans?${base.toString()}`, { cache: "no-store" })
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
    loadProducts()
  }, [loadProducts])

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

  const handleExportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(items, `loan-portfolio-report-${stamp}.csv`)
    toast({ variant: "success", title: "Export started", description: `${items.length} row(s) in CSV.` })
  }

  const handleApplyFilters = () => {
    loadLoans()
  }

  const handleReset = () => {
    setStatusFilter("all")
    setLoanTypeFilter("all")
    setProductId("all")
    setBranchId("all")
    setApplicationRange({ start: "", end: "" })
    setReviewedRange({ start: "", end: "" })
    setApprovedRange({ start: "", end: "" })
    setDisbursedRange({ start: "", end: "" })
    setResetVersion((v) => v + 1)
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Loan reports</h1>
        <p className="text-muted-foreground">
          Branch-scoped portfolio view (same data as Loans). Filters call the loans API; export uses the rows shown.
        </p>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading loan report…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Loans (loaded)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{items.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Total matching filters: {totalFromApi}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Principal (booked)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.principal_booked).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.outstanding).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total amount paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums text-green-700">UGX {Math.round(summary.total_amount_paid).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Across filtered loans</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total interest</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">UGX {Math.round(summary.total_interest).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Scheduled interest total</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Penalties / overdue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <span className="font-semibold">UGX {Math.round(summary.total_penalties_collected).toLocaleString()}</span>{" "}
                  <span className="text-muted-foreground">penalties collected</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="font-semibold text-amber-700">{summary.overdue}</span>{" "}
                  <span className="text-muted-foreground">overdue loans</span>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Avg late pay days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.avg_late_pay_days.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total early payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{summary.total_early_payments.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Pipeline / defaulted</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <span className="font-semibold">{summary.pipeline}</span>{" "}
                  <span className="text-muted-foreground">applied…reviewed</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="font-semibold text-red-700">{summary.defaulted}</span>{" "}
                  <span className="text-muted-foreground">defaulted</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters &amp; export
              </CardTitle>
              <CardDescription>Query parameters match the main loans list API (branch rules apply).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-row flex-wrap items-end gap-2">
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
                  <Label>Product</Label>
                  <StyledSelect
                    value={productId}
                    onChange={setProductId}
                    placeholder="All products"
                    options={productSelectOptions}
                    searchable
                  />
                </div>
                {isSuperAdmin && (
                  <div className="space-y-2 w-auto min-w-[300px]">
                    <Label>Branch</Label>
                    <StyledSelect
                      value={branchId}
                      onChange={setBranchId}
                      placeholder="All branches"
                      options={branchSelectOptions}
                      searchable
                    />
                  </div>
                )}
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
                <Button type="button" onClick={handleApplyFilters} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Apply filters
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleReset}
                  disabled={loading}
                  aria-label="Reset filters"
                  title="Reset filters"
                >
                  <RiResetLeftFill className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => loadLoans()}
                  disabled={loading}
                  aria-label="Refresh"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleExportCsv}
                  disabled={loading || items.length === 0}
                  className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 transition-colors"
                  aria-label="Export CSV"
                  title="Export CSV"
                >
                  <RiFileExcel2Line className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors"
                  aria-label="Export PDF"
                  title="Export PDF"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loan portfolio detail</CardTitle>
              <CardDescription>Click application ID to open the loan.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed at</TableHead>
                    <TableHead>Reviewed by</TableHead>
                    <TableHead>Approved at</TableHead>
                    <TableHead>Disbursed at</TableHead>
                    <TableHead>Approved by</TableHead>
                    <TableHead>Created by</TableHead>
                    {Array.from({ length: maxDisbursedByCols }).map((_, idx) => (
                      <TableHead key={`disb-by-head-${idx}`}>{`Disbursed by ${idx + 1}`}</TableHead>
                    ))}
                    {Array.from({ length: maxGuarantorCols }).map((_, idx) => (
                      <TableHead key={`guar-head-${idx}`}>{`Guarantor ${idx + 1}`}</TableHead>
                    ))}
                    <TableHead className="text-right">Amount paid</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Penalties</TableHead>
                    <TableHead className="text-right">Avg late days</TableHead>
                    <TableHead className="text-right">Early pays</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Next due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={24 + maxDisbursedByCols + maxGuarantorCols} className="text-center text-muted-foreground py-10">
                        No loans match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">
                          <Link href={`/loans/${loan.id}`} className="text-primary hover:underline">
                            {loan.application_id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{loan.memberName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{loan.memberNumber || ""}</div>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={loan.productName}>
                          {loan.productName || "—"}
                        </TableCell>
                        <TableCell className="capitalize">{loan.loan_type || "normal"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          UGX {Number(loan.principal_amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          UGX {Number(loan.outstanding_balance || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(loan.interest_rate || 0)}%</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(String(loan.status))}>{loan.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {loan.reviewed_at ? String(loan.reviewed_at).slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{loan.reviewed_by_name || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {loan.approved_at ? String(loan.approved_at).slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {loan.disbursed_at ? String(loan.disbursed_at).slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{loan.approved_by_name || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{loan.created_by_name || "—"}</TableCell>
                        {Array.from({ length: maxDisbursedByCols }).map((_, idx) => (
                          <TableCell key={`${loan.id}-disb-${idx}`} className="text-sm whitespace-nowrap">
                            {loan.disbursed_by?.[idx] || "—"}
                          </TableCell>
                        ))}
                        {Array.from({ length: maxGuarantorCols }).map((_, idx) => (
                          <TableCell key={`${loan.id}-guar-${idx}`} className="text-sm whitespace-nowrap">
                            {loan.guarantors?.[idx] || "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">UGX {Number(loan.total_amount_paid || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">UGX {Number(loan.total_interest || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">UGX {Number(loan.penalties_collected || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(loan.late_pay_days_avg || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(loan.early_payments || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          {loan.overdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="secondary">No</Badge>}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {loan.application_date ? String(loan.application_date).slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {loan.next_payment_date ? String(loan.next_payment_date).slice(0, 10) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
