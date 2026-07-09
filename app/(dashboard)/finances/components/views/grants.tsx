"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Edit, Wallet } from "lucide-react"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import type { FilterField } from "@/components/datatables/TableFilter"
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import EditGrant from "../edit/editGrant"
import EditGrantAmount from "../edit/editGrantAmount"
import { downloadGrantsExport } from "../exports/grants-export"
import type { GrantRow } from "../../types"
import { formatCurrency, formatDate } from "../../utils"

type GrantsViewProps = {
  refreshKey?: number
  onRefresh?: () => void
}

export default function GrantsView({ refreshKey = 0, onRefresh }: GrantsViewProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<GrantRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [amountOpen, setAmountOpen] = useState(false)
  const [amountId, setAmountId] = useState<string | null>(null)
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
      setCanView(!!body?.permissions?.viewGrants)
      setCanEdit(!!body?.permissions?.editGrant)
      setCanEditAmount(!!body?.permissions?.editGrantAmount)
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
      const res = await fetch(`/api/institution/finances/grants?${params.toString()}`, {
        cache: "no-store",
        signal,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load grants")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
      setTotal(Number(body?.total || 0))
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return
      setRows([])
      setTotal(0)
      setError((e as Error)?.message || "Failed to load grants")
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
      if (
        value &&
        typeof value === "object" &&
        "start" in (value as Record<string, unknown>) &&
        "end" in (value as Record<string, unknown>)
      ) {
        const range = value as { start?: string; end?: string }
        const start = range.start ? String(range.start).slice(0, 10) : ""
        const end = range.end ? String(range.end).slice(0, 10) : ""
        if (key === "created_at") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat.created_from = start
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat.created_to = end
        } else if (key === "updated_at") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat.updated_from = start
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat.updated_to = end
        }
        return
      }
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
      { field: "q", label: "Search by third party agent name", type: "text" },
      { field: "created_at", label: "Created at", type: "date-range" },
      { field: "updated_at", label: "Updated at", type: "date-range" },
    ]
    return withBranchFilterFirst(fields, { isSuperAdmin, branchOptions })
  }, [isSuperAdmin, branchOptions])

  const handleEdit = useCallback((row: GrantRow) => {
    setEditingId(row.id)
    setEditOpen(true)
  }, [])

  const handleEditAmount = useCallback((row: GrantRow) => {
    setAmountId(row.id)
    setAmountOpen(true)
  }, [])

  const isComplete = (row: GrantRow) => row.total_amount > 0 && row.available_balance >= row.total_amount

  const columns = useMemo<DataTableColumn<GrantRow>[]>(
    () => [
      { key: "third_party_agent", header: "Third party agent", render: (r) => <span className="font-medium">{r.third_party_agent_name}</span> },
      { key: "total", header: "Total grant", render: (r) => formatCurrency(r.total_amount) },
      { key: "available", header: "Available", render: (r) => formatCurrency(r.available_balance) },
      {
        key: "percentage_received",
        header: "Percentage received",
        render: (r) => <span className="text-sm text-muted-foreground">{r.percentage_received}%</span>,
      },
      {
        key: "remaining",
        header: "Remaining amount",
        render: (r) => formatCurrency(r.remaining_amount),
      },
      { key: "created", header: "Created at", render: (r) => formatDate(r.created_at) },
      { key: "updated", header: "Updated", render: (r) => formatDate(r.updated_at) },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <ActionButtons
            row={row}
            actions={[
              {
                label: "Edit amount",
                onClick: handleEditAmount,
                variant: "view",
                icon: <Wallet className="h-4 w-4" />,
                disabled: (row) => !canEditAmount || isComplete(row),
              },
              {
                label: "Edit",
                onClick: handleEdit,
                variant: "primary",
                icon: <Edit className="h-4 w-4" />,
                disabled: true,
              },
            ]}
          />
        ),
      },
    ],
    [canEditAmount, handleEdit, handleEditAmount],
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
          description: "You do not have permission to export grants.",
        })
        return
      }
      setExporting(format)
      try {
        await downloadGrantsExport(activeFilters, format)
        toast({
          variant: "success",
          title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
          description: `Successfully downloaded grants ${format.toUpperCase()} report.`,
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        if (message === "missing_permission:view_grants") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to export grants.",
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
    <>
      <DataTable
        title="Grants"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={error || "No grants yet. Use Add grant to create one for a third party agent."}
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
      <EditGrant
        isOpen={editOpen}
        grantId={editingId}
        onClose={() => {
          setEditOpen(false)
          setEditingId(null)
        }}
        onSuccess={handleEditSuccess}
      />
      <EditGrantAmount
        isOpen={amountOpen}
        grantId={amountId}
        onClose={() => {
          setAmountOpen(false)
          setAmountId(null)
        }}
        onSuccess={handleEditSuccess}
      />
    </>
  )
}
