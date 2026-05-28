"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { FileText, AlertTriangle, Eye, Calendar } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/invoices/utils"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { downloadInvestmentReportsExport } from "./export/export"

type InvestmentReportExtended = {
  opening_value: number
  capital_inflow: number
  capital_outflow: number
  income: number
  expenses: number
  closing_value: number
  notes: string | null
  updated_at: string | null
}

const REPORT_PERIOD_MONTH_OPTIONS: { value: string; label: string }[] = [
  { value: "january", label: "January" },
  { value: "february", label: "February" },
  { value: "march", label: "March" },
  { value: "april", label: "April" },
  { value: "may", label: "May" },
  { value: "june", label: "June" },
  { value: "july", label: "July" },
  { value: "august", label: "August" },
  { value: "september", label: "September" },
  { value: "october", label: "October" },
  { value: "november", label: "November" },
  { value: "december", label: "December" },
]

function buildReportPeriodYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear()
  const out: { value: string; label: string }[] = []
  for (let i = 0; i <= 40; i++) {
    const y = currentYear - i
    out.push({ value: String(y), label: String(y) })
  }
  return out
}

type InvestmentReportRow = {
  id: string
  investment_id: string
  investment_number: string
  investment_name: string
  provider_name: string
  report_number: string
  report_period: string
  created_at: string
  created_by_name: string
  extended: InvestmentReportExtended
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))

const formatDate = (value: string) => {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-UG")
}

const formatDateTime = (value: string | null) => {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-UG")
}

/** e.g. march-2026 → March 2026 */
const formatReportPeriodLabel = (period: string) => {
  const raw = String(period || "").trim().toLowerCase()
  const m = raw.match(/^([a-z]+)-(\d{4})$/)
  if (!m) return period || "—"
  const month = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `${month} ${m[2]}`
}

function ReportRowExtendedDetail({ row }: { row: InvestmentReportRow }) {
  const x = row.extended
  return (
    <div className="space-y-4 border-t border-gray-100 bg-gray-50/80 px-4 py-5 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report detail</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailStat label="Opening value" value={formatCurrency(x.opening_value)} />
        <DetailStat label="Capital inflow" value={formatCurrency(x.capital_inflow)} />
        <DetailStat label="Capital outflow" value={formatCurrency(x.capital_outflow)} />
        <DetailStat label="Income" value={formatCurrency(x.income)} />
        <DetailStat label="Expenses" value={formatCurrency(x.expenses)} />
        <DetailStat label="Closing value" value={formatCurrency(x.closing_value)} emphasized />
        <DetailStat label="Last updated" value={formatDateTime(x.updated_at)} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Notes</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white px-3 py-2">
          {x.notes?.trim() ? x.notes : "—"}
        </p>
      </div>
    </div>
  )
}

function DetailStat({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm tabular-nums ${emphasized ? "font-semibold text-gray-900" : "text-gray-800"}`}>{value}</p>
    </div>
  )
}

export default function InvestmentReportsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<InvestmentReportRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set())
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [reportPermissions, setReportPermissions] = useState({
    viewInvestmentReports: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })
  const permissionDeniedToastShown = useRef(false)
  const exportPermissionToastShown = useRef(false)

  const loadReports = useCallback(
    async (queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) => {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (queryParams) {
          Object.entries(queryParams as Record<string, unknown>).forEach(([key, value]) => {
            if (
              value &&
              typeof value === "object" &&
              "start" in (value as Record<string, unknown>) &&
              "end" in (value as Record<string, unknown>)
            ) {
              const range = value as { start?: string; end?: string }
              const start = range.start ? String(range.start).slice(0, 10) : ""
              const end = range.end ? String(range.end).slice(0, 10) : ""
              if (/^\d{4}-\d{2}-\d{2}$/.test(start)) params.set(`${key}Start`, start)
              if (/^\d{4}-\d{2}-\d{2}$/.test(end)) params.set(`${key}End`, end)
              return
            }
            if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
          })
        }
        const requestPage = typeof pageOverride === "number" ? pageOverride : page
        const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage
        params.set("page", String(requestPage + 1))
        params.set("pageSize", String(requestRows))
        const res = await fetch(`/api/institution/investments/reports?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const errCode = String(body?.error || "")
          if (errCode === "missing_permission:view_investment_reports") {
            const e = new Error(errCode) as Error & { code?: string }
            e.code = errCode
            throw e
          }
          throw new Error(errCode || "Failed to load investment reports")
        }

        const items = Array.isArray(body?.items) ? body.items : []
        setRows(
          items.map((item: Record<string, unknown>) => {
            const ext = item.extended as Record<string, unknown> | undefined
            return {
              id: String(item.id || ""),
              investment_id: String(item.investment_id || ""),
              investment_number: String(item.investment_number || "—"),
              investment_name: String(item.investment_name || ""),
              provider_name: String(item.provider_name || ""),
              report_number: String(item.report_number || "—"),
              report_period: String(item.report_period || ""),
              created_at: String(item.created_at || ""),
              created_by_name: String(item.created_by_name || ""),
              extended: {
                opening_value: Number(ext?.opening_value ?? 0),
                capital_inflow: Number(ext?.capital_inflow ?? 0),
                capital_outflow: Number(ext?.capital_outflow ?? 0),
                income: Number(ext?.income ?? 0),
                expenses: Number(ext?.expenses ?? 0),
                closing_value: Number(ext?.closing_value ?? 0),
                notes: ext?.notes != null ? String(ext.notes) : null,
                updated_at: ext?.updated_at != null ? String(ext.updated_at) : null,
              },
            }
          }),
        )
        setTotalRows(Number(body?.total ?? items.length ?? 0))
        permissionDeniedToastShown.current = false
        exportPermissionToastShown.current = false
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load investment reports"
        if (message === "missing_permission:view_investment_reports") {
          setError("")
          setRows([])
          setTotalRows(0)
          if (!permissionDeniedToastShown.current) {
            permissionDeniedToastShown.current = true
            toast({
              variant: "warning",
              title: "Access denied",
              description: "You do not have permission to view investment reports.",
            })
          }
        } else {
          setError(message)
          setRows([])
          setTotalRows(0)
          toast({ variant: "destructive", title: "Failed to load reports", description: message })
        }
      } finally {
        setLoading(false)
      }
    },
    [toast, page, rowsPerPage],
  )

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/institution/investments/permissions", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          permissions?: {
            viewInvestmentReports?: boolean
            isSuperAdmin?: boolean
            branches?: Array<{ id: string; name: string }>
          }
        }
        setReportPermissions({
          viewInvestmentReports: !!data.permissions?.viewInvestmentReports,
          isSuperAdmin: !!data.permissions?.isSuperAdmin,
          branches: (data.permissions?.branches || []).map((b) => ({ value: b.id, label: b.name })),
        })
      } catch {
        // keep defaults
      }
    }
    void loadPermissions()
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0)
      const normalized = params as Record<string, unknown>
      setActiveQueryParams(normalized)
      const flat: Record<string, string> = {}
      Object.entries(normalized).forEach(([k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "start" in (v as Record<string, unknown>) &&
          "end" in (v as Record<string, unknown>)
        ) {
          const range = v as { start?: string; end?: string }
          const start = range.start ? String(range.start).slice(0, 10) : ""
          const end = range.end ? String(range.end).slice(0, 10) : ""
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat[`${k}Start`] = start
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat[`${k}End`] = end
          return
        }
        if (v !== undefined && v !== null && String(v).trim() !== "") flat[k] = String(v)
      })
      setActiveFilters(flat)
      exportPermissionToastShown.current = false
      void loadReports(normalized, 0, rowsPerPage)
    },
    [loadReports, rowsPerPage],
  )

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!reportPermissions.viewInvestmentReports) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export investment reports.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadInvestmentReportsExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded investment reports ${format.toUpperCase()}.`,
      })
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      if (message === "missing_permission:view_investment_reports") {
        if (!exportPermissionToastShown.current) {
          exportPermissionToastShown.current = true
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to export investment reports.",
          })
        }
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
      setExpandedRowIds(new Set())
      void loadReports(activeQueryParams, newPage, rowsPerPage)
    },
    [activeQueryParams, loadReports, rowsPerPage],
  )

  const handleRowsPerPageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10)
      setRowsPerPage(next)
      setPage(0)
      setExpandedRowIds(new Set())
      void loadReports(activeQueryParams, 0, next)
    },
    [activeQueryParams, loadReports],
  )

  const toggleExpand = (rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const handleViewInvestment = (row: InvestmentReportRow) => {
    router.push(`/investments/${row.investment_id}`)
  }

  const filterFields = useMemo<FilterField[]>(() => {
    const fields: FilterField[] = [
      { field: "q", label: "Search report #, investment #, investment name, provider", type: "text" },
      { field: "recordedDate", label: "Recorded date", type: "date-range" },
      {
        field: "periodMonths",
        label: "Report period — months",
        type: "select",
        multiple: true,
        options: REPORT_PERIOD_MONTH_OPTIONS,
      },
      {
        field: "periodYears",
        label: "Report period — years",
        type: "select",
        multiple: true,
        options: buildReportPeriodYearOptions(),
      },
    ]
    return withBranchFilterFirst(fields, {
      isSuperAdmin: reportPermissions.isSuperAdmin,
      branchOptions: reportPermissions.branches,
    })
  }, [reportPermissions.isSuperAdmin, reportPermissions.branches])

  const columns: DataTableColumn<InvestmentReportRow>[] = [
    {
      key: "report_number",
      header: "Report #",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7e6d3]">
            <FileText className="h-4 w-4 text-[#f08c2b]" />
          </div>
          <span className="font-medium">{row.report_number}</span>
        </div>
      ),
    },
    {
      key: "report_period",
      header: "Period",
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          {formatReportPeriodLabel(row.report_period)}
        </span>
      ),
    },
    {
      key: "investment_number",
      header: "Investment #",
      render: (row) => (
        <Link href={`/investments/${row.investment_id}`} className="font-medium text-[#f08c2b] hover:underline">
          {row.investment_number}
        </Link>
      ),
    },
    {
      key: "investment_name",
      header: "Investment name",
      render: (row) => row.investment_name?.trim() || "—",
    },
    { key: "provider_name", header: "Provider", render: (row) => row.provider_name || "—" },
    {
      key: "created_by_name",
      header: "Recorded by",
      render: (row) =>
        row.created_by_name ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-black/80 to-black/50">
              <span className="text-[10px] font-semibold text-[#f08c2b]">{getInitials(row.created_by_name)}</span>
            </div>
            <span className="text-sm text-gray-700">{row.created_by_name}</span>
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "created_at",
      header: "Date",
      render: (row) => <span className="text-sm text-muted-foreground tabular-nums">{formatDate(row.created_at)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionButtons
            actions={[
              {
                label: "View investment",
                onClick: () => handleViewInvestment(row),
                variant: "view",
                icon: <Eye className="h-4 w-4" />,
              },
            ]}
            row={row}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Investment reports</h2>
        <p className="text-muted-foreground">
          Monthly reports by period. Click a row to expand opening, capital flows, income, expenses, closing, and notes.
        </p>
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
            <CardTitle className="text-sm font-medium">Reports (this page)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">of {totalRows} total matching filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Closing value (visible rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(rows.reduce((s, r) => s + r.extended.closing_value, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Income (visible rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(rows.reduce((s, r) => s + r.extended.income, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable<InvestmentReportRow>
        columns={columns}
        rows={rows}
        loading={loading}
        title={`Investment reports (${totalRows})`}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No investment reports found"
        getRowId={(row) => row.id}
        renderDetail={(row) => <ReportRowExtendedDetail row={row} />}
        expandedRowIds={expandedRowIds}
        onToggleExpand={toggleExpand}
        onRowClick={(row) => toggleExpand(row.id)}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
          rowsPerPageOptions: [10, 20, 50],
        }}
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || totalRows === 0 || exporting !== null || !reportPermissions.viewInvestmentReports,
          pdfDisabled: loading || totalRows === 0 || exporting !== null || !reportPermissions.viewInvestmentReports,
        }}
      />
    </div>
  )
}
