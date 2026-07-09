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
import AddNewAgent from "./components/add/addNewAgent"
import EditAgent from "./components/edit/editAgent"
import { downloadAgentsExport } from "./export/export"

type ThirdPartyAgentRecord = {
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

type AgentFormData = {
  name: string
  status: string
  email: string
  address: string
  phone: string
}

const STATUS_OPTIONS = ["Active", "Inactive", "Suspended"]
const SUPER_ADMIN_READ_ONLY = "Super admins are not allowed to edit or modify data."

function formatDate(iso: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export default function ThirdPartyAgentsPage() {
  const { toast } = useToast()
  const [agents, setAgents] = useState<ThirdPartyAgentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalRows, setTotalRows] = useState(0)
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive_suspended: 0 })
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const permissionToastShown = useRef(false)

  const [agentPermissions, setAgentPermissions] = useState({
    viewThirdPartyAgents: false,
    createThirdPartyAgent: false,
    editThirdPartyAgent: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })

  const canCreateAgent =
    agentPermissions.createThirdPartyAgent && !agentPermissions.isSuperAdmin
  const canEditAgent =
    agentPermissions.editThirdPartyAgent && !agentPermissions.isSuperAdmin

  const createDisabledTooltip = agentPermissions.isSuperAdmin
    ? SUPER_ADMIN_READ_ONLY
    : "Missing create_third_party_agent permission"
  const editDisabledTooltip = agentPermissions.isSuperAdmin
    ? SUPER_ADMIN_READ_ONLY
    : "Missing edit_third_party_agent permission"

  async function loadPermissions() {
    try {
      const res = await fetch("/api/institution/third-party-agents/permissions", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setAgentPermissions({
        viewThirdPartyAgents: !!data?.permissions?.viewThirdPartyAgents,
        createThirdPartyAgent: !!data?.permissions?.createThirdPartyAgent,
        editThirdPartyAgent: !!data?.permissions?.editThirdPartyAgent,
        isSuperAdmin: !!data?.permissions?.isSuperAdmin,
        branches: (data?.permissions?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })),
      })
    } catch {
      // keep defaults
    }
  }

  async function loadAgents(queryParams?: object, pageOverride?: number, rowsOverride?: number) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
        })
      }
      const currentPage = pageOverride ?? page
      const currentRows = rowsOverride ?? rowsPerPage
      params.set("page", String(currentPage))
      params.set("rowsPerPage", String(currentRows))

      const res = await fetch(`/api/institution/third-party-agents?${params.toString()}`, { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403 && body?.error === "missing_permission:view_third_party_agents") {
          throw new Error("missing_permission:view_third_party_agents")
        }
        throw new Error(body.error || "Failed to load third party agents")
      }
      setAgents(Array.isArray(body?.third_party_agents) ? body.third_party_agents as ThirdPartyAgentRecord[] : [])
      setTotalRows(Number(body?.pagination?.total) || 0)
      setSummary({
        total: Number(body?.summary?.total) || 0,
        active: Number(body?.summary?.active) || 0,
        inactive_suspended: Number(body?.summary?.inactive_suspended) || 0,
      })
      permissionToastShown.current = false
    } catch (e: any) {
      const message = e?.message || "Failed to load third party agents"
      setAgents([])
      if (message === "missing_permission:view_third_party_agents") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view third party agents.",
          })
          permissionToastShown.current = true
        }
      } else {
        toast({
          variant: "destructive",
          title: "Failed to load third party agents",
          description: message,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPermissions()
    loadAgents()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized: Record<string, string> = {}
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") normalized[k] = String(v)
    })
    setActiveFilters(normalized)
    setPage(0)
    loadAgents(params, 0, rowsPerPage)
  }, [rowsPerPage])

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage)
    loadAgents(activeFilters, newPage, rowsPerPage)
  }

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRows = parseInt(e.target.value, 10)
    setPage(0)
    setRowsPerPage(nextRows)
    loadAgents(activeFilters, 0, nextRows)
  }

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!agentPermissions.viewThirdPartyAgents) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export third party agents.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadAgentsExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded third party agents ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_permission:view_third_party_agents") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export third party agents.",
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

  const columns: DataTableColumn<ThirdPartyAgentRecord>[] = [
    {
      key: "name",
      header: "Agent",
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
      onClick: (row: ThirdPartyAgentRecord) => {
        setEditingAgentId(row.id)
        setIsEditOpen(true)
      },
      variant: "primary",
      icon: <Edit className="h-4 w-4" />,
      disabled: !canEditAgent,
      disabledTooltip: editDisabledTooltip,
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
      isSuperAdmin: agentPermissions.isSuperAdmin,
      branchOptions: agentPermissions.branches,
    })
  }, [agentPermissions.isSuperAdmin, agentPermissions.branches])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-balance">Third Party Agents</h2>
          <p className="text-muted-foreground text-pretty">Manage external organizations, partners, and contacts.</p>
        </div>
        {canCreateAgent ? (
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        ) : (
          <Tooltip title={createDisabledTooltip} placement="top" arrow>
            <span className="inline-block cursor-not-allowed">
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                Add Agent
              </Button>
            </span>
          </Tooltip>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Agents</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.active}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Inactive / Suspended</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.inactive_suspended}</div></CardContent>
        </Card>
      </div>

      <DataTable<ThirdPartyAgentRecord>
        columns={columns}
        rows={agents}
        loading={loading}
        title="Third Party Agents"
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || totalRows === 0 || exporting !== null || !agentPermissions.viewThirdPartyAgents,
          pdfDisabled: loading || totalRows === 0 || exporting !== null || !agentPermissions.viewThirdPartyAgents,
        }}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No third party agents found"
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
        }}
      />

      <AddNewAgent
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadAgents(activeFilters, page, rowsPerPage)}
      />

      <EditAgent
        isOpen={isEditOpen}
        agentId={editingAgentId}
        onClose={() => {
          setIsEditOpen(false)
          setEditingAgentId(null)
        }}
        onSuccess={() => loadAgents(activeFilters, page, rowsPerPage)}
      />
    </div>
  )
}
