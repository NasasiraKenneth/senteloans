"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileText,
  Lock,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { ActionSelect, type SelectOption } from "@/components/datatables/actions"
import type { FilterField } from "@/components/datatables/TableFilter"
import type { Filter } from "@/types"
import { useToast } from "@/components/ui/toast"
import { MdFormatListBulletedAdd } from "react-icons/md"
import AddFunding from "../components/funding/add"
import EditFunding from "../components/funding/edit"
import RecordExpenseCashflow from "../components/cashFlows/add"
import EditExpenseCashflow from "../components/cashFlows/edit"
import { describeExpenseCashflowApiError } from "../components/cashFlows/cashflowApiErrors"
import { describeExpenseApiError } from "../components/expenseApiErrors"
import { describeExpenseFundingApiError } from "../components/funding/fundingApiErrors"
import ExpenseCashflowExpandableContent from "../components/cashFlows/ExpenseCashflowExpandableContent"
import type { FundingFormRow, FundingType } from "../components/forms/fundingForm"

const FUNDING_TYPES: FundingType[] = ["savings", "shares", "reserves", "loan", "grant"]

const EXPENSE_CASHFLOW_TABULAR_FILTERS: Filter[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Rejected", value: "rejected" },
]

function apiFundingToForm(row: FundingRow): FundingFormRow {
  const t = String(row.source_type || "savings").toLowerCase()
  const type = (FUNDING_TYPES.includes(t as FundingType) ? t : "savings") as FundingType
  return {
    id: row.id,
    type,
    amount: Number(row.amount || 0),
    loanId: row.loan_id ?? "",
  }
}

type ExpenseDetails = {
  id: string
  expense_number: string
  name: string
  description: string | null
  type: string
  status: string
  category_id: string
  category_name: string
  branch_id: string
  branch_name: string
  created_at: string
  updated_at: string | null
  approved_at: string | null
  created_by_name: string
  funding_total: number
  cashflows_total: number
}

type FundingRow = {
  id: string
  source_type: string
  loan_id: string | null
  amount: number
  created_at: string
}

type ExpenseCashflowRow = {
  id: string
  amount: number
  description: string | null
  status: string
  date: string | null
  payment_method: string | null
  created_at: string
  staff_id: string | null
  client_id: string | null
  assigned_type: "staff" | "client" | null
  assigned_name: string | null
  completed_by: string | null
  completed_at: string | null
  completed_by_name: string | null
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-UG") : "—")

const titleCase = (v: string) => String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

function statusBadgeClass(status: string) {
  const s = String(status || "").trim().toLowerCase()
  if (s === "pending") return "bg-amber-100 text-amber-700 border border-amber-200"
  if (s === "approved") return "bg-blue-100 text-blue-700 border border-blue-200"
  if (s === "active") return "bg-sky-100 text-sky-800 border border-sky-200"
  if (s === "completed") return "bg-emerald-100 text-emerald-700 border border-emerald-200"
  if (s === "rejected" || s === "cancelled") return "bg-rose-100 text-rose-700 border border-rose-200"
  if (s === "closed") return "bg-muted text-muted-foreground border border-border"
  return "bg-muted text-muted-foreground border border-border"
}

function cashflowStatusClass(status: string) {
  const s = String(status || "").trim().toLowerCase()
  if (s === "pending") return "bg-amber-100 text-amber-800 border border-amber-200"
  if (s === "completed" || s === "paid") return "bg-emerald-100 text-emerald-800 border border-emerald-200"
  if (s === "rejected") return "bg-rose-100 text-rose-800 border border-rose-200"
  return "bg-muted text-muted-foreground border border-border"
}

export default function ExpenseDetailsPage() {
  const params = useParams()
  const expenseId = String(params.id || "")
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [expense, setExpense] = useState<ExpenseDetails | null>(null)
  const [funding, setFunding] = useState<FundingRow[]>([])
  const [cashflows, setCashflows] = useState<ExpenseCashflowRow[]>([])
  const [cashflowPage, setCashflowPage] = useState(0)
  const [cashflowRowsPerPage, setCashflowRowsPerPage] = useState(10)
  const [addFundingOpen, setAddFundingOpen] = useState(false)
  const [editFundingOpen, setEditFundingOpen] = useState(false)
  const [editFundingRow, setEditFundingRow] = useState<FundingFormRow | null>(null)
  const [recordCashflowOpen, setRecordCashflowOpen] = useState(false)
  const [editCashflowOpen, setEditCashflowOpen] = useState(false)
  const [editCashflowRow, setEditCashflowRow] = useState<ExpenseCashflowRow | null>(null)
  const [cashflowFilters, setCashflowFilters] = useState<Record<string, unknown>>({})
  const [expandedCashflowRowIds, setExpandedCashflowRowIds] = useState<Set<string | number>>(new Set())
  const [editExpenseStatus, setEditExpenseStatus] = useState(false)
  const [approving, setApproving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [completing, setCompleting] = useState(false)

  const toggleCashflowRowExpand = useCallback((rowId: string | number) => {
    setExpandedCashflowRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }, [])

  const comingSoon = (action: string) => {
    toast({
      title: `${action} — coming soon`,
      description: "This action is not wired up yet.",
    })
  }

  const load = async () => {
    if (!expenseId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/expenses/${expenseId}`, { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to load expense")
      const e = body?.expense
      if (!e) throw new Error("Invalid response")
      setExpense({
        id: String(e.id || ""),
        expense_number: String(e.expense_number || ""),
        name: String(e.name || ""),
        description: e.description != null ? String(e.description) : null,
        type: String(e.type || "Short-term"),
        status: String(e.status || "Pending"),
        category_id: String(e.category_id || ""),
        category_name: String(e.category_name || ""),
        branch_id: String(e.branch_id || ""),
        branch_name: String(e.branch_name || ""),
        created_at: String(e.created_at || ""),
        updated_at: e.updated_at != null ? String(e.updated_at) : null,
        approved_at: e.approved_at != null ? String(e.approved_at) : null,
        created_by_name: String(e.created_by_name || ""),
        funding_total: Number(e.funding_total || 0),
        cashflows_total: Number(e.cashflows_total || 0),
      })
      setFunding(
        Array.isArray(body.funding)
          ? body.funding.map((f: Record<string, unknown>) => ({
              id: String(f.id || ""),
              source_type: String(f.source_type || ""),
              loan_id: f.loan_id != null ? String(f.loan_id) : null,
              amount: Number(f.amount || 0),
              created_at: f.created_at != null ? String(f.created_at) : "",
            }))
          : [],
      )
      setCashflows(
        Array.isArray(body.cashflows)
          ? body.cashflows.map((c: Record<string, unknown>) => ({
              id: String(c.id || ""),
              amount: Number(c.amount || 0),
              description: c.description != null ? String(c.description) : null,
              status: String(c.status || "Pending"),
              date: c.date != null ? String(c.date) : null,
              payment_method: c.payment_method != null ? String(c.payment_method) : null,
              created_at: c.created_at != null ? String(c.created_at) : "",
              staff_id: c.staff_id != null ? String(c.staff_id) : null,
              client_id: c.client_id != null ? String(c.client_id) : null,
              assigned_type:
                c.assigned_type === "staff" || c.assigned_type === "client" ? (c.assigned_type as "staff" | "client") : null,
              assigned_name: c.assigned_name != null ? String(c.assigned_name) : null,
              completed_by: c.completed_by != null ? String(c.completed_by) : null,
              completed_at: c.completed_at != null ? String(c.completed_at) : null,
              completed_by_name: c.completed_by_name != null ? String(c.completed_by_name).trim() : null,
            }))
          : [],
      )
    } catch (err: unknown) {
      const message = String((err as Error)?.message || "")
      toast({ variant: "destructive", title: "Failed to load details", description: message || "Please try again." })
      setExpense(null)
      setFunding([])
      setCashflows([])
    } finally {
      setLoading(false)
    }
  }

  const approveExpense = async () => {
    if (!expenseId) return
    try {
      setApproving(true)
      const res = await fetch(`/api/institution/expenses/${expenseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved" }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not approve expense",
          description: describeExpenseApiError(body),
        })
        return
      }
      toast({ title: "Expense approved", description: "Status updated to Approved." })
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not approve expense",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setApproving(false)
    }
  }

  const completeExpense = async () => {
    if (!expenseId) return
    try {
      setCompleting(true)
      const res = await fetch(`/api/institution/expenses/${expenseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not complete expense",
          description: describeExpenseApiError(body),
        })
        return
      }
      toast({ title: "Expense completed", description: "Status updated to Completed." })
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not complete expense",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setCompleting(false)
    }
  }

  const cancelExpense = async () => {
    if (!expenseId) return
    try {
      setCancelling(true)
      const res = await fetch(`/api/institution/expenses/${expenseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Rejected" }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not cancel expense",
          description: describeExpenseApiError(body),
        })
        return
      }
      const expenseResult = body.expense as { cashflows_rejected?: number } | undefined
      const n = Number(expenseResult?.cashflows_rejected ?? 0)
      toast({
        title: "Expense cancelled",
        description:
          n > 0 ? `Status updated to Rejected. ${n} cashflow line${n === 1 ? "" : "s"} marked rejected.` : "Status updated to Rejected.",
      })
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not cancel expense",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setCancelling(false)
    }
  }

  const patchCashflowStatus = async (row: ExpenseCashflowRow, status: "completed" | "rejected") => {
    try {
      const res = await fetch(`/api/institution/expenses/${expenseId}/cashflows/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(describeExpenseCashflowApiError(body))
      const tx = body.transaction as { transaction_number?: string } | undefined
      toast({
        title: "Cashflow status updated",
        description:
          status === "completed" && tx?.transaction_number
            ? `Marked as Completed. Ledger ${tx.transaction_number}.`
            : `Marked as ${status === "completed" ? "Completed" : "Rejected"}.`,
      })
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not update cashflow",
        description: String((e as Error)?.message || "Please try again."),
      })
    }
  }

  useEffect(() => {
    setCashflowFilters({})
    setCashflowPage(0)
    setExpandedCashflowRowIds(new Set())
    void load()
    void (async () => {
      try {
        const res = await fetch("/api/institution/expenses/permissions", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        const p = body?.permissions as { editExpenseStatus?: boolean } | undefined
        if (res.ok && p) setEditExpenseStatus(!!p.editExpenseStatus)
      } catch {
        setEditExpenseStatus(false)
      }
    })()
  }, [expenseId])

  const cashflowDisplayDate = (r: ExpenseCashflowRow) => (r.date ? formatDate(r.date) : formatDate(r.created_at))

  const cashflowColumns: DataTableColumn<ExpenseCashflowRow>[] = [
    { key: "date", header: "Date", render: (r) => cashflowDisplayDate(r) },
    {
      key: "assigned_to",
      header: "Assigned to",
      render: (r) => {
        if (!r.assigned_name) return <span className="text-muted-foreground">—</span>
        const kind = r.assigned_type === "staff" ? "Staff" : r.assigned_type === "client" ? "Client" : ""
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{r.assigned_name}</span>
            {kind ? <span className="text-xs text-muted-foreground">{kind}</span> : null}
          </div>
        )
      },
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cashflowStatusClass(r.status)}`}>
          {titleCase(r.status)}
        </span>
      ),
    },
    { key: "amount", header: "Amount", render: (r) => formatCurrency(r.amount) },
    {
      key: "payment_method",
      header: "Method",
      render: (r) => (r.payment_method ? titleCase(r.payment_method.replace(/_/g, " ")) : "—"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const actions: SelectOption[] = [
          {
            value: "edit",
            label: "Edit",
            icon: <Pencil className="h-4 w-4" />,
            onClick: () => {
              setEditCashflowRow(row)
              setEditCashflowOpen(true)
            },
          },
        ]
        const statusOptions: SelectOption[] = [
          {
            value: "completed",
            label: "Mark as Completed",
            color: "text-green-600",
            icon: <CheckCircle2 className="mr-2 h-4 w-4" />,
            onClick: () => void patchCashflowStatus(row, "completed"),
          },
          {
            value: "rejected",
            label: "Mark as Rejected",
            color: "text-red-600",
            icon: <AlertTriangle className="mr-2 h-4 w-4" />,
            onClick: () => void patchCashflowStatus(row, "rejected"),
          },
        ]
        return (
          <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            <ActionSelect row={row} actions={actions} statusOptions={statusOptions} />
          </div>
        )
      },
    },
  ]

  const cashflowFilterFields = useMemo<FilterField[]>(
    () => [
      {
        field: "assigned_search",
        label: "Search assigned to",
        type: "text",
      },
      {
        field: "assigned_party",
        label: "Assigned party",
        type: "select",
        options: [
          { value: "", label: "All" },
          { value: "staff", label: "Staff" },
          { value: "client", label: "Clients" },
        ],
      },
    ],
    [],
  )

  const filteredCashflows = useMemo(() => {
    let list = cashflows
    const status = String(cashflowFilters.cashflow_status ?? "")
      .trim()
      .toLowerCase()
    if (status) {
      list = list.filter((c) => String(c.status || "").trim().toLowerCase() === status)
    }
    const party = String(cashflowFilters.assigned_party ?? "")
      .trim()
      .toLowerCase()
    if (party === "staff") {
      list = list.filter((c) => !!c.staff_id)
    } else if (party === "client") {
      list = list.filter((c) => !!c.client_id)
    }
    const q = String(cashflowFilters.assigned_search ?? "")
      .trim()
      .toLowerCase()
    if (q) {
      list = list.filter((c) => (c.assigned_name || "").toLowerCase().includes(q))
    }
    return list
  }, [cashflows, cashflowFilters])

  const pagedCashflows = useMemo(
    () =>
      filteredCashflows.slice(cashflowPage * cashflowRowsPerPage, cashflowPage * cashflowRowsPerPage + cashflowRowsPerPage),
    [filteredCashflows, cashflowPage, cashflowRowsPerPage],
  )

  const pendingCashflowCount = useMemo(
    () => cashflows.filter((c) => String(c.status || "").trim().toLowerCase() === "pending").length,
    [cashflows],
  )
  const completedCashflowCount = useMemo(() => {
    return cashflows.filter((c) => {
      const s = String(c.status || "").trim().toLowerCase()
      return s === "completed" || s === "paid"
    }).length
  }, [cashflows])

  if (!expense && !loading) {
    return (
      <div className="max-w-6xl mx-auto py-10">
        <p className="text-sm text-muted-foreground">Expense not found.</p>
        <Link href="/expenses">
          <Button className="mt-4">Back to Expenses</Button>
        </Link>
      </div>
    )
  }

  const statusLower = String(expense?.status || "").toLowerCase()
  const showApproveButton = statusLower === "pending"
  const showCompleteButton = statusLower === "active"
  const showCancelButton = statusLower === "pending" || statusLower === "approved"
  const showCloseButton =
    !!expense && statusLower !== "pending" && statusLower !== "approved" && statusLower !== "closed" && statusLower !== "cancelled"

  return (
    <div className="relative">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/expenses" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Expenses
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {showApproveButton && editExpenseStatus ? (
              <Button type="button" variant="outline" onClick={() => void approveExpense()} disabled={approving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {approving ? "Approving…" : "Approve"}
              </Button>
            ) : null}
            {showCompleteButton && editExpenseStatus ? (
              <Button type="button" variant="outline" onClick={() => void completeExpense()} disabled={completing}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {completing ? "Completing…" : "Complete"}
              </Button>
            ) : null}
            {showCloseButton ? (
              <Button type="button" variant="outline" onClick={() => comingSoon("Close expense")}>
                <Lock className="mr-2 h-4 w-4" />
                Close
              </Button>
            ) : null}
            {showCancelButton && editExpenseStatus ? (
              <Button type="button" variant="outline" onClick={() => void cancelExpense()} disabled={cancelling}>
                <X className="mr-2 h-4 w-4 text-red-600" />
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => comingSoon("Expense summary")}>
              <FileText className="mr-2 h-4 w-4" />
              Expense summary
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border bg-card">
          <div className="h-20 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
          <div className="px-6 pb-6">
            <div className="flex flex-col gap-5 -mt-8 sm:flex-row">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-card bg-primary/10 shadow-sm">
                <Receipt className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0 flex-1 pt-1 sm:pt-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <h1 className="truncate text-2xl font-bold tracking-tight">{expense?.expense_number || "Expense"}</h1>
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(
                      expense?.status || "",
                    )}`}
                  >
                    {titleCase(expense?.status || "Pending")}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{expense?.name || "—"}</span>
                  <span className="hidden text-border sm:inline">|</span>
                  <span>{expense?.branch_name || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            icon={<Banknote className="h-4 w-4 text-blue-600" />}
            label="Funding planned"
            value={formatCurrency(expense?.funding_total ?? 0)}
          />
          <MetricCard
            icon={<DollarSign className="h-4 w-4 text-green-600" />}
            label="Cashflows recorded"
            value={formatCurrency(expense?.cashflows_total ?? 0)}
          />
          <MetricCard
            icon={<Calendar className="h-4 w-4 text-amber-600" />}
            label="Pending cashflows"
            value={String(pendingCashflowCount)}
          />
          <MetricCard
            icon={<CheckCircle2 className="h-4 w-4 text-purple-600" />}
            label="Settled lines"
            value={String(completedCashflowCount)}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Expense information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <SectionLabel>Expense number</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.expense_number || "—"}</p>
                </div>
                <div>
                  <SectionLabel>Name</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.name || "—"}</p>
                </div>
                <div>
                  <SectionLabel>Expense type</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{titleCase(expense?.type || "—")}</p>
                </div>
                <div>
                  <SectionLabel>Category</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.category_name || "—"}</p>
                </div>
                <div>
                  <SectionLabel>Branch</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.branch_name || "—"}</p>
                </div>
                <div>
                  <SectionLabel>Status</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{titleCase(expense?.status || "—")}</p>
                </div>
                <div>
                  <SectionLabel>Created</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{formatDate(expense?.created_at)}</p>
                </div>
                <div>
                  <SectionLabel>Approved</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{formatDate(expense?.approved_at)}</p>
                </div>
                <div className="col-span-2">
                  <SectionLabel>Created by</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.created_by_name || "—"}</p>
                </div>
                <div className="col-span-2">
                  <SectionLabel>Description</SectionLabel>
                  <p className="mt-0.5 text-sm font-medium">{expense?.description || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Funding
                  </CardTitle>
                  <CardDescription>Review and manage expense funding sources</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddFundingOpen(true)}>
                  <MdFormatListBulletedAdd className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {funding.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
                  No funding sources found.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {funding.map((row) => (
                    <div
                      key={row.id}
                      className="group flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{titleCase(String(row.source_type || "—"))}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Amount: {formatCurrency(Number(row.amount || 0))}
                          {row.loan_id ? ` · Loan: ${row.loan_id}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditFundingRow(apiFundingToForm(row))
                            setEditFundingOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const label = titleCase(String(row.source_type || "Funding"))
                            try {
                              const res = await fetch(`/api/institution/expenses/${expenseId}/funding/${row.id}`, {
                                method: "DELETE",
                              })
                              const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
                              if (!res.ok) {
                                toast({
                                  variant: "destructive",
                                  title: "Funding delete failed",
                                  description: describeExpenseFundingApiError(body),
                                })
                                return
                              }
                              if (editFundingRow?.id === row.id) {
                                setEditFundingOpen(false)
                                setEditFundingRow(null)
                              }
                              await load()
                              toast({ title: "Funding deleted", description: `${label} funding removed successfully.` })
                            } catch (e: unknown) {
                              toast({
                                variant: "destructive",
                                title: "Funding delete failed",
                                description: `${label} could not be deleted. ${String((e as Error)?.message || "Please try again.")}`,
                              })
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Expense cashflows</CardTitle>
            <CardDescription>Payments and settlements linked to this expense</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricCard
                icon={<DollarSign className="h-4 w-4 text-green-600" />}
                label="Total recorded"
                value={formatCurrency(expense?.cashflows_total ?? 0)}
              />
              <MetricCard
                icon={<Banknote className="h-4 w-4 text-blue-600" />}
                label="Funding planned"
                value={formatCurrency(expense?.funding_total ?? 0)}
              />
              <MetricCard
                icon={<Calendar className="h-4 w-4 text-amber-600" />}
                label="Pending"
                value={String(pendingCashflowCount)}
              />
              <MetricCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                label="Settled"
                value={String(completedCashflowCount)}
              />
            </div>

            <DataTable
              key={expenseId}
              columns={cashflowColumns}
              rows={pagedCashflows}
              loading={loading}
              title="Cashflows"
              emptyMessage="No cashflows found"
              getRowId={(row) => row.id}
              renderDetail={(row) => <ExpenseCashflowExpandableContent cashflow={row} />}
              expandedRowIds={expandedCashflowRowIds}
              onToggleExpand={toggleCashflowRowExpand}
              onRowClick={(row) => toggleCashflowRowExpand(row.id)}
              filterFields={cashflowFilterFields}
              tabularFilters={EXPENSE_CASHFLOW_TABULAR_FILTERS}
              tabularFilterField="cashflow_status"
              onQueryParamsChange={(params) => {
                setCashflowFilters(params as Record<string, unknown>)
                setCashflowPage(0)
              }}
              pagination={{
                page: cashflowPage,
                rowsPerPage: cashflowRowsPerPage,
                total: filteredCashflows.length,
                onPageChange: (_e, newPage) => setCashflowPage(newPage),
                onRowsPerPageChange: (e) => {
                  setCashflowRowsPerPage(parseInt(e.target.value, 10))
                  setCashflowPage(0)
                },
                rowsPerPageOptions: [10, 20, 50],
              }}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end border-t pt-4">
          <Button type="button" variant="outline" onClick={() => setRecordCashflowOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record cashflow
          </Button>
        </div>
      </div>

      <AddFunding isOpen={addFundingOpen} expenseId={expenseId} onClose={() => setAddFundingOpen(false)} onSuccess={load} />
      <EditFunding
        isOpen={editFundingOpen}
        expenseId={expenseId}
        funding={editFundingRow}
        onClose={() => {
          setEditFundingOpen(false)
          setEditFundingRow(null)
        }}
        onSuccess={load}
      />
      <RecordExpenseCashflow
        isOpen={recordCashflowOpen}
        expenseId={expenseId}
        onClose={() => setRecordCashflowOpen(false)}
        onSuccess={load}
      />
      <EditExpenseCashflow
        isOpen={editCashflowOpen}
        expenseId={expenseId}
        cashflow={editCashflowRow}
        onClose={() => {
          setEditCashflowOpen(false)
          setEditCashflowRow(null)
        }}
        onSuccess={load}
      />
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-lg bg-muted p-1.5">{icon}</div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}
