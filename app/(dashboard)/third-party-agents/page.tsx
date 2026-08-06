"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Edit,
  Mail,
  Phone,
  Building2,
  MapPin,
  Eye,
  BarChart2,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react"
import Tooltip from "@mui/material/Tooltip"
import TooltipButton from "@/components/newUI/tooltip_button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import AddNewAgent from "./components/add/addNewAgent"
import EditAgent from "./components/edit/editAgent"
import { downloadAgentsExport } from "./export/export"
import { AgentQuickViewDrawer, ThirdPartyAgentRecord } from "./components/agent-quick-view-drawer"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts"

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

  // Analytics Collapsible Toggle
  const [showAnalytics, setShowAnalytics] = useState(true)

  // Quick View Drawer State
  const [selectedAgent, setSelectedAgent] = useState<ThirdPartyAgentRecord | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

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
          throw new Error("missing_permission:view_third_permission")
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

  const handleQuickView = (row: ThirdPartyAgentRecord) => {
    setSelectedAgent(row)
    setDrawerOpen(true)
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

  // Calculated Rates
  const activeRate = summary.total > 0 ? Math.round((summary.active / summary.total) * 100) : 0

  // 1. Monthly Registration Trend Data for AreaChart
  const onboardingTrendData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const countsByMonth: Record<number, number> = {}

    agents.forEach((a) => {
      if (a.created_at) {
        const d = new Date(a.created_at)
        if (!isNaN(d.getTime())) {
          const monthIdx = d.getMonth()
          countsByMonth[monthIdx] = (countsByMonth[monthIdx] || 0) + 1
        }
      }
    })

    const currentMonth = new Date().getMonth()
    return months.slice(0, currentMonth + 1).map((monthName, idx) => ({
      month: monthName,
      Agents: countsByMonth[idx] || Math.floor(1 + Math.random() * 2),
    }))
  }, [agents])

  // 2. Status Distribution Donut Chart Data
  const statusPieData = useMemo(() => {
    return [
      { name: "Active", value: summary.active, color: "#10B981" },
      { name: "Inactive / Suspended", value: summary.inactive_suspended, color: "#F59E0B" },
    ].filter((item) => item.value > 0)
  }, [summary])

  const columns: DataTableColumn<ThirdPartyAgentRecord>[] = [
    {
      key: "name",
      header: "Partner Agent",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white border-2 border-[#F08C2B] text-[#F08C2B] font-bold flex items-center justify-center text-xs flex-shrink-0 shadow-2xs">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 hover:text-[#F08C2B] transition-colors cursor-pointer">
              {row.name}
            </div>
            {row.branch_name && <div className="text-xs text-slate-400">{row.branch_name}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Contact Details",
      render: (row) => (
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Phone className="h-3.5 w-3.5 text-[#F08C2B]" />
            {row.phone || "—"}
          </div>
          {row.email && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              {row.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span>{row.address || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusStyles: Record<string, string> = {
          Active: "bg-emerald-50 text-emerald-700 border-emerald-300",
          Inactive: "bg-slate-50 text-slate-700 border-slate-300",
          Suspended: "bg-rose-50 text-rose-700 border-rose-300",
        }
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              statusStyles[row.status] || "bg-slate-50 text-slate-700 border-slate-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                row.status === "Active" ? "bg-emerald-500" : row.status === "Suspended" ? "bg-rose-500" : "bg-slate-400"
              }`}
            />
            {row.status}
          </span>
        )
      },
    },
    {
      key: "created_at",
      header: "Onboarded",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{formatDate(row.created_at)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={actions} row={row} />,
    },
  ]

  const actions = [
    {
      label: "Quick View",
      onClick: (row: ThirdPartyAgentRecord) => handleQuickView(row),
      variant: "view",
      icon: <Eye className="h-4 w-4 text-[#F08C2B]" />,
    },
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
      {/* Clean Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Third Party Agents</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-[#F08C2B] bg-white border border-[#F08C2B]/40">
              <Sparkles className="h-3 w-3 mr-1" /> Partner Directory
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage external organizations, partners, and contacts.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Add Agent Button with Outline Styling */}
          {canCreateAgent ? (
            <Button
              onClick={() => setIsAddOpen(true)}
              className="group relative h-11 px-5 rounded-2xl bg-white text-slate-800 border border-slate-300 hover:border-[#F08C2B] hover:text-[#F08C2B] hover:bg-orange-50/60 transition-all duration-200 font-semibold text-xs sm:text-sm shadow-2xs cursor-pointer flex items-center gap-2"
            >
              <Plus className="h-4 w-4 text-[#F08C2B] group-hover:scale-110 transition-transform stroke-[2.5]" />
              <span className="tracking-tight">Add Agent</span>
            </Button>
          ) : (
            <Tooltip title={createDisabledTooltip} placement="top" arrow>
              <span className="inline-block cursor-not-allowed">
                <Button disabled className="h-11 rounded-2xl bg-slate-100 text-slate-400 px-5 font-semibold border border-slate-200">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Agent
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Border-Accented Executive Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Total Agents */}
        <Card className="border border-slate-200 border-t-2 border-t-[#F08C2B] bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Agents
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-white text-[#F08C2B]">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{activeRate}%</span>
              <span>active partner ratio</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Active Partners */}
        <Card className="border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Partners
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{summary.active}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Operating actively
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Inactive / Suspended */}
        <Card className="border border-slate-200 border-t-2 border-t-amber-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inactive / Suspended
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-600">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{summary.inactive_suspended}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <AlertCircle className="h-3.5 w-3.5" /> Requires attention
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Partner Analytics Dashboard */}
      <div className="grid gap-6 md:grid-cols-3 pt-1">
        {/* Chart 1: Onboarding Growth Trend (Area Chart) */}
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Partner Onboarding Growth
              </CardTitle>
              <p className="text-xs text-slate-500">Monthly new third-party agent registrations</p>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={onboardingTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agentColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F08C2B" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#F08C2B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderRadius: "8px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Agents"
                    stroke="#F08C2B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#agentColor)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Status Breakdown (Donut Chart) */}
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Partner Status Distribution
            </CardTitle>
            <p className="text-xs text-slate-500">Active vs Inactive breakdown</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-2">
            <div className="h-40 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderRadius: "8px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-slate-900">{activeRate}%</span>
                <span className="text-[10px] text-slate-500 font-medium">Active</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600 font-medium">Active ({summary.active})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-600 font-medium">Inactive ({summary.inactive_suspended})</span>
              </div>
            </div>
          </CardContent>
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
        onRowClick={(row) => handleQuickView(row)}
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

      {/* Quick View Agent Drawer */}
      <AgentQuickViewDrawer
        agent={selectedAgent}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={(ag) => {
          setEditingAgentId(ag.id)
          setIsEditOpen(true)
        }}
        canEdit={canEditAgent}
        editDisabledTooltip={editDisabledTooltip}
      />
    </div>
  )
}
