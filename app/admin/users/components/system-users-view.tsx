"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  Calendar,
  Pencil,
  UserCheck,
  UserX,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  X,
} from "lucide-react"
import DataTable, { DataTableColumn, DataTablePaginationConfig } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import Tooltip from "@mui/material/Tooltip"
import StyledSelect from "@/components/newUI/styled_select"

export type SystemUserRow = {
  id: string
  fullName: string
  username?: string
  email: string
  phoneNumber: string | null
  role: string
  status: string
  createdAt: string
  institutionName?: string
  institutionId?: string | null
}

function getInitials(name: string): string {
  if (!name) return "SA"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

const inputClass = (hasError: boolean = false) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function SystemUsersView() {
  const [users, setUsers] = useState<SystemUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")

  // Add System Admin Modal State
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [showAddConfirmPassword, setShowAddConfirmPassword] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  })

  // Edit System Admin Modal State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    phoneNumber: "",
    status: "Active",
    password: "",
    confirmPassword: "",
  })

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Pass role=system_admin to retrieve system admin users exclusively
      const res = await fetch("/api/admin/users?role=system_admin", { cache: "no-store" })
      if (!res.ok) {
        throw new Error(`Failed to load system users (Status: ${res.status})`)
      }
      const data = (await res.json()) as SystemUserRow[]
      // Extra safety client filter to ensure only system_admin users are kept
      const systemOnlyUsers = (Array.isArray(data) ? data : []).filter(
        (u) => u.role === "system_admin" || u.role?.includes("system")
      )
      setUsers(systemOnlyUsers)
    } catch (err: unknown) {
      const e = err as Error
      setError(e.message || "Failed to fetch system users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.fullName || !formData.email || !formData.password || !formData.confirmPassword) {
      setAddError("Please fill in all required fields.")
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setAddError("Passwords do not match. Please ensure both password fields are identical.")
      return
    }

    setAddLoading(true)
    setAddError(null)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to create system admin")
      }
      setIsAddOpen(false)
      setFormData({ fullName: "", username: "", email: "", phoneNumber: "", password: "", confirmPassword: "" })
      fetchUsers()
    } catch (err: unknown) {
      const e = err as Error
      setAddError(e.message || "An unexpected error occurred")
    } finally {
      setAddLoading(false)
    }
  }

  const handleOpenEditModal = (user: SystemUserRow) => {
    setEditingUserId(user.id)
    setEditFormData({
      fullName: user.fullName || "",
      username: user.username || "",
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      status: user.status || "Active",
      password: "",
      confirmPassword: "",
    })
    setEditError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUserId || !editFormData.fullName || !editFormData.email) {
      setEditError("Full Name and Email Address are required.")
      return
    }

    if (editFormData.password && editFormData.password !== editFormData.confirmPassword) {
      setEditError("Passwords do not match. Please ensure both password fields are identical.")
      return
    }

    setEditLoading(true)
    setEditError(null)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUserId,
          ...editFormData,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to update system admin")
      }
      setIsEditOpen(false)
      setEditingUserId(null)
      fetchUsers()
    } catch (err: unknown) {
      const e = err as Error
      setEditError(e.message || "An unexpected error occurred")
    } finally {
      setEditLoading(false)
    }
  }

  // Filtered dataset based on search term & status dropdown
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchTerm.trim() ||
        u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.phoneNumber && u.phoneNumber.includes(searchTerm))

      const matchesStatus =
        statusFilter === "ALL" ||
        u.status?.toLowerCase() === statusFilter.toLowerCase()

      return matchesSearch && matchesStatus
    })
  }, [users, searchTerm, statusFilter])

  // Statistics calculation
  const stats = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.status === "Active" || u.status === "active").length
    const inactive = users.filter((u) => u.status !== "Active" && u.status !== "active").length
    return { total, active, inactive }
  }, [users])

  // Pagination config
  const paginatedUsers = useMemo(() => {
    const start = page * rowsPerPage
    return filteredUsers.slice(start, start + rowsPerPage)
  }, [filteredUsers, page, rowsPerPage])

  const paginationConfig: DataTablePaginationConfig = {
    page,
    rowsPerPage,
    total: filteredUsers.length,
    onPageChange: (_, newPage) => setPage(newPage),
    onRowsPerPageChange: (e) => {
      setRowsPerPage(parseInt(e.target.value, 10))
      setPage(0)
    },
    rowsPerPageOptions: [5, 10, 25, 50],
  }

  // Filter fields config for DataTable
  const filterFields: FilterField[] = [
    {
      field: "search",
      label: "Search Name / Email",
      type: "text",
    },
    {
      field: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ALL", label: "All Statuses" },
        { value: "Active", label: "Active" },
        { value: "Inactive", label: "Inactive" },
        { value: "Suspended", label: "Suspended" },
      ],
    },
  ]

  const handleFilterChange = (params: Record<string, any>) => {
    if (params.search !== undefined) {
      setSearchTerm(params.search || "")
    }
    if (params.status !== undefined) {
      setStatusFilter(params.status || "ALL")
    }
    setPage(0)
  }

  // Columns definition for DataTable
  const columns: DataTableColumn<SystemUserRow>[] = [
    {
      key: "fullName",
      header: "Administrator",
      render: (row) => (
        <div className="flex items-center gap-3 py-1">
          <div className="h-9 w-9 rounded-full bg-[#F08C2B]/15 text-[#F08C2B] border border-[#F08C2B]/30 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            {getInitials(row.fullName)}
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              {row.fullName}
            </div>
            <div className="text-xs text-slate-500 font-normal flex items-center gap-1 mt-0.5">
              <Mail className="h-3 w-3 text-slate-400" />
              {row.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "phoneNumber",
      header: "Phone Number",
      render: (row) => (
        <div className="text-xs text-slate-600 flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {row.phoneNumber || "—"}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role & Access",
      render: () => (
        <Badge
          variant="outline"
          className="border-[#F08C2B]/40 bg-[#F08C2B]/10 text-[#F08C2B] font-semibold text-[11px] gap-1 px-2.5 py-0.5 rounded-full"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-[#F08C2B]" />
          System Admin
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const isAct = row.status === "Active" || row.status === "active"
        return (
          <Badge
            variant={isAct ? "default" : "secondary"}
            className={
              isAct
                ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-semibold text-xs px-2.5 py-0.5"
                : "bg-slate-100 text-slate-600 border border-slate-200 font-medium text-xs px-2.5 py-0.5"
            }
          >
            {isAct ? (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            ) : (
              row.status || "Inactive"
            )}
          </Badge>
        )
      },
    },
    {
      key: "createdAt",
      header: "Date Added",
      render: (row) => (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          {formatDate(row.createdAt)}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cellClassName: "text-center",
      headerClassName: "text-center",
      render: (row) => (
        <div className="flex items-center justify-center">
          <Tooltip title="Edit Administrator">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenEditModal(row)}
              className="h-8 w-8 text-slate-600 hover:text-[#F08C2B] hover:bg-[#F08C2B]/10 rounded-lg cursor-pointer"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#F08C2B]/10 text-[#F08C2B] border border-[#F08C2B]/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Administrators</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage global super administrator accounts with system-wide privileges
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddOpen(true)}
            className="gap-2 bg-[#F08C2B] hover:bg-[#d97706] text-white font-semibold rounded-xl shadow-2xs cursor-pointer text-xs px-3.5 py-2"
          >
            <Plus className="h-4 w-4" />
            Add System Admin
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-slate-200 border-t-2 border-t-[#F08C2B] bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total System Admins
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F08C2B]/20 bg-[#F08C2B]/10 text-[#F08C2B]">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 font-medium">
              <span>System-wide administrative users</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Admins
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.active}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready for platform administration
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 border-t-2 border-t-slate-400 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inactive Admins
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
              <UserX className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.inactive}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 font-medium">
              <span>Disabled or pending activation</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main DataTable Section */}
      <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl overflow-hidden">
        <CardContent className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DataTable<SystemUserRow>
            columns={columns}
            rows={paginatedUsers}
            loading={loading}
            emptyMessage="No system admin users found."
            filterFields={filterFields}
            onQueryParamsChange={handleFilterChange}
            pagination={paginationConfig}
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>

      {/* Add System Admin Modal (Framed using calculator.tsx motion pattern) */}
      <AnimatePresence>
        {isAddOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsAddOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-[#F08C2B]/10 text-[#F08C2B] border border-[#F08C2B]/20">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Add System Administrator</h2>
                    <p className="text-xs text-slate-500">
                      Create a new platform-wide administrator account with full privileges
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4 pt-1">
                {addError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{addError}</span>
                  </div>
                )}

                {/* Full Name (Full Width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kenneth Nasasira"
                    className={inputClass(!formData.fullName && !!addError)}
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>

                {/* Username & Phone Number (2 Columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. kenneth_admin"
                      className={inputClass()}
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+256 700 000000"
                      className={inputClass()}
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                {/* Email Address (Full Width - Above Password Inputs) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="admin@senteloans.com"
                    className={inputClass(!formData.email && !!addError)}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                {/* Password & Confirm Password (2 Columns with Eye/EyeOff toggles) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showAddPassword ? "text" : "password"}
                        placeholder="Set secure password"
                        className={inputClass(!formData.password && !!addError)}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddPassword(!showAddPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 outline-none cursor-pointer"
                      >
                        {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showAddConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        className={inputClass(formData.password !== formData.confirmPassword && !!formData.confirmPassword)}
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddConfirmPassword(!showAddConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 outline-none cursor-pointer"
                      >
                        {showAddConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 mt-5">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    disabled={addLoading}
                    className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="bg-[#f08c2b] hover:bg-[#d97706] text-white font-medium px-4 py-2 text-sm rounded-md shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                  >
                    {addLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Save Administrator
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit System Admin Modal (Framed using calculator.tsx motion pattern) */}
      <AnimatePresence>
        {isEditOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsEditOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-[#F08C2B]/10 text-[#F08C2B] border border-[#F08C2B]/20">
                    <Pencil className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Edit System Administrator</h2>
                    <p className="text-xs text-slate-500">
                      Update administrator credentials and account status
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 pt-1">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Full Name (Full Width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kenneth Nasasira"
                    className={inputClass(!editFormData.fullName && !!editError)}
                    value={editFormData.fullName}
                    onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                    required
                  />
                </div>

                {/* Username & Phone Number (2 Columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. kenneth_admin"
                      className={inputClass()}
                      value={editFormData.username}
                      onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+256 700 000000"
                      className={inputClass()}
                      value={editFormData.phoneNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                {/* Email Address (Full Width - Above Status & Password Inputs) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="admin@senteloans.com"
                    className={inputClass(!editFormData.email && !!editError)}
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    required
                  />
                </div>

                {/* StyledSelect Account Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Status <span className="text-red-500">*</span>
                  </label>
                  <StyledSelect
                    value={editFormData.status}
                    onChange={(val) => setEditFormData({ ...editFormData, status: val })}
                    placeholder="Select status"
                    options={[
                      { value: "Active", label: "Active", description: "Full administrative access to system" },
                      { value: "Inactive", label: "Inactive", description: "Temporarily disabled administrator" },
                      { value: "Suspended", label: "Suspended", description: "Access suspended due to security or policy" },
                    ]}
                  />
                </div>

                {/* Optional New Password & Confirm Password (2 Columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Password <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showEditPassword ? "text" : "password"}
                        placeholder="New password"
                        className={inputClass()}
                        value={editFormData.password}
                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 outline-none cursor-pointer"
                      >
                        {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEditConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        className={inputClass(editFormData.password !== editFormData.confirmPassword && !!editFormData.confirmPassword)}
                        value={editFormData.confirmPassword}
                        onChange={(e) => setEditFormData({ ...editFormData, confirmPassword: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 outline-none cursor-pointer"
                      >
                        {showEditConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 mt-5">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    disabled={editLoading}
                    className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="bg-[#f08c2b] hover:bg-[#d97706] text-white font-medium px-4 py-2 text-sm rounded-md shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                  >
                    {editLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving Changes...
                      </>
                    ) : (
                      <>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
