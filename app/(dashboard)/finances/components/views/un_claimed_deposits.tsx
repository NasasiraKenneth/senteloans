"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Edit, UserCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import ClaimDeposit from "../edit/claimDeposit"
import EditUnclaimedDeposit from "../edit/editUnclaimedDeposit"
import type { UnclaimedDepositRow } from "../../types"
import { formatCurrency, formatDate, unclaimedStatusBadge } from "../../utils"

type UnclaimedDepositsViewProps = {
  refreshKey?: number
  onRefresh?: () => void
}

export default function UnclaimedDepositsView({ refreshKey = 0, onRefresh }: UnclaimedDepositsViewProps) {
  const [rows, setRows] = useState<UnclaimedDepositRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setCanEdit(!!body?.permissions?.editUnclaimedDeposit)
    } catch {
      setCanEdit(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/institution/finances/unclaimed-deposits", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load unclaimed deposits")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
    } catch (e: unknown) {
      setRows([])
      setError((e as Error)?.message || "Failed to load unclaimed deposits")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPermissions()
  }, [loadPermissions])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

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

  return (
    <>
      <DataTable
        title="Unclaimed deposits"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={error || "No unclaimed deposits. Use Add unclaimed deposit to record one."}
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
