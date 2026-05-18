"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"
import type { GrantRow } from "../../types"
import { formatCurrency, formatDate } from "../../utils"

type GrantsViewProps = {
  refreshKey?: number
}

export default function GrantsView({ refreshKey = 0 }: GrantsViewProps) {
  const [rows, setRows] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/institution/finances/grants", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load grants")
      }
      setRows(Array.isArray(body?.rows) ? body.rows : [])
    } catch (e: unknown) {
      setRows([])
      setError((e as Error)?.message || "Failed to load grants")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const columns = useMemo<DataTableColumn<GrantRow>[]>(
    () => [
      { key: "client", header: "Client", render: (r) => <span className="font-medium">{r.client_name}</span> },
      { key: "branch", header: "Branch", render: (r) => r.branch_name || "—" },
      { key: "total", header: "Total grant", render: (r) => formatCurrency(r.total_amount) },
      { key: "available", header: "Available", render: (r) => formatCurrency(r.available_balance) },
      {
        key: "utilized",
        header: "Utilized",
        render: (r) => {
          const used = Math.max(0, r.total_amount - r.available_balance)
          const pct = r.total_amount > 0 ? Math.round((used / r.total_amount) * 100) : 0
          return (
            <span className="text-sm text-muted-foreground">
              {formatCurrency(used)} ({pct}%)
            </span>
          )
        },
      },
      { key: "updated", header: "Updated", render: (r) => formatDate(r.updated_at) },
    ],
    [],
  )

  return (
    <DataTable
      title="Grants"
      columns={columns}
      rows={rows}
      loading={loading}
      emptyMessage={error || "No grants yet. Use Add grant to create one for a client."}
    />
  )
}
