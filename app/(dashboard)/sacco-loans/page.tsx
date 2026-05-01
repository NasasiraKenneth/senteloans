"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { Filter } from "@/types"
import { CreditCard, AlertTriangle, Calendar, Clock, Plus, Eye } from "lucide-react"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/invoices/utils"
import { getSession } from "@/lib/session"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { downloadSaccoLoansExport } from "./export/export"
import AddSaccoLoan from "./components/add/add"

type SaccoLoanRow = {
  id: string
  client_id: string
  client_name: string
  loan_product: string | null
  principal_amount: number
  interest_rate: number
  tenure_months: number
  monthly_payment: number | null
  total_amount: number | null
  outstanding_balance: number
  status: string
  loan_type: string
  purpose: string | null
  application_date: string | null
  maturity_date: string | null
  next_payment_date: string | null
  overdue_days: number
  disbursement_date: string | null
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))

const formatDate = (value: string | null) => {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-UG")
}

const statusClass = (status: string) => {
  switch (String(status || "").trim()) {
    case "Approved":
    case "Active":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200"
    case "Fully Disbursed":
    case "Partially Disbursed":
      return "bg-blue-100 text-blue-700 border border-blue-200"
    case "Rejected":
    case "Defaulted":
      return "bg-rose-100 text-rose-700 border border-rose-200"
    case "Closed":
      return "bg-slate-100 text-slate-700 border border-slate-200"
    case "Under Review":
    case "Reviewed":
      return "bg-violet-100 text-violet-700 border border-violet-200"
    default:
      return "bg-amber-100 text-amber-700 border border-amber-200"
  }
}

const loanTypeLabel = (v: string) => {
  const t = String(v || "normal").trim().toLowerCase()
  if (t === "normal") return "Normal"
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function SaccoLoansPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<SaccoLoanRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  const loadLoans = useCallback(
    async (queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) => {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (queryParams) {
          Object.entries(queryParams as Record<string, unknown>).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
          })
        }
        const requestPage = typeof pageOverride === "number" ? pageOverride : page
        const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage
        params.set("page", String(requestPage + 1))
        params.set("pageSize", String(requestRows))
        const res = await fetch(`/api/institution/sacco-loans?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load Sacco loans")

        const items = Array.isArray(body?.items) ? body.items : []
        setRows(
          items.map((item: Record<string, unknown>) => ({
            id: String(item.id || ""),
            client_id: String(item.client_id || ""),
            client_name: String(item.client_name || ""),
            loan_product: item.loan_product != null ? String(item.loan_product) : null,
            principal_amount: Number(item.principal_amount || 0),
            interest_rate: Number(item.interest_rate || 0),
            tenure_months: Number(item.tenure_months || 0),
            monthly_payment: item.monthly_payment != null ? Number(item.monthly_payment) : null,
            total_amount: item.total_amount != null ? Number(item.total_amount) : null,
            outstanding_balance: Number(item.outstanding_balance || 0),
            status: String(item.status || ""),
            loan_type: String(item.loan_type || "normal"),
            purpose: item.purpose != null ? String(item.purpose) : null,
            application_date: item.application_date != null ? String(item.application_date) : null,
            maturity_date: item.maturity_date != null ? String(item.maturity_date) : null,
            next_payment_date: item.next_payment_date != null ? String(item.next_payment_date) : null,
            overdue_days: Number(item.overdue_days ?? 0),
            disbursement_date: item.disbursement_date != null ? String(item.disbursement_date) : null,
          })),
        )
        setTotalRows(Number(body?.total ?? items.length ?? 0))
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load Sacco loans"
        setError(message)
        setRows([])
        setTotalRows(0)
        toast({ variant: "destructive", title: "Failed to load loans", description: message })
      } finally {
        setLoading(false)
      }
    },
    [toast, page, rowsPerPage],
  )

  useEffect(() => {
    void loadLoans()
  }, [loadLoans])

  useEffect(() => {
    const session = getSession()
    const role = String(session?.role || "").trim().toLowerCase()
    const superAdmin = role === "super_admin"
    setIsSuperAdmin(superAdmin)
    if (!superAdmin) {
      setBranchOptions([])
      return
    }
    void (async () => {
      try {
        const res = await fetch("/api/institution/branches", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setBranchOptions([])
          return
        }
        const raw = Array.isArray(body?.branches) ? body.branches : []
        setBranchOptions(
          raw
            .map((b: Record<string, unknown>) => ({
              value: String(b.id || ""),
              label: String(b.name || ""),
            }))
            .filter((b: { value: string; label: string }) => Boolean(b.value)),
        )
      } catch {
        setBranchOptions([])
      }
    })()
  }, [])

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0)
      const normalized: Record<string, string> = {}
      Object.entries((params || {}) as Record<string, unknown>).forEach(([k, v]) => {
        if (v && typeof v === "object" && "start" in (v as Record<string, unknown>) && "end" in (v as Record<string, unknown>)) {
          const range = v as { start?: string; end?: string }
          if (range.start) normalized[`${k}Start`] = range.start
          if (range.end) normalized[`${k}End`] = range.end
          return
        }
        if (v !== undefined && v !== null && String(v).trim() !== "") normalized[k] = String(v)
      })
      setActiveFilters(normalized)
      setActiveQueryParams(normalized)
      void loadLoans(normalized, 0, rowsPerPage)
    },
    [loadLoans, rowsPerPage],
  )

  const downloadExport = async (format: "excel" | "pdf") => {
    setExporting(format)
    try {
      await downloadSaccoLoansExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded sacco loans ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_permission:view_sacco_loans") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export sacco loans.",
        })
      } else {
        toast({
          variant: "destructive",
          title: `Download ${format.toUpperCase()} failed`,
          description: message || `Failed to download ${format.toUpperCase()}.`,
        })
      }
    } finally {
      setExporting(null)
    }
  }

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage)
      void loadLoans(activeQueryParams, newPage, rowsPerPage)
    },
    [activeQueryParams, loadLoans, rowsPerPage],
  )

  const handleRowsPerPageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10)
      setRowsPerPage(next)
      setPage(0)
      void loadLoans(activeQueryParams, 0, next)
    },
    [activeQueryParams, loadLoans],
  )

  const filterFields = useMemo<FilterField[]>(
    () => {
      const fields: FilterField[] = [
        {
          field: "q",
          label: "Search client name, loan product, or purpose",
          type: "text",
        },
        {
          field: "loan_type",
          label: "Loan Type",
          options: [
            { value: "normal", label: "Normal" },
            { value: "top_up", label: "Top Up" },
            { value: "buy_off", label: "Buy Off" },
            { value: "sell_off", label: "Sell Off" },
          ],
          multiple: false,
          type: "select",
        },
        {
          field: "remainingTenure",
          label: "Remaining Tenure",
          options: [
            { value: "eq1", label: "1 month" },
            { value: "lte3", label: "<= 3 months" },
            { value: "lte6", label: "<= 6 months" },
            { value: "lte12", label: "<= 12 months" },
            { value: "gt12", label: "> 12 months" },
          ],
          multiple: false,
          type: "select",
        },
        {
          field: "applicationDate",
          label: "Search By Application Date Range",
          type: "date-range",
        },
        {
          field: "nextPaymentDate",
          label: "Search By Next Payment Date Range",
          type: "date-range",
        },
      ]
      return withBranchFilterFirst(fields, {
        isSuperAdmin,
        branchOptions,
      })
    },
    [isSuperAdmin, branchOptions],
  )

  const tabularFilters: Filter[] = useMemo(
    () => [
      { label: "All", value: "" },
      { value: "Applied", label: "Applied" },
      { value: "Under Review", label: "Under Review" },
      { value: "Reviewed", label: "Reviewed" },
      { value: "Approved", label: "Approved" },
      { value: "Partially Disbursed", label: "Partial Disburse" },
      { value: "Fully Disbursed", label: "Fully Disbursed" },
      { value: "Active", label: "Active" },
      { value: "Rejected", label: "Rejected" },
      { value: "Closed", label: "Closed" },
      { value: "Defaulted", label: "Defaulted" },
    ],
    [],
  )

  const handleViewLoan = useCallback(
    (row: SaccoLoanRow) => {
      router.push(`/sacco-loans/${row.id}`)
    },
    [router],
  )

  const tableActions = useMemo(
    () => [
      {
        label: "View",
        onClick: handleViewLoan,
        variant: "view" as const,
        icon: <Eye className="h-4 w-4" />,
      },
    ],
    [handleViewLoan],
  )

  const columns: DataTableColumn<SaccoLoanRow>[] = useMemo(
    () => [
      {
        key: "client_name",
        header: "Client",
        render: (row) => (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7e6d3]">
              <span className="text-xs font-semibold text-[#f08c2b]">{getInitials(row.client_name || "?")}</span>
            </div>
            <span className="font-medium text-gray-900">{row.client_name || "—"}</span>
          </div>
        ),
      },
      { key: "loan_product", header: "Product", render: (r) => r.loan_product?.trim() || "—" },
      {
        key: "principal_amount",
        header: "Principal",
        render: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.principal_amount)}</span>,
      },
      {
        key: "interest_rate",
        header: "Rate %",
        render: (r) => <span className="tabular-nums">{Number(r.interest_rate || 0).toFixed(2)}%</span>,
      },
      { key: "tenure_months", header: "Tenure (mo)", render: (r) => <span className="tabular-nums">{r.tenure_months}</span> },
      {
        key: "outstanding_balance",
        header: "Outstanding",
        render: (r) => <span className="tabular-nums">{formatCurrency(r.outstanding_balance)}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (r) => (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span>
        ),
      },
      { key: "loan_type", header: "Type", render: (r) => loanTypeLabel(r.loan_type) },
      {
        key: "application_date",
        header: "Applied",
        render: (r) => (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(r.application_date)}
          </span>
        ),
      },
      {
        key: "next_payment_date",
        header: "Next payment",
        render: (r) => (
          <span className="inline-flex items-center gap-1 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(r.next_payment_date)}
            {r.overdue_days > 0 ? (
              <span className="text-xs text-rose-600">({r.overdue_days}d overdue)</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "maturity_date",
        header: "Maturity",
        render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.maturity_date)}</span>,
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => <ActionButtons actions={tableActions} row={row} />,
      },
    ],
    [tableActions],
  )

  const totalPrincipal = rows.reduce((s, r) => s + r.principal_amount, 0)
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding_balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Sacco loans</h2>
          <p className="text-muted-foreground">
            Institution loans linked to clients—principal, tenure, balances, and workflow status.
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Sacco Loan
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Loans (this page)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">of {totalRows} matching filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Principal (visible)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalPrincipal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding (visible)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
      </div>

      <DataTable<SaccoLoanRow>
        columns={columns}
        rows={rows}
        loading={loading}
        title={`Sacco loans (${totalRows})`}
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || rows.length === 0 || exporting !== null,
          pdfDisabled: loading || rows.length === 0 || exporting !== null,
        }}
        filterFields={filterFields}
        tabularFilters={tabularFilters}
        tabularFilterField="status"
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No Sacco loans found"
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
          rowsPerPageOptions: [10, 20, 50],
        }}
      />
      <AddSaccoLoan
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => void loadLoans(activeQueryParams, page, rowsPerPage)}
      />
    </div>
  )
}
