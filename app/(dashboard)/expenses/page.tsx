"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { Filter } from "@/types"
import { Plus, AlertTriangle, Eye, Edit, Receipt, Wallet, Banknote } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/invoices/utils"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import AddNewExpense from "./components/add/add"
import EditExpense from "./components/edit/edit"
import ExpenseExpandableContent from "./components/ExpenseExpandableContent"

type ExpenseRow = {
  id: string
  expense_number: string
  name: string
  description: string | null
  type: string
  status: string
  created_at: string
  approved_at: string | null
  category_name: string
  created_by_name: string
  approved_by_name: string | null
  cashflows_total: number
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
      return "bg-emerald-100 text-emerald-800 border border-emerald-200"
    case "active":
    case "completed":
      return "bg-blue-100 text-blue-800 border border-blue-200"
    case "rejected":
    case "cancelled":
      return "bg-rose-100 text-rose-800 border border-rose-200"
    case "pending":
      return "bg-amber-100 text-amber-800 border border-amber-200"
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200"
  }
}

const formatStatusLabel = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())

const formatTypeLabel = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())

export default function ExpensesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [summary, setSummary] = useState({ pendingCount: 0, fundingTotal: 0, cashflowsTotal: 0 })
  const [categories, setCategories] = useState<Array<{ id: string; category: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [activeEditId, setActiveEditId] = useState<string | null>(null)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set())
  const [expensePermissions, setExpensePermissions] = useState({
    viewExpenses: false,
    createExpense: false,
    editExpense: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })

  const loadExpenses = useCallback(
    async (queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) => {
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
        const res = await fetch(`/api/institution/expenses?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load expenses")

        const items = Array.isArray(body?.items) ? body.items : []
        setRows(
          items.map((item: Record<string, unknown>) => ({
            id: String(item.id),
            expense_number: String(item.expense_number || "—"),
            name: String(item.name || ""),
            description: item.description != null && String(item.description) !== "" ? String(item.description) : null,
            type: String(item.type || "Short-term"),
            status: formatStatusLabel(String(item.status || "Pending")),
            created_at: String(item.created_at || ""),
            approved_at: item.approved_at != null ? String(item.approved_at) : null,
            category_name: String(item.category_name || "—"),
            created_by_name: String(item.created_by_name || ""),
            approved_by_name: item.approved_by_name != null ? String(item.approved_by_name) : null,
            cashflows_total: Number(item.cashflows_total || 0),
          })),
        )
        setTotalRows(Number(body?.total || items.length || 0))
        const s = body?.summary
        setSummary({
          pendingCount: Number(s?.pendingCount ?? 0),
          fundingTotal: Number(s?.fundingTotal ?? 0),
          cashflowsTotal: Number(s?.cashflowsTotal ?? 0),
        })
        const cats = Array.isArray(body?.categories) ? body.categories : []
        setCategories(cats.map((c: Record<string, unknown>) => ({ id: String(c.id), category: String(c.category || "") })))
      } catch (e: unknown) {
        const message = (e as Error)?.message || "Failed to load expenses"
        setError(message)
        setRows([])
        setTotalRows(0)
        if (!String(message).toLowerCase().includes("not found")) {
          toast({ variant: "destructive", title: "Failed to load expenses", description: message })
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
        const res = await fetch("/api/institution/expenses/permissions", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          permissions?: {
            viewExpenses?: boolean
            createExpense?: boolean
            editExpense?: boolean
            isSuperAdmin?: boolean
            branches?: Array<{ id: string; name: string }>
          }
        }
        setExpensePermissions({
          viewExpenses: !!data.permissions?.viewExpenses,
          createExpense: !!data.permissions?.createExpense,
          editExpense: !!data.permissions?.editExpense,
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
    loadExpenses()
  }, [loadExpenses])

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0)
      const normalized = params as Record<string, unknown>
      setActiveQueryParams(normalized)
      loadExpenses(normalized, 0, rowsPerPage)
    },
    [loadExpenses, rowsPerPage],
  )

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage)
      loadExpenses(activeQueryParams, newPage, rowsPerPage)
    },
    [activeQueryParams, loadExpenses, rowsPerPage],
  )

  const handleRowsPerPageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const nextRowsPerPage = parseInt(e.target.value, 10)
      setRowsPerPage(nextRowsPerPage)
      setPage(0)
      loadExpenses(activeQueryParams, 0, nextRowsPerPage)
    },
    [activeQueryParams, loadExpenses],
  )

  const handleView = (row: ExpenseRow) => {
    router.push(`/expenses/${row.id}`)
  }

  const handleEdit = useCallback(
    (row: ExpenseRow) => {
      if (String(row.status || "").trim().toLowerCase() !== "pending") {
        toast({
          variant: "destructive",
          title: "Cannot edit",
          description: "Only expenses in Pending status can be edited.",
        })
        return
      }
      setActiveEditId(row.id)
      setIsEditOpen(true)
    },
    [toast],
  )

  const handleCloseEdit = useCallback(() => {
    setIsEditOpen(false)
    setActiveEditId(null)
  }, [])

  const toggleRowExpand = useCallback((rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }, [])

  const columns: DataTableColumn<ExpenseRow>[] = [
    {
      key: "expense_number",
      header: "Expense Number",
      render: (row) => (
        <div className="flex items-center space-x-3">
          <div className="shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f7e6d3]">
              <Receipt className="h-4 w-4 text-[#f08c2b]" />
            </div>
          </div>
          <div className="font-medium">{row.expense_number}</div>
        </div>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <span className="line-clamp-2 max-w-[220px] text-sm font-medium text-gray-900">{row.name?.trim() || "—"}</span>
      ),
    },
    { key: "category_name", header: "Category", render: (row) => row.category_name || "—" },
    {
      key: "type",
      header: "Type",
      render: (row) => <span className="text-sm text-gray-800">{formatTypeLabel(row.type)}</span>,
    },
    {
      key: "cashflows_total",
      header: "Cashflows",
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
          {formatCurrency(row.cashflows_total)}
        </span>
      ),
    },
    {
      key: "created_by_name",
      header: "Created by",
      render: (row) =>
        row.created_by_name ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-black/80 to-black/50">
              <span className="text-xs font-semibold text-[#f08c2b]">{getInitials(row.created_by_name)}</span>
            </div>
            <div className="text-sm text-gray-700">{row.created_by_name}</div>
          </div>
        ) : (
          <span className="flex justify-center text-sm text-gray-700">—</span>
        ),
    },
    {
      key: "approved_at",
      header: "Approved",
      render: (row) => <span className="text-sm">{formatDate(row.approved_at)}</span>,
    },
    {
      key: "approved_by_name",
      header: "Approved by",
      render: (row) =>
        row.approved_by_name ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-emerald-900/80 to-emerald-700/60">
              <span className="text-xs font-semibold text-emerald-100">{getInitials(row.approved_by_name)}</span>
            </div>
            <div className="text-sm text-gray-700">{row.approved_by_name}</div>
          </div>
        ) : (
          <span className="flex justify-center text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>{row.status}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <ActionButtons
          actions={[
            {
              label: "View",
              onClick: handleView,
              variant: "view",
              icon: <Eye className="h-4 w-4" />,
              disabled: !expensePermissions.viewExpenses,
            },
            {
              label: "Edit",
              onClick: handleEdit,
              variant: "primary",
              icon: <Edit className="h-4 w-4" />,
              disabled: !expensePermissions.editExpense,
            },
          ]}
          row={row}
        />
      ),
    },
  ]

// Fixed expenses — stay relatively constant (rent, salaries)
// Variable expenses — change depending on activity (fuel, utilities)
// Capital expenses (CAPEX) — long-term assets
// Operating expenses (OPEX) — day-to-day running costs

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      { field: "q", label: "Search by expense number, name, or description", type: "text" },
      {
        field: "type",
        label: "Expense type",
        type: "select",
        multiple: false,
        options: [
          { value: "Fixed-expenses", label: "Fixed-expenses" },
          { value: "Variable-expenses", label: "Variable-expenses" },
          { value: "Capital-expenses", label: "Capital-expenses" },
          { value: "Operating-expenses", label: "Operating-expenses" },
        ],
      },
      {
        field: "category_id",
        label: "Category",
        type: "select",
        multiple: false,
        options: categories.map((c) => ({ value: c.id, label: c.category })),
      },
    ]
    return withBranchFilterFirst(fields, {
      isSuperAdmin: expensePermissions.isSuperAdmin,
      branchOptions: expensePermissions.branches,
    })
  }, [expensePermissions.isSuperAdmin, expensePermissions.branches, categories])

  const filters: Filter[] = [
    { label: "All", value: "" },
    { label: "Pending", value: "Pending" },
    { label: "Approved", value: "Approved" },
    { label: "Active", value: "Active" },
    { label: "Rejected", value: "Rejected" },
    { label: "Completed", value: "Completed" },
  ]

  const onNewExpense = () => setIsAddOpen(true)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Expenses</h2>
          <p className="text-muted-foreground">Branch expenses, planned funding sources, and recorded cashflows.</p>
        </div>
        <Button type="button" onClick={onNewExpense} disabled={!expensePermissions.createExpense}>
          <Plus className="mr-2 h-4 w-4" />
          New expense
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRows}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingCount}</div>
            <p className="text-xs text-muted-foreground">Matching current filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Planned funding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              {formatCurrency(summary.fundingTotal)}
            </div>
            <p className="text-xs text-muted-foreground">Sum of funding lines</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cashflows recorded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Banknote className="h-5 w-5 text-muted-foreground" />
              {formatCurrency(summary.cashflowsTotal)}
            </div>
            <p className="text-xs text-muted-foreground">Sum of cashflow lines</p>
          </CardContent>
        </Card>
      </div>

      <DataTable<ExpenseRow>
        columns={columns}
        rows={rows}
        loading={loading}
        title={`Expenses (${totalRows})`}
        tabularFilters={filters}
        tabularFilterField="status"
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No expenses found"
        getRowId={(row) => row.id}
        renderDetail={(row) => (
          <ExpenseExpandableContent
            expense={{
              expense_number: row.expense_number,
              name: row.name,
              description: row.description,
            }}
          />
        )}
        expandedRowIds={expandedRowIds}
        onToggleExpand={toggleRowExpand}
        onRowClick={(row) => toggleRowExpand(row.id)}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
        }}
      />
      <AddNewExpense
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadExpenses(activeQueryParams, page, rowsPerPage)}
      />
      <EditExpense
        isOpen={isEditOpen}
        expenseId={activeEditId}
        onClose={handleCloseEdit}
        onSuccess={() => loadExpenses(activeQueryParams, page, rowsPerPage)}
      />
    </div>
  )
}
