"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Edit } from "lucide-react"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import EditBankAccount from "../edit/editBankAccount"
import type { BankAccountRow } from "../../types"
import { formatCurrency, formatDate } from "../../utils"

type BankAccountsViewProps = {
  refreshKey?: number
  onRefresh?: () => void
}

export default function BankAccountsView({ refreshKey = 0, onRefresh }: BankAccountsViewProps) {
  const [rows, setRows] = useState<BankAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setCanEdit(!!body?.permissions?.editBankAccount)
    } catch {
      setCanEdit(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/institution/finances/bank-accounts", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load bank accounts")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
    } catch (e: unknown) {
      setRows([])
      setError((e as Error)?.message || "Failed to load bank accounts")
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

  const handleEdit = useCallback((row: BankAccountRow) => {
    setEditingId(row.id)
    setEditOpen(true)
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
            ]}
          />
        ),
      },
    ],
    [canEdit, handleEdit],
  )

  const handleEditSuccess = () => {
    void load()
    onRefresh?.()
  }

  return (
    <>
      <DataTable
        title="Bank accounts"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={error || "No bank accounts yet. Use Add bank account to register one."}
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
    </>
  )
}
