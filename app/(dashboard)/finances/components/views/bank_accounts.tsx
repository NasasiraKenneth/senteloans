"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Coins, Edit } from "lucide-react"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import type { FilterField } from "@/components/datatables/TableFilter"
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import EditBankAccount from "../edit/editBankAccount"
import EditAccountAmount from "../edit/editAccountAmount"
import { downloadBankAccountsExport } from "../exports/bank-accounts-export"
import type { BankAccountRow } from "../../types"
import { formatCurrency, formatDate } from "../../utils"

type BankAccountsViewProps = {
  refreshKey?: number
  onRefresh?: () => void
}

export default function BankAccountsView({ refreshKey = 0, onRefresh }: BankAccountsViewProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<BankAccountRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [amountOpen, setAmountOpen] = useState(false)
  const [amountAccountId, setAmountAccountId] = useState<string | null>(null)
  const [canView, setCanView] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canEditAmount, setCanEditAmount] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setCanView(!!body?.permissions?.viewBankAccounts)
      setCanEdit(!!body?.permissions?.editBankAccount)
      setCanEditAmount(!!body?.permissions?.editBankAmount)
      setIsSuperAdmin(!!body?.permissions?.isSuperAdmin)
      setBranchOptions(
        ((body?.permissions?.branches || []) as Array<{ id: string; name: string }>).map((b) => ({
          value: b.id,
          label: b.name,
        })),
      )
    } catch {
      setCanView(false)
      setCanEdit(false)
      setCanEditAmount(false)
      setIsSuperAdmin(false)
      setBranchOptions([])
    }
  }, [])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("rowsPerPage", String(rowsPerPage))
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") params.set(k, String(v))
      })
      const res = await fetch(`/api/institution/finances/bank-accounts?${params.toString()}`, {
        cache: "no-store",
        signal,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load bank accounts")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
      setTotal(Number(body?.total || 0))
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return
      setRows([])
      setTotal(0)
      setError((e as Error)?.message || "Failed to load bank accounts")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, rowsPerPage, activeFilters])

  useEffect(() => {
    void loadPermissions()
  }, [loadPermissions])

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load, refreshKey])

  useEffect(() => {
    if (refreshKey === 0) return
    setPage(0)
  }, [refreshKey])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / rowsPerPage) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [total, rowsPerPage, page])

  const handlePageChange = useCallback((_event: unknown, newPage: number) => {
    setPage(newPage)
  }, [])

  const handleRowsPerPageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const flat: Record<string, string> = {}
    Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        flat[key] = String(value)
      }
    })
    setActiveFilters((prev) => {
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(flat)
      const same =
        prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === flat[k])
      return same ? prev : flat
    })
    setPage(0)
  }, [])

  const filterFields = useMemo<FilterField[]>(() => {
    const fields: FilterField[] = [
      {
        field: "q",
        label: "Search by bank name or account number",
        type: "text",
      },
    ]
    return withBranchFilterFirst(fields, { isSuperAdmin, branchOptions })
  }, [isSuperAdmin, branchOptions])

  const handleEdit = useCallback((row: BankAccountRow) => {
    setEditingId(row.id)
    setEditOpen(true)
  }, [])

  const handleEditAmount = useCallback((row: BankAccountRow) => {
    setAmountAccountId(row.id)
    setAmountOpen(true)
  }, [])

  const columns = useMemo<DataTableColumn<BankAccountRow>[]>(
    () => [
      { key: "bank_name", header: "Bank", render: (r) => <span className="font-medium">{r.bank_name}</span> },
      {
        key: "account",
        header: "Account number",
        render: (r) => <span className="font-mono text-xs">{r.bank_account_number}</span>,
      },
      { key: "total", header: "Total amount", render: (r) => formatCurrency(r.total_amount) },
      { key: "updated", header: "Updated", render: (r) => formatDate(r.updated_at) },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <ActionButtons
            row={row}
            actions={[
              {
                label: "Edit",
                onClick: handleEdit,
                variant: "primary",
                icon: <Edit className="h-4 w-4" />,
                disabled: !canEdit,
              },
              {
                label: "Edit amount",
                onClick: handleEditAmount,
                variant: "view",
                icon: <Coins className="h-4 w-4" />,
                disabled: !canEditAmount,
              },
            ]}
          />
        ),
      },
    ],
    [canEdit, canEditAmount, handleEdit, handleEditAmount],
  )

  const handleEditSuccess = () => {
    void load()
    onRefresh?.()
  }

  const downloadExport = useCallback(
    async (format: "excel" | "pdf") => {
      if (!canView) {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export bank accounts.",
        })
        return
      }
      setExporting(format)
      try {
        await downloadBankAccountsExport(activeFilters, format)
        toast({
          variant: "success",
          title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
          description: `Successfully downloaded bank accounts ${format.toUpperCase()} report.`,
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        if (message === "missing_permission:view_bank_accouts") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to export bank accounts.",
          })
        } else if (message === "no_branch_scope") {
          toast({
            variant: "warning",
            title: "Nothing to export",
            description: "No branches in scope for this export.",
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
    },
    [activeFilters, canView, toast],
  )

  return (
    <div className="relative">
      <DataTable
        title="Bank accounts"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={error || "No bank accounts yet. Use Add bank account to register one."}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        pagination={{
          page,
          rowsPerPage,
          total,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || total === 0 || exporting !== null || !canView,
          pdfDisabled: loading || total === 0 || exporting !== null || !canView,
          excelLoading: exporting === "excel",
          pdfLoading: exporting === "pdf",
        }}
      />
      <EditBankAccount
        isOpen={editOpen}
        accountId={editingId}
        onClose={() => {
          setEditOpen(false)
          setEditingId(null)
        }}
        onSuccess={handleEditSuccess}
      />
      <EditAccountAmount
        isOpen={amountOpen}
        accountId={amountAccountId}
        onClose={() => {
          setAmountOpen(false)
          setAmountAccountId(null)
        }}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}
