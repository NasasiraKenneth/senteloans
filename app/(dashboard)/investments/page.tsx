"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { Filter } from "@/types"
import { Plus, AlertTriangle, Eye, Edit, FileText, Calendar, Clock } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/invoices/utils"
import AddNewInvestment from "./components/add/new"
import EditInvestment from "./components/edit/edit"
import { ActionButtons } from "@/components/datatables/ActionButtons"

type InvestmentRow = {
  id: string
  investment_number: string
  provider_name: string
  product_name: string
  investment_type: string
  risk_level: string
  created_by_name: string
  principal_amount: number
  expected_return_amount: number
  start_date: string
  maturity_date: string | null
  status: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(Number(amount || 0))

const formatDate = (value: string | null) => {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-UG")
}

const statusClass = (status: string) => {
  switch (String(status || "").trim().toLowerCase()) {
    case "approved":
      return "bg-indigo-100 text-indigo-700 border border-indigo-200"
    case "active":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200"
    case "matured":
      return "bg-blue-100 text-blue-700 border border-blue-200"
    case "closed":
      return "bg-slate-100 text-slate-700 border border-slate-200"
    case "cancelled":
      return "bg-rose-100 text-rose-700 border border-rose-200"
    default:
      return "bg-amber-100 text-amber-700 border border-amber-200"
  }
}

const formatInvestmentTypeLabel = (value: string) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return "—"
  const labels: Record<string, string> = {
    fixed_income: "Fixed Income",
    project: "Project",
    equity: "Equity",
    partnership: "Partnership",
  }
  return labels[normalized] || normalized.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
}

const formatStatusLabel = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())

export default function InvestmentsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<InvestmentRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [activeEditId, setActiveEditId] = useState<string | null>(null)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})

  const loadInvestments = useCallback(async (queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
            const range = value as { start?: string; end?: string }
            if (range.start) params.set(`${key}Start`, range.start)
            if (range.end) params.set(`${key}End`, range.end)
            return
          }
          if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
        })
      }
      const requestPage = typeof pageOverride === "number" ? pageOverride : page
      const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage
      params.set("page", String(requestPage + 1))
      params.set("pageSize", String(requestRows))
      const res = await fetch(`/api/institution/investments?${params.toString()}`, { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to load investments")

      const items = Array.isArray(body?.items) ? body.items : []
      setRows(
        items.map((item: any) => ({
          id: String(item.id),
          investment_number: String(item.investment_number || item.transaction_number || item.reference_number || "—"),
          provider_name: String(item.provider_name || item.client_name || item.member_name || item.member?.full_name || ""),
          product_name: String(item.product_name || item.product?.name || "—"),
          investment_type: String(item.investment_type || item.type || "—"),
          risk_level: String(item.risk_level || item.risk_profile || "—"),
          created_by_name: String(item.created_by_name || item.staff_name || item.created_by_staff_name || ""),
          principal_amount: Number(item.principal_amount || 0),
          expected_return_amount: Number(item.expected_return_amount || 0),
          start_date: String(item.start_date || ""),
          maturity_date: item.maturity_date ? String(item.maturity_date) : null,
          status: formatStatusLabel(String(item.status || "Pending")),
        })),
      )
      setTotalRows(Number(body?.total || items.length || 0))
    } catch (e: any) {
      const message = e?.message || "Failed to load investments"
      setError(message)
      setRows([])
      setTotalRows(0)
      if (!String(message).toLowerCase().includes("not found")) {
        toast({ variant: "destructive", title: "Failed to load investments", description: message })
      }
    } finally {
      setLoading(false)
    }
  }, [toast, page, rowsPerPage])

  useEffect(() => {
    loadInvestments()
  }, [loadInvestments])

  const handleQueryParamsChange = useCallback((params: object) => {
    setPage(0)
    const normalized = params as Record<string, unknown>
    setActiveQueryParams(normalized)
    loadInvestments(normalized, 0, rowsPerPage)
  }, [loadInvestments, rowsPerPage])

  const handlePageChange = useCallback((_: unknown, newPage: number) => {
    setPage(newPage)
    loadInvestments(activeQueryParams, newPage, rowsPerPage)
  }, [activeQueryParams, loadInvestments, rowsPerPage])

  const handleRowsPerPageChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const nextRowsPerPage = parseInt(e.target.value, 10)
    setRowsPerPage(nextRowsPerPage)
    setPage(0)
    loadInvestments(activeQueryParams, 0, nextRowsPerPage)
  }, [loadInvestments])

  const normalizedStatus = (status: string) => String(status || "").trim().toLowerCase()
  const totalPrincipal = useMemo(() => rows.reduce((sum, row) => sum + row.principal_amount, 0), [rows])
  const totalExpectedReturn = useMemo(() => rows.reduce((sum, row) => sum + row.expected_return_amount, 0), [rows])
  const activeCount = useMemo(() => rows.filter((r) => normalizedStatus(r.status) === "active").length, [rows])
  const maturedCount = useMemo(() => rows.filter((r) => normalizedStatus(r.status) === "matured").length, [rows])

  const handleView = (row: InvestmentRow) => {
    router.push(`/investments/${row.id}`)
  }

  const handleEdit = (row: InvestmentRow) => {
    setActiveEditId(row.id)
    setIsEditOpen(true)
  }

  const columns: DataTableColumn<InvestmentRow>[] = [
    {
      key: "investment_number",
      header: "Investment Number",
      render: (row) => (
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-[#f7e6d3] rounded-full flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#f08c2b]" />
            </div>
          </div>
          <div className="font-medium">{row.investment_number}</div>
        </div>
      ),
    },
    {
      key: "provider_name",
      header: "Provider Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{getInitials(row.provider_name || "")}</span>
          </div>
          <div className="font-medium text-gray-900">{row.provider_name || "—"}</div>
        </div>
      ),
    },
    { key: "product_name", header: "Product", render: (row) => row.product_name || "—" },
    { key: "principal_amount", header: "Principal", render: (row) => <span className="font-medium">{formatCurrency(row.principal_amount)}</span> },
    { key: "expected_return_amount", header: "Expected Return", render: (row) => formatCurrency(row.expected_return_amount) },
    {
      key: "start_date",
      header: "Start Date",
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          {formatDate(row.start_date)}
        </span>
      ),
    },
    { key: "maturity_date", 
      header: "Maturity Date", 
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {formatDate(row.maturity_date)}
        </span>
      ) 
    },
    {
      key: "created_by_name",
      header: "Created By",
      render: (row) =>
        row.created_by_name ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
              <span className="text-[#f08c2b] text-xs font-semibold">{getInitials(row.created_by_name)}</span>
            </div>
            <div className="text-sm text-gray-700">{row.created_by_name}</div>
          </div>
        ) : (
          <span className="flex text-sm text-gray-700 justify-center">-</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>{row.status}</span>,
    },
    { key: "investment_type", header: "Investment Type", render: (row) => formatInvestmentTypeLabel(row.investment_type) },
    { key: "risk_level", header: "Risk Level", render: (row) => row.risk_level || "—" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const rowActions = [
          {
            label: "View",
            onClick: handleView,
            variant: "view",
            icon: <Eye className="h-4 w-4" />,
          },
          ...(normalizedStatus(row.status) === "pending"
            ? [
                {
                  label: "Edit",
                  onClick: handleEdit,
                  variant: "primary",
                  icon: <Edit className="h-4 w-4" />,
                },
              ]
            : []),
        ]
        return <ActionButtons actions={rowActions} row={row} />
      },
    },
  ]

  const filterFields: FilterField[] = [
    { field: "q", label: "Search by number or provider or name", type: "text" },
    {
      field: "investment_type",
      label: "Investment Type",
      type: "select",
      multiple: false,
      options: [
        { value: "fixed_income", label: "Fixed Income" },
        { value: "project", label: "Project" },
        { value: "equity", label: "Equity" },
        { value: "partnership", label: "Partnership" },
      ],
    },
    {
      field: "risk_level",
      label: "Risk Level",
      type: "select",
      multiple: false,
      options: [
        { value: "Low", label: "Low" },
        { value: "Medium", label: "Medium" },
        { value: "High", label: "High" },
      ],
    },
    {
        field: "startDate",
        label: "Search By Start Date Range",
        type: "date-range",
    },
    {
        field: "maturityDate",
        label: "Search By Maturity Date Range",
        type: "date-range",
    },
  ]

  const filters: Filter[] = [
    { label: "All", value: "" },
    { label: "Pending", value: "Pending" },
    { label: "Approved", value: "Approved" },
    { label: "Active", value: "Active" },
    { label: "Matured", value: "Matured" },
    { label: "Closed", value: "Closed" },
    { label: "Cancelled", value: "Cancelled" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Investments</h2>
          <p className="text-muted-foreground">Track member investments, maturity timelines, and expected returns.</p>
        </div>
        <Button type="button" onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Investment
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Investments</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalRows}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Matured</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{maturedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Portfolio Principal</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPrincipal)}</div>
            <p className="text-xs text-muted-foreground">Expected return: {formatCurrency(totalExpectedReturn)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable<InvestmentRow>
        columns={columns}
        rows={rows}
        loading={loading}
        title={`Investments (${totalRows})`}
        tabularFilters={filters}
        tabularFilterField="status"
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No investments found"
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
        }}
      />

      <AddNewInvestment
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadInvestments()}
      />
      <EditInvestment
        isOpen={isEditOpen}
        investmentId={activeEditId}
        onClose={() => {
          setIsEditOpen(false)
          setActiveEditId(null)
        }}
        onSuccess={() => loadInvestments(activeQueryParams, page, rowsPerPage)}
      />
    </div>
  )
}
