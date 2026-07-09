"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Edit, UserCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import type { FilterField } from "@/components/datatables/TableFilter"
import type { Filter } from "@/types"
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import ClaimDeposit from "../edit/claimDeposit"
import EditUnclaimedDeposit from "../edit/editUnclaimedDeposit"
import UnclaimedDepositExpandableContent from "./UnclaimedDepositExpandableContent"
import { downloadUnclaimedDepositsExport } from "../exports/unclaimed-deposits-export"
import type { UnclaimedDepositRow } from "../../types"
import { formatCurrency, formatDate, unclaimedStatusBadge } from "../../utils"

type UnclaimedDepositsViewProps = {
  refreshKey?: number
  onRefresh?: () => void
}

export default function UnclaimedDepositsView({ refreshKey = 0, onRefresh }: UnclaimedDepositsViewProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<UnclaimedDepositRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [canView, setCanView] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set())
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  const toggleRowExpand = useCallback((rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }, [])

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setCanView(!!body?.permissions?.viewUnclaimedDeposits)
      setCanEdit(!!body?.permissions?.editUnclaimedDeposit)
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
      const res = await fetch(`/api/institution/finances/unclaimed-deposits?${params.toString()}`, {
        cache: "no-store",
        signal,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load unclaimed deposits")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
      setTotal(Number(body?.total || 0))
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return
      setRows([])
      setTotal(0)
      setError((e as Error)?.message || "Failed to load unclaimed deposits")
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
        if (key === "date") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat.date_from = start
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat.date_to = end
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
      {
        field: "q",
        label: "Search by deposit #, reference, or assigned to",
        type: "text",
      },
      {
        field: "assigned_type",
        label: "Assigned to",
        options: [
          { value: "", label: "All" },
          { value: "Member", label: "Members" },
          { value: "Third Party Agent", label: "Third Party Agents" },
        ],
        multiple: false,
        type: "select",
      },
      { field: "date", label: "Deposit date", type: "date-range" },
    ]
    return withBranchFilterFirst(fields, { isSuperAdmin, branchOptions })
  }, [isSuperAdmin, branchOptions])

  const statusFilters = useMemo<Filter[]>(
    () => [
      { label: "All", value: "" },
      { label: "Unclaimed", value: "unclaimed" },
      { label: "Claimed", value: "claimed" },
    ],
    [],
  )

  const handleEdit = useCallback((row: UnclaimedDepositRow) => {
    setEditingId(row.id)
    setEditOpen(true)
  }, [])

  const handleClaim = useCallback((row: UnclaimedDepositRow) => {
    setClaimingId(row.id)
    setClaimOpen(true)
  }, [])

  const isUnclaimed = (row: UnclaimedDepositRow) => row.status.trim().toLowerCase() === "unclaimed"

  const columns = useMemo<DataTableColumn<UnclaimedDepositRow>[]>(
    () => [
      {
        key: "deposit_number",
        header: "Deposit #",
        render: (r) => (
          <span className="font-mono text-xs">{r.unclaimed_deposit_number || "—"}</span>
        ),
      },
      { key: "txn", header: "Reference", render: (r) => r.transaction_number || "—" },
      { key: "date", header: "Date", render: (r) => formatDate(r.date) },
      {
        key: "assigned",
        header: "Assigned to",
        render: (r) => (
          <div className="flex flex-col gap-0.5">
            <span>{r.assigned_to}</span>
            <span className="text-xs text-muted-foreground">{r.assigned_type}</span>
          </div>
        ),
      },
      { key: "mode", header: "Mode", render: (r) => r.mode },
      { key: "amount", header: "Amount", render: (r) => formatCurrency(r.amount) },
      {
        key: "status",
        header: "Status",
        render: (r) => (
          <Badge className={unclaimedStatusBadge(r.status)} variant="outline">
            {r.status}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <ActionButtons
            row={row}
            actions={[
              {
                label: "Claim",
                onClick: handleClaim,
                variant: "view",
                icon: <UserCheck className="h-4 w-4" />,
                disabled: (row) => !canEdit || !isUnclaimed(row),
              },
              {
                label: "Edit",
                onClick: handleEdit,
                variant: "primary",
                icon: <Edit className="h-4 w-4" />,
                disabled: (row) => !canEdit || !isUnclaimed(row),
              },
            ]}
          />
        ),
      },
    ],
    [canEdit, handleEdit, handleClaim],
  )

  const handleRefresh = () => {
    void load()
    onRefresh?.()
  }

  const downloadExport = useCallback(
    async (format: "excel" | "pdf") => {
      if (!canView) {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export unclaimed deposits.",
        })
        return
      }
      setExporting(format)
      try {
        await downloadUnclaimedDepositsExport(activeFilters, format)
        toast({
          variant: "success",
          title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
          description: `Successfully downloaded unclaimed deposits ${format.toUpperCase()} report.`,
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        if (message === "missing_permission:view_unclaimed_deposits") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to export unclaimed deposits.",
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
        title="Unclaimed deposits"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={error || "No unclaimed deposits. Use Add unclaimed deposit to record one."}
        renderDetail={(row) => <UnclaimedDepositExpandableContent deposit={row} />}
        expandedRowIds={expandedRowIds}
        onToggleExpand={toggleRowExpand}
        onRowClick={(row) => toggleRowExpand(row.id)}
        filterFields={filterFields}
        tabularFilters={statusFilters}
        tabularFilterField="status"
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
      <EditUnclaimedDeposit
        isOpen={editOpen}
        depositId={editingId}
        onClose={() => {
          setEditOpen(false)
          setEditingId(null)
        }}
        onSuccess={handleRefresh}
      />
      <ClaimDeposit
        isOpen={claimOpen}
        depositId={claimingId}
        onClose={() => {
          setClaimOpen(false)
          setClaimingId(null)
        }}
        onSuccess={handleRefresh}
      />
    </>
  )
}
