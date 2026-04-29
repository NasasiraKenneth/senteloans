"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Mail, Phone, Building2, MapPin } from "lucide-react"
import Tooltip from "@mui/material/Tooltip"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import AddNewClient from "./components/add/addNewClient"
import EditClient from "./components/edit/editClient"
import { downloadClientsExport } from "./export/export"

type ClientRecord = {
  id: string
  name: string
  status: string
  email: string | null
  address: string | null
  phone: string | null
  branch_name?: string | null
  created_at: string
  updated_at: string
}

type ClientFormData = {
  name: string
  status: string
  email: string
  address: string
  phone: string
}

const STATUS_OPTIONS = ["Active", "Inactive", "Suspended"]

function formatDate(iso: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export default function ClientsPage() {
  const { toast } = useToast()
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const permissionToastShown = useRef(false)

  const [clientPermissions, setClientPermissions] = useState({
    viewClients: false,
    createClient: false,
    editClient: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadPermissions() {
    try {
      const res = await fetch("/api/institution/clients/permissions", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setClientPermissions({
        viewClients: !!data?.permissions?.viewClients,
        createClient: !!data?.permissions?.createClient,
        editClient: !!data?.permissions?.editClient,
        isSuperAdmin: !!data?.permissions?.isSuperAdmin,
        branches: (data?.permissions?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })),
      })
    } catch {
      // keep defaults
    }
  }

  async function loadClients(queryParams?: object) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
        })
      }
      params.set("limit", "1000")

      const res = await fetch(`/api/institution/clients?${params.toString()}`, { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403 && body?.error === "missing_permission:view_clients") {
          throw new Error("missing_permission:view_clients")
        }
        throw new Error(body.error || "Failed to load clients")
      }
      setClients(Array.isArray(body.clients) ? body.clients : [])
      permissionToastShown.current = false
    } catch (e: any) {
      const message = e?.message || "Failed to load clients"
      setClients([])
      if (message === "missing_permission:view_clients") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view clients.",
          })
          permissionToastShown.current = true
        }
      } else {
        toast({
          variant: "destructive",
          title: "Failed to load clients",
          description: message,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPermissions()
    loadClients()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized: Record<string, string> = {}
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") normalized[k] = String(v)
    })
    setActiveFilters(normalized)
    loadClients(params)
  }, [])

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!clientPermissions.viewClients) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export clients.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadClientsExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded clients ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_permission:view_clients") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export clients.",
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
  }

  const columns: DataTableColumn<ClientRecord>[] = [
    {
      key: "name",
      header: "Client",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-900">{row.name}</span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Contact",
      render: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <Mail className="h-3.5 w-3.5 text-gray-400" />
            {row.email || "—"}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            {row.phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (row) => (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          <span>{row.address || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusStyles: Record<string, string> = {
          Active: "bg-green-100 text-green-700 border border-green-200",
          Inactive: "bg-gray-100 text-gray-700 border border-gray-200",
          Suspended: "bg-red-100 text-red-700 border border-red-200",
        }
        return <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>{row.status}</div>
      },
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => <span className="text-sm text-gray-700">{formatDate(row.created_at)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={actions} row={row} />,
    },
  ]

  const actions = [
    {
      label: "Edit",
      onClick: (row: ClientRecord) => {
        setEditingClientId(row.id)
        setIsEditOpen(true)
      },
      variant: "primary",
      icon: <Edit className="h-4 w-4" />,
      disabled: !clientPermissions.editClient,
    },
  ]

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      { field: "search", label: "Search by Name, Email or Phone", type: "text" },
      {
        field: "status",
        label: "Status",
        options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
        multiple: false,
        type: "select",
      },
    ]
    return withBranchFilterFirst(fields, {
      isSuperAdmin: clientPermissions.isSuperAdmin,
      branchOptions: clientPermissions.branches,
    })
  }, [clientPermissions.isSuperAdmin, clientPermissions.branches])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-balance">Clients</h2>
          <p className="text-muted-foreground text-pretty">Manage institution clients and organization contacts.</p>
        </div>
        {clientPermissions.createClient ? (
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        ) : (
          <Tooltip title="Missing create_client permission" placement="top" arrow>
            <span className="inline-block cursor-not-allowed">
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </span>
          </Tooltip>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Clients</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{clients.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{clients.filter((c) => c.status === "Active").length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Inactive / Suspended</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{clients.filter((c) => c.status !== "Active").length}</div></CardContent>
        </Card>
      </div>

      <DataTable<ClientRecord>
        columns={columns}
        rows={clients.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
        loading={loading}
        title="Clients"
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || clients.length === 0 || exporting !== null || !clientPermissions.viewClients,
          pdfDisabled: loading || clients.length === 0 || exporting !== null || !clientPermissions.viewClients,
        }}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No clients found"
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: clients.length,
          onPageChange,
          onRowsPerPageChange,
        }}
      />

      <AddNewClient
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={loadClients}
      />

      <EditClient
        isOpen={isEditOpen}
        clientId={editingClientId}
        onClose={() => {
          setIsEditOpen(false)
          setEditingClientId(null)
        }}
        onSuccess={loadClients}
      />
    </div>
  )
}
