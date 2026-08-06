"use client"

import React, { useState, useEffect, useMemo } from "react"
import { SlideModal } from "@/components/modals/slide-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { Filter } from "@/types"
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  UserCheck,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  Loader2,
  CreditCard,
  MessageSquare,
  Smartphone,
  GitBranch,
  Users,
  TrendingUp,
  Search,
  Calendar,
  Sparkles,
  Plus,
  Edit,
  Pencil,
  Power,
  X,
} from "lucide-react"
import EditInstitutionModal from "./edit/edit"
import AddNewBranchModal from "./add/newBranch"
import EditBranchModal from "./edit/editBranch"
import { AddNewAdminModal } from "./add/newAdmin"
import { EditAdminModal } from "./edit/editAdmin"
import { BranchEmailSettingsModal } from "./edit/emailSettingsModal"
import StyledSelect from "@/components/newUI/styled_select"
import Tooltip from "@mui/material/Tooltip"
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

interface InstitutionDetailsDrawerProps {
  isOpen: boolean
  onClose: () => void
  institutionId: string | null
  initialData?: any
  onInstitutionUpdated?: () => void | Promise<void>
}

function getInitials(name: string) {
  if (!name) return "INS"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export function InstitutionDetailsDrawer({
  isOpen,
  onClose,
  institutionId,
  initialData,
  onInstitutionUpdated,
}: InstitutionDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "branches" | "admins" | "config">("overview")
  const [details, setDetails] = useState<any>(initialData || null)
  const [branches, setBranches] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [branchSearch, setBranchSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState<"ALL" | "HEAD_OFFICE" | "SUB_BRANCH">("ALL")
  const [editingBranch, setEditingBranch] = useState<any | null>(null)
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null)
  const [togglingStatus, setTogglingStatus] = useState(false)

  // Branch Configs & Modules state
  const [branchConfigs, setBranchConfigs] = useState<any[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(false)
  const [togglingConfig, setTogglingConfig] = useState<string | null>(null)
  const [editingEmailBranch, setEditingEmailBranch] = useState<any | null>(null)
  const [configBranchFilter, setConfigBranchFilter] = useState<string>("ALL")
  const [editableBranchConfigIds, setEditableBranchConfigIds] = useState<Record<string, boolean>>({})

  const toggleBranchConfigEdit = (branchId: string) => {
    setEditableBranchConfigIds((prev) => ({
      ...prev,
      [branchId]: !prev[branchId],
    }))
  }

  const fetchBranchConfigs = async () => {
    if (!institutionId) return
    try {
      setLoadingConfigs(true)
      const res = await fetch(`/api/admin/institutions/${institutionId}/config`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.configs)) {
          setBranchConfigs(data.configs)
        }
      }
    } catch (err) {
      console.error("Failed to load branch configs:", err)
    } finally {
      setLoadingConfigs(false)
    }
  }

  const handleToggleModule = async (branchId: string, moduleName: string, currentEnabled: boolean) => {
    try {
      setTogglingConfig(`${branchId}-${moduleName}`)
      const res = await fetch(`/api/admin/institutions/${institutionId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_module",
          branch_id: branchId,
          module: moduleName,
          enabled: !currentEnabled,
        }),
      })
      if (res.ok) {
        await fetchBranchConfigs()
      }
    } catch (err) {
      console.error("Failed to toggle module:", err)
    } finally {
      setTogglingConfig(null)
    }
  }

  const handleToggleEmailActive = async (branchId: string, currentActive: boolean) => {
    try {
      setTogglingConfig(`${branchId}-email`)
      const res = await fetch(`/api/admin/institutions/${institutionId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_email_active",
          branch_id: branchId,
          enabled: !currentActive,
        }),
      })
      if (res.ok) {
        await fetchBranchConfigs()
      }
    } catch (err) {
      console.error("Failed to toggle email active:", err)
    } finally {
      setTogglingConfig(null)
    }
  }

  // Admin Accounts DataTable Pagination & Filter States
  const [adminPage, setAdminPage] = useState(0)
  const [adminRowsPerPage, setAdminRowsPerPage] = useState(10)
  const [adminQueryParams, setAdminQueryParams] = useState<Record<string, any>>({})

  // Table actions configuration
  const actions = useMemo(
    () => [
      {
        label: "Edit",
        onClick: (row: any) => setEditingAdmin(row),
        variant: "primary" as const,
        icon: <Edit className="h-4 w-4" />,
      },
    ],
    []
  )

  const adminColumns: DataTableColumn<any>[] = useMemo(
    () => [
      {
        key: "user",
        header: "Admin User",
        render: (row) => (
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-full bg-amber-50 text-[#f08c2b] font-bold text-xs flex items-center justify-center border border-amber-200 shrink-0">
              {getInitials(row.full_name || row.email || "Admin")}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate">{row.full_name || "Admin User"}</p>
              {row.username && <p className="text-xs text-gray-400 font-mono">@{row.username}</p>}
            </div>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-gray-700">
            <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{row.email || "—"}</span>
          </div>
        ),
      },
      {
        key: "phone_number",
        header: "Phone",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-gray-700">
            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{row.phone_number || "—"}</span>
          </div>
        ),
      },
      {
        key: "role",
        header: "Role",
        render: (row) => (
          <Badge variant="outline" className="bg-amber-50/80 text-[#f08c2b] border-amber-200 text-xs font-medium">
            {row.role_name || row.role || "Admin"}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const status = row.status || "Active"
          const isActive = status.toLowerCase() === "active"
          return (
            <Badge
              className={`text-xs ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {status}
            </Badge>
          )
        },
      },
      {
        key: "created_at",
        header: "Joined",
        render: (row) => (
          <span className="text-xs text-gray-600">
            {row.created_at
              ? new Date(row.created_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => <div className="flex justify-center"><ActionButtons actions={actions} row={row} /></div>,
      },
    ],
    [actions]
  )

  const adminFilterFields: FilterField[] = useMemo(
    () => [
      {
        field: "search",
        label: "Search name, email, username...",
        type: "text"
      },
    ],
    []
  )

  const adminTabularFilters: Filter[] = useMemo(
    () => [
      { label: "All Statuses", value: "" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
    []
  )

  const filteredAdmins = useMemo(() => {
    let list = [...admins]
    const search = adminQueryParams.search?.toString().toLowerCase().trim()
    const statusFilter = adminQueryParams.status?.toString().toLowerCase().trim()

    if (search) {
      list = list.filter(
        (a) =>
          (a.full_name && a.full_name.toLowerCase().includes(search)) ||
          (a.email && a.email.toLowerCase().includes(search)) ||
          (a.username && a.username.toLowerCase().includes(search))
      )
    }

    if (statusFilter) {
      list = list.filter((a) => (a.status || "active").toLowerCase() === statusFilter)
    }

    return list
  }, [admins, adminQueryParams])

  const paginatedAdmins = useMemo(() => {
    const start = adminPage * adminRowsPerPage
    return filteredAdmins.slice(start, start + adminRowsPerPage)
  }, [filteredAdmins, adminPage, adminRowsPerPage])

  const handleToggleStatus = async () => {
    if (!institutionId || !details) return
    const newStatus = details.status === "Active" ? "Inactive" : "Active"

    try {
      setTogglingStatus(true)
      const res = await fetch(`/api/admin/institutions/${institutionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status")
      }

      await fetchFullDetails()
      if (onInstitutionUpdated) onInstitutionUpdated()
    } catch (err: any) {
      console.error("Failed to toggle institution status:", err)
      alert(err.message || "Failed to update institution status")
    } finally {
      setTogglingStatus(false)
    }
  }

  const [analytics, setAnalytics] = useState<any>({
    branchesCount: 0,
    membersCount: 0,
    staffUsersCount: 0,
    avgMonthlyMessages: 0,
    monthlyGrowth: [],
  })
  const [loading, setLoading] = useState(false)

  const fetchFullDetails = async () => {
    if (!institutionId) return
    try {
      setLoading(true)
      // Fetch institution detail + analytics + branches
      const res = await fetch(`/api/admin/institutions/${institutionId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.institution) setDetails(data.institution)
        if (Array.isArray(data.branches)) setBranches(data.branches)
        if (data.analytics) setAnalytics(data.analytics)
      }

      // Fetch admin users
      const adminRes = await fetch(`/api/admin/institutions/${institutionId}/admins`)
      if (adminRes.ok) {
        const adminData = await adminRes.json()
        if (Array.isArray(adminData.admins)) {
          setAdmins(adminData.admins)
        }
      }
    } catch (err) {
      console.error("Failed to load institution details:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialData) {
      setDetails(initialData)
    }
  }, [initialData])

  useEffect(() => {
    if (isOpen && institutionId) {
      fetchFullDetails()
    }
  }, [isOpen, institutionId])

  useEffect(() => {
    if (isOpen && institutionId && activeTab === "config") {
      fetchBranchConfigs()
    }
  }, [isOpen, institutionId, activeTab])

  if (!isOpen) return null

  const maxGrowthValue = Math.max(
    ...((analytics.monthlyGrowth as any[])?.flatMap((g) => [g.members, g.messages]) || [10]),
    10
  )

  // Filtered branches list
  const filteredBranches = branches.filter((br) => {
    const matchesSearch =
      !branchSearch.trim() ||
      br.name?.toLowerCase().includes(branchSearch.toLowerCase()) ||
      br.branch_code?.toLowerCase().includes(branchSearch.toLowerCase()) ||
      br.address?.toLowerCase().includes(branchSearch.toLowerCase())

    const isHead = br.branch_type?.toLowerCase().includes("head")
    if (branchFilter === "HEAD_OFFICE") return matchesSearch && isHead
    if (branchFilter === "SUB_BRANCH") return matchesSearch && !isHead
    return matchesSearch
  })

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={onClose}
      title={details?.name || "Institution Details"}
      size="full"
    >
      <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
        {/* Fixed Hero Banner & Top Header */}
        <div className="bg-white px-8 py-5 border-b border-gray-200 space-y-4 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-100 via-amber-50 to-orange-100 text-[#f08c2b] font-extrabold text-2xl flex items-center justify-center border border-orange-200 shadow-sm flex-shrink-0">
                {getInitials(details?.name || "")}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight leading-snug">
                  {details?.name || "Loading..."}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={`text-xs uppercase font-bold px-2.5 py-0.5 rounded-full ${
                      details?.type === "SACCO"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-purple-50 text-purple-700 border-purple-200"
                    }`}
                  >
                    {details?.type || "SACCO"}
                  </Badge>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      details?.status === "Active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {details?.status || "Active"}
                  </span>
                </div>
              </div>
            </div>

            {details && (
              <div className="flex items-center space-x-3">
                {details.status === "Active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={togglingStatus}
                    onClick={handleToggleStatus}
                    className="border-red-200 bg-red-50/60 text-red-600 hover:bg-red-100 hover:text-red-700 font-semibold text-xs rounded-xl shadow-2xs gap-2 px-4 py-2"
                  >
                    {togglingStatus ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5 text-red-500" />
                    )}
                    Deactivate Institution
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={togglingStatus}
                    onClick={handleToggleStatus}
                    className="border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 font-semibold text-xs rounded-xl shadow-2xs gap-2 px-4 py-2"
                  >
                    {togglingStatus ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    Activate Institution
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 4 KPI Analytics Cards Row (Fixed at Top) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Branches</p>
                <h4 className="text-lg font-bold text-gray-900 mt-0.5">
                  {analytics.branchesCount || branches.length || 1}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#f08c2b] flex items-center justify-center">
                <GitBranch className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {details?.type === "SACCO" ? "Members" : "Clients"}
                </p>
                <h4 className="text-lg font-bold text-blue-600 mt-0.5">
                  {analytics.membersCount || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Staff</p>
                <h4 className="text-lg font-bold text-emerald-600 mt-0.5">
                  {analytics.staffUsersCount || admins.length || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Avg. Monthly Messages</p>
                <h4 className="text-lg font-bold text-purple-600 mt-0.5">
                  {analytics.avgMonthlyMessages || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <MessageSquare className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Body Layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 md:p-8 gap-6 w-full">
          {/* LEFT COLUMN: Basic Info & Primary Branch Cards */}
          <div className="w-full lg:w-[320px] xl:w-[340px] flex-shrink-0 flex flex-col gap-4 h-9/10 overflow-y-auto pr-1 pb-4">
            {/* Basic Information Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#f08c2b]" />
                Basic Information
              </h3>

              <div className="space-y-2.5 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Registration Number</p>
                  <p className="font-semibold text-gray-900 font-mono">
                    {details?.registration_number || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">License Number</p>
                  <p className="font-semibold text-gray-900 font-mono">
                    {details?.license_number || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Website</p>
                  <p className="font-semibold text-gray-900 truncate">
                    {details?.website ? (
                      <a
                        href={details.website.startsWith("http") ? details.website : `https://${details.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {details.website}
                        <Globe className="h-3 w-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Registration Date</p>
                  <p className="font-medium text-gray-900">
                    {details?.created_at ? new Date(details.created_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Branch Details Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#f08c2b]" />
                  Primary Branch Details
                </h3>
                {details?.branch_code && (
                  <Badge variant="outline" className="text-[10px] font-mono bg-orange-50 text-[#f08c2b] border-orange-200 px-2 py-0">
                    {details.branch_code}
                  </Badge>
                )}
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Name</p>
                  <p className="font-medium text-gray-900">{details?.branch_name || "Main Branch"}</p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Type</p>
                  <p className="font-medium text-gray-900">{details?.branch_type || "Head Office"}</p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Email</p>
                  <p className="font-medium text-gray-900 truncate flex items-center gap-1">
                    <Mail className="h-3 w-3 text-gray-400" />
                    {details?.email || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Phone</p>
                  <p className="font-semibold font-medium text-gray-900 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    {details?.phone_number || "—"}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Physical Address</p>
                  <p className="font-medium text-gray-900">{details?.address || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Bigger Column with Fixed Tabs & Only Scrollable Content Area */}
          <div className="flex-1 flex flex-col h-9/10 overflow-hidden min-w-0 relative">
            {/* Restored Underline Tab Styles */}
            <div className="flex-shrink-0 flex items-center space-x-2 border-b border-gray-200 text-sm font-semibold mb-4">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "overview" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Analytics
                </div>
                {activeTab === "overview" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("branches")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "branches" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Branches ({branches.length || 1})
                </div>
                {activeTab === "branches" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("admins")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "admins" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Admin Accounts ({admins.length})
                </div>
                {activeTab === "admins" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("config")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "config" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Modules & Configuration
                </div>
                {activeTab === "config" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>
            </div>

            {/* THE ONLY SCROLLABLE AREA: Tab Panel Content */}
            <div className="flex-1 overflow-y-auto pr-2 pb-4">
              {loading && !details ? (
                <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="h-8 w-8 text-[#f08c2b] animate-spin" />
                  <p className="text-sm text-gray-500 font-medium">Loading details...</p>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {/* TAB 1: ANALYTICS */}
                  {activeTab === "overview" && (
                    <motion.div
                      key="tab-analytics"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      {/* 1. 6-Month Activity Growth Analytics (Combo Bar + Line Chart) */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-[#f08c2b]" />
                              6-Month Activity Growth Analytics
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Combined view of new member registrations (Bar) and platform activity volume (Line).
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={
                                (analytics.monthlyGrowth as any[])?.length
                                  ? analytics.monthlyGrowth
                                  : [
                                      { month: "Mar", members: 12, messages: 45 },
                                      { month: "Apr", members: 18, messages: 72 },
                                      { month: "May", members: 24, messages: 110 },
                                      { month: "Jun", members: 31, messages: 165 },
                                      { month: "Jul", members: 42, messages: 240 },
                                      { month: "Aug", members: 58, messages: 310 },
                                    ]
                              }
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: "#ffffff",
                                  borderRadius: "12px",
                                  border: "1px solid #e2e8f0",
                                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                  fontSize: "12px",
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                              <Bar dataKey="members" name="Members Joined" fill="#f08c2b" radius={[6, 6, 0, 0]} barSize={26} />
                              <Line type="monotone" dataKey="messages" name="Messages / Activity" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: "#8b5cf6" }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 2. Grid Row: Branch Members Pie Chart & Sunburst Active/Inactive Branches */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Chart A: Individual Branch Members Totals (Pie Chart) */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                          <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-[#f08c2b]" />
                              Branch Member Distribution
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Proportion of total members enrolled across branches.
                            </p>
                          </div>

                          <div className="h-60 w-full flex items-center justify-center">
                            {(() => {
                              const pieColors = ["#f08c2b", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b", "#06b6d4"]
                              const rawData = (analytics.branchMembers as any[])?.length
                                ? analytics.branchMembers.map((bm: any) => ({
                                    name: bm.branch_name,
                                    value: Number(bm.members_count || 0),
                                  }))
                                : branches.map((b: any) => ({
                                    name: b.name,
                                    value: 1,
                                  }))

                              const pieData = rawData.filter((d) => d.value > 0)

                              if (pieData.length === 0) {
                                return <p className="text-xs text-gray-400">No member data recorded</p>
                              }

                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={pieData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      outerRadius={80}
                                      innerRadius={45}
                                      paddingAngle={3}
                                    >
                                      {pieData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                                      ))}
                                    </Pie>
                                    <RechartsTooltip
                                      contentStyle={{
                                        backgroundColor: "#ffffff",
                                        borderRadius: "10px",
                                        border: "1px solid #e2e8f0",
                                        fontSize: "12px",
                                      }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                  </PieChart>
                                </ResponsiveContainer>
                              )
                            })()}
                          </div>
                        </div>

                        {/* Chart B: Active vs Inactive Branches (Concentric Sunburst Donut Chart) */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                          <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-[#f08c2b]" />
                              Branch Status & Type Breakdown
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Sunburst inner ring (Branch Type) & outer ring (Active vs Inactive status).
                            </p>
                          </div>

                          <div className="h-60 w-full flex items-center justify-center">
                            {(() => {
                              const activeCount = branches.filter((b) => b.status !== "Inactive").length
                              const inactiveCount = branches.filter((b) => b.status === "Inactive").length
                              const headOfficeCount = branches.filter(
                                (b) => b.branch_type?.toLowerCase().includes("head") || b.branch_type_id === "head_office"
                              ).length
                              const subBranchCount = Math.max(0, branches.length - headOfficeCount)

                              const outerData = [
                                { name: "Active", value: activeCount || 1, fill: "#10b981" },
                                { name: "Inactive", value: inactiveCount, fill: "#64748b" },
                              ].filter((d) => d.value > 0)

                              const innerData = [
                                { name: "Head Office", value: headOfficeCount || 1, fill: "#f08c2b" },
                                { name: "Sub-Branches", value: subBranchCount, fill: "#3b82f6" },
                              ].filter((d) => d.value > 0)

                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    {/* Inner Ring: Branch Type */}
                                    <Pie
                                      data={innerData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={30}
                                      outerRadius={55}
                                      paddingAngle={2}
                                    >
                                      {innerData.map((entry, index) => (
                                        <Cell key={`inner-${index}`} fill={entry.fill} />
                                      ))}
                                    </Pie>
                                    {/* Outer Ring: Active vs Inactive Status */}
                                    <Pie
                                      data={outerData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={62}
                                      outerRadius={82}
                                      paddingAngle={3}
                                    >
                                      {outerData.map((entry, index) => (
                                        <Cell key={`outer-${index}`} fill={entry.fill} />
                                      ))}
                                    </Pie>
                                    <RechartsTooltip
                                      contentStyle={{
                                        backgroundColor: "#ffffff",
                                        borderRadius: "10px",
                                        border: "1px solid #e2e8f0",
                                        fontSize: "12px",
                                      }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                  </PieChart>
                                </ResponsiveContainer>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: REDESIGNED BRANCHES LIST */}
                  {activeTab === "branches" && (
                    <motion.div
                      key="tab-branches"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {/* Search & Type Filters Toolbar with Standalone Add Button */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {/* Search & Filter Pills Card (Left) */}
                        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 border border-gray-200 shadow-2xs">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Search branches by name, code, or address..."
                              value={branchSearch}
                              onChange={(e) => setBranchSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f08c2b]/20 focus:border-[#f08c2b] transition-all"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <button
                              onClick={() => setBranchFilter("ALL")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "ALL"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              All ({branches.length || 1})
                            </button>
                            <button
                              onClick={() => setBranchFilter("HEAD_OFFICE")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "HEAD_OFFICE"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              Head Office
                            </button>
                            <button
                              onClick={() => setBranchFilter("SUB_BRANCH")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "SUB_BRANCH"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              Sub-Branches
                            </button>
                          </div>
                        </div>

                        {/* Standalone Add Branch Button (Calls ReeveModal via AddNewBranchModal) */}
                        {institutionId && (
                          <AddNewBranchModal
                            institutionId={institutionId}
                            institutionName={details?.name}
                            onSuccess={() => fetchFullDetails()}
                          />
                        )}

                        {/* Edit Branch Modal (Appears in the exact same tab area as Add Branch Modal) */}
                        {institutionId && editingBranch && (
                          <EditBranchModal
                            isOpen={!!editingBranch}
                            onClose={() => setEditingBranch(null)}
                            branch={editingBranch}
                            institutionId={institutionId}
                            institutionName={details?.name}
                            onSuccess={() => {
                              setEditingBranch(null)
                              fetchFullDetails()
                            }}
                          />
                        )}
                      </div>

                      {/* Redesigned Branch Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredBranches.length === 0 ? (
                          <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center space-y-3 col-span-2">
                            <GitBranch className="h-10 w-10 text-gray-300 mx-auto" />
                            <p className="text-sm font-semibold text-gray-700">No branches match your search</p>
                            <p className="text-xs text-gray-400">Try adjusting your search terms or filter selection.</p>
                          </div>
                        ) : (
                          filteredBranches.map((br, idx) => {
                            return (
                              <div
                                key={br.id || idx}
                                className="group bg-white rounded-2xl p-5 border border-gray-200 hover:border-gray-300 shadow-2xs transition-all relative space-y-4"
                              >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center space-x-3">
                                    <div className="h-11 w-11 rounded-2xl font-extrabold text-sm flex items-center justify-center border shadow-2xs flex-shrink-0 tracking-tight bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-[#f08c2b] border-orange-200">
                                      {getInitials(br.name || details?.name || "INS")}
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="font-bold text-sm text-gray-900">{br.name}</p>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-gray-400 font-medium">
                                          {br.branch_type || "Head Office"}
                                        </p>
                                        {br.branch_code && (
                                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-md border border-gray-200">
                                            {br.branch_code}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingBranch(br)
                                      }}
                                      title="Edit Branch"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-[#f08c2b] border border-gray-200 hover:border-orange-200 shadow-2xs cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>

                                    <Badge
                                      className={`text-xs ${
                                        br.status === "Inactive"
                                          ? "bg-gray-100 text-gray-700 border-gray-200"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      }`}
                                    >
                                      {br.status || "Active"}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Contact & Details Grid */}
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs">
                                  <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Email Address</p>
                                    <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                                      <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      {br.email ? (
                                        <a href={`mailto:${br.email}`} className="hover:text-blue-600 truncate">
                                          {br.email}
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Phone Number</p>
                                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                      <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      {br.phone_number ? (
                                        <a href={`tel:${br.phone_number}`} className="hover:text-blue-600">
                                          {br.phone_number}
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                  </div>

                                  <div className="col-span-2">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Physical Address</p>
                                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="truncate">{br.address || "—"}</span>
                                    </p>
                                  </div>

                                  {br.created_at && (
                                    <div className="col-span-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Established: {new Date(br.created_at).toLocaleDateString()}
                                      </span>
                                      <span className="font-mono text-[10px] uppercase text-gray-400">
                                        CODE: {br.branch_code || "BR"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: ADMIN ACCOUNTS */}
                  {activeTab === "admins" && (
                    <motion.div
                      key="tab-admins"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <DataTable
                        title="Administrator accounts"
                        exportButtons={
                          institutionId ? (
                            <AddNewAdminModal
                              institutionId={institutionId}
                              institutionName={details?.name}
                              branches={branches}
                              onSuccess={() => fetchFullDetails()}
                            />
                          ) : null
                        }
                        columns={adminColumns}
                        rows={paginatedAdmins}
                        loading={loading}
                        emptyMessage="No admin accounts registered for this institution."
                        filterFields={adminFilterFields}
                        tabularFilters={adminTabularFilters}
                        tabularFilterField="status"
                        onQueryParamsChange={(params) => {
                          setAdminQueryParams(params || {})
                          setAdminPage(0)
                        }}
                        pagination={{
                          page: adminPage,
                          rowsPerPage: adminRowsPerPage,
                          total: filteredAdmins.length,
                          onPageChange: (_, newPage) => setAdminPage(newPage),
                          onRowsPerPageChange: (e) => {
                            setAdminRowsPerPage(parseInt(e.target.value, 10))
                            setAdminPage(0)
                          },
                        }}
                      />

                      {/* Edit Admin Modal */}
                      {institutionId && editingAdmin && (
                        <EditAdminModal
                          isOpen={!!editingAdmin}
                          onClose={() => setEditingAdmin(null)}
                          admin={editingAdmin}
                          institutionId={institutionId}
                          institutionName={details?.name}
                          branches={branches}
                          onSuccess={() => {
                            setEditingAdmin(null)
                            fetchFullDetails()
                          }}
                        />
                      )}
                    </motion.div>
                  )}

                  {/* TAB 4: MODULES & CONFIG */}
                  {activeTab === "config" && (
                    <motion.div
                      key="tab-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      {/* Filter by Branch */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-[#f08c2b]" />
                          <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                            Branch Modules & Operations Status
                          </p>
                        </div>

                        {branchConfigs.length > 1 && (
                          <div className="w-56">
                            <StyledSelect
                              value={configBranchFilter}
                              onChange={(val) => setConfigBranchFilter(val)}
                              placeholder="Select Branch"
                              options={[
                                { value: "ALL", label: `All Branches (${branchConfigs.length})` },
                                ...branchConfigs.map((bc) => ({
                                  value: bc.branch_id,
                                  label: bc.branch_name,
                                  description: bc.branch_code ? `CODE: ${bc.branch_code}` : undefined,
                                })),
                              ]}
                            />
                          </div>
                        )}
                      </div>

                      {/* Loading State */}
                      {loadingConfigs ? (
                        <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center space-y-3">
                          <Loader2 className="h-8 w-8 text-[#f08c2b] animate-spin mx-auto" />
                          <p className="text-xs text-gray-500 font-medium">Loading operation statuses & configuration...</p>
                        </div>
                      ) : branchConfigs.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center space-y-3">
                          <Sliders className="h-10 w-10 text-gray-300 mx-auto" />
                          <p className="text-sm font-semibold text-gray-700">No branch configs found</p>
                          <p className="text-xs text-gray-400">Please make sure this institution has at least one registered branch.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {branchConfigs
                            .filter((bc) => configBranchFilter === "ALL" || bc.branch_id === configBranchFilter)
                            .map((bc) => {
                              const chatsActive = bc.chats === "true"
                              const mmActive = bc.mobile_money === "true"
                              const emailActive = Boolean(bc.email_is_active)
                              const loansActive = bc.loans === "true"
                              const savingsActive = bc.savings === "true"
                              const sharesActive = bc.shares === "true"
                              const autoInvoicesActive = bc.auto_invoices === "true"
                              const isEditEnabled = Boolean(editableBranchConfigIds[bc.branch_id])

                              return (
                                <div
                                  key={bc.branch_id}
                                  className="group bg-white rounded-2xl p-6 border border-gray-200 shadow-2xs space-y-5 transition-all"
                                >
                                  {/* Branch Title & Header */}
                                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                    <div className="flex items-center gap-3">
                                      <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#f08c2b] font-bold text-xs flex items-center justify-center border border-orange-200 shrink-0">
                                        {getInitials(bc.branch_name)}
                                      </div>
                                      <div>
                                        <p className="font-bold text-sm text-gray-900">{bc.branch_name}</p>
                                        {bc.branch_code && (
                                          <p className="text-[11px] font-mono text-gray-400">CODE: {bc.branch_code}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleBranchConfigEdit(bc.branch_id)}
                                        title={isEditEnabled ? "Lock / Disable Edit Mode" : "Enable Edit Mode"}
                                        className={`transition-all duration-200 p-1.5 rounded-lg border shadow-2xs cursor-pointer ${
                                          isEditEnabled
                                            ? "opacity-100 bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                                            : "opacity-0 group-hover:opacity-100 bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-[#f08c2b] border-gray-200 hover:border-orange-200"
                                        }`}
                                      >
                                        {isEditEnabled ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                      </button>
                                      <Badge variant="outline" className="text-xs font-mono text-gray-600 bg-gray-50">
                                        Currency: {bc.currency || "UGX"}
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* Section 1: Featured Operation Services */}
                                  <div className="space-y-3">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                      Featured Operation Services
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                      {/* Branch Chats */}
                                      <div className="p-4 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-amber-50/20 space-y-3">
                                        <div className="flex items-start justify-between">
                                          <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                                            <MessageSquare className="h-4 w-4" />
                                          </div>
                                          <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                            <input
                                              type="checkbox"
                                              checked={chatsActive}
                                              disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-chats`}
                                              onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "chats", chatsActive)}
                                              className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                          </label>
                                        </div>

                                        <div>
                                          <p className="font-semibold text-gray-900">Branch Chats</p>
                                          <p className="text-[11px] text-gray-500 mt-0.5">Staff & team collaboration chats</p>
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                          <span className="text-[10px] text-gray-400 uppercase font-semibold">Status</span>
                                          <Badge className={chatsActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-gray-100 text-gray-600 border-gray-200 text-[10px]"}>
                                            {chatsActive ? "Active" : "Disabled"}
                                          </Badge>
                                        </div>
                                      </div>

                                      {/* Mobile Money */}
                                      <div className="p-4 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-blue-50/20 space-y-3">
                                        <div className="flex items-start justify-between">
                                          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                                            <Smartphone className="h-4 w-4" />
                                          </div>
                                          <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                            <input
                                              type="checkbox"
                                              checked={mmActive}
                                              disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-mobile_money`}
                                              onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "mobile_money", mmActive)}
                                              className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                          </label>
                                        </div>

                                        <div>
                                          <p className="font-semibold text-gray-900">Mobile Money API</p>
                                          <p className="text-[11px] text-gray-500 mt-0.5">Automated mobile disbursements & collections</p>
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                          <span className="text-[10px] text-gray-400 uppercase font-semibold">Status</span>
                                          <Badge className={mmActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-gray-100 text-gray-600 border-gray-200 text-[10px]"}>
                                            {mmActive ? "Active" : "Disabled"}
                                          </Badge>
                                        </div>
                                      </div>

                                      {/* Emails & Mail Services */}
                                      <div className="p-4 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-purple-50/20 space-y-3">
                                        <div className="flex items-start justify-between">
                                          <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
                                            <Mail className="h-4 w-4" />
                                          </div>
                                          <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                            <input
                                              type="checkbox"
                                              checked={emailActive}
                                              disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-email`}
                                              onChange={() => isEditEnabled && handleToggleEmailActive(bc.branch_id, emailActive)}
                                              className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                          </label>
                                        </div>

                                        <div>
                                          <p className="font-semibold text-gray-900">Email & Mail Services</p>
                                          <p className="text-[11px] text-gray-500 mt-0.5">
                                            Provider: <span className="font-mono font-medium text-gray-700 uppercase">{bc.provider || "Mailgun"}</span>
                                          </p>
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditingEmailBranch(bc)}
                                            className="text-[11px] h-7 px-2.5 text-gray-700 hover:text-[#f08c2b] hover:border-orange-200 cursor-pointer"
                                          >
                                            Configure Settings
                                          </Button>
                                          <Badge className={emailActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-gray-100 text-gray-600 border-gray-200 text-[10px]"}>
                                            {emailActive ? "Active" : "Disabled"}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Section 2: Core Financial Modules */}
                                  <div className="space-y-3 pt-3 border-t border-gray-100">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                      Core Modules & Invoicing
                                    </p>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                      {/* Loans */}
                                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <CreditCard className="h-4 w-4 text-blue-500" />
                                          <span className="font-medium text-gray-800">Loans</span>
                                        </div>
                                        <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                          <input
                                            type="checkbox"
                                            checked={loansActive}
                                            disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-loans`}
                                            onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "loans", loansActive)}
                                            className="sr-only peer"
                                          />
                                          <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                        </label>
                                      </div>

                                      {/* Savings */}
                                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <Building2 className="h-4 w-4 text-purple-500" />
                                          <span className="font-medium text-gray-800">Savings</span>
                                        </div>
                                        <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                          <input
                                            type="checkbox"
                                            checked={savingsActive}
                                            disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-savings`}
                                            onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "savings", savingsActive)}
                                            className="sr-only peer"
                                          />
                                          <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                        </label>
                                      </div>

                                      {/* Shares */}
                                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                          <span className="font-medium text-gray-800">Shares</span>
                                        </div>
                                        <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                          <input
                                            type="checkbox"
                                            checked={sharesActive}
                                            disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-shares`}
                                            onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "shares", sharesActive)}
                                            className="sr-only peer"
                                          />
                                          <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                        </label>
                                      </div>

                                      {/* Auto Invoices */}
                                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <Sliders className="h-4 w-4 text-rose-500" />
                                          <span className="font-medium text-gray-800">Auto Invoices</span>
                                        </div>
                                        <label className={`relative inline-flex items-center ${isEditEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                          <input
                                            type="checkbox"
                                            checked={autoInvoicesActive}
                                            disabled={!isEditEnabled || togglingConfig === `${bc.branch_id}-auto_invoices`}
                                            onChange={() => isEditEnabled && handleToggleModule(bc.branch_id, "auto_invoices", autoInvoicesActive)}
                                            className="sr-only peer"
                                          />
                                          <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#f08c2b]"></div>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )}

                      {/* Modal for Editing Branch Email Settings */}
                      {institutionId && editingEmailBranch && (
                        <BranchEmailSettingsModal
                          isOpen={!!editingEmailBranch}
                          onClose={() => setEditingEmailBranch(null)}
                          institutionId={institutionId}
                          branch={editingEmailBranch}
                          onSuccess={() => fetchBranchConfigs()}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
    </SlideModal>
  )
}

export default InstitutionDetailsDrawer
