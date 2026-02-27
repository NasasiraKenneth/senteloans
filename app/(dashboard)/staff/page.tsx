"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { Plus, Eye, Edit, Mail, Phone, ShieldCheck, Clock, Calendar } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import AddNewStaff from "./components/add/addNewStaff"
import EditStaff from "./components/edit/editStaff"

type StaffMember = {
  id: string
  full_name: string
  email: string
  phone_number: string | null
  role: string
  status: string
  is_admin: boolean
  joined_at: string | null
  last_login: string | null
  created_at: string
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatRole(role: string): string {
  switch (role) {
    case "institution_admin":
      return "Admin"
    case "manager":
      return "Manager"
    case "loan_officer":
      return "Loan Officer"
    case "teller":
      return "Teller"
    default:
      return role
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never"
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editStaffId, setEditStaffId] = useState<string | null>(null);

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadStaff(queryParams?: object) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      params.set("limit", "100")
      const res = await fetch(`/api/institution/staff?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to load staff")
      }
      const { staff: rows } = await res.json()
      setStaff(rows || [])
    } catch (e: any) {
      setError(e?.message || "Failed to load staff")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    loadStaff()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadStaff(params)
  }, [])

  const handleEdit = (row: StaffMember) => {
    setEditStaffId(row.id)
    setIsEditOpen(true)
  }

  // Table columns configuration
  const columns: DataTableColumn<StaffMember>[] = [
    {
      key: "full_name",
      header: "Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
            <span className="text-[#f08c2b] text-xs font-semibold">{getInitials(row.full_name)}</span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.full_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Contact",
      render: (row) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <Mail className="h-3.5 w-3.5 text-gray-400" />
            {row.email}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            {row.phone_number || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => {
        const roleStyles: Record<string, string> = {
          institution_admin: "bg-orange-100 text-orange-700 border border-orange-200",
          manager: "bg-purple-100 text-purple-700 border border-purple-200",
          loan_officer: "bg-blue-100 text-blue-700 border border-blue-200",
          teller: "bg-gray-100 text-gray-700 border border-gray-200",
        }
        return (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${roleStyles[row.role] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {formatRole(row.role)}
          </div>
        )
      },
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
        return (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${row.status === "Active" ? "bg-green-500" : row.status === "Suspended" ? "bg-red-500" : "bg-gray-400"}`} />
            {row.status}
          </div>
        )
      },
    },
    {
      key: "last_login",
      header: "Last Login",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm text-gray-900">{timeAgo(row.last_login)}</div>
        </div>
      ),
    },
    {
      key: "joined_at",
      header: "Joined",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm text-gray-600">{formatDate(row.joined_at || row.created_at)}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <div className="flex justify-center"><ActionButtons actions={actions} row={row} /></div>,
    },
  ]

  // Table actions configuration
  const actions = [
    {
      label: "Edit",
      onClick: handleEdit,
      variant: "primary",
      icon: <Edit className="h-4 w-4" />,
    },
  ]

  // Filter configuration
  const filterFields: FilterField[] = [
    {
      field: "search",
      label: "Search by Name or Email",
      type: "text",
    },
    {
      field: "role",
      label: "Role",
      options: [
        { value: "institution_admin", label: "Admin" },
        { value: "manager", label: "Manager" },
        { value: "loan_officer", label: "Loan Officer" },
        { value: "teller", label: "Teller" },
      ],
      multiple: false,
      type: "select",
    },
    {
      field: "status",
      label: "Status",
      options: [
        { value: "Active", label: "Active" },
        { value: "Inactive", label: "Inactive" },
        { value: "Suspended", label: "Suspended" },
      ],
      multiple: false,
      type: "select",
    },
  ]

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-balance">Staff Management</h2>
            <p className="text-muted-foreground text-pretty">
              Manage your institution&apos;s team members, roles &amp; permissions.
            </p>
          </div>
          <div>
            <Button
              className="hover:bg-black/70 hover:text-[#f08c2b]"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.filter((s) => s.status === "Active").length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Loan Officers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.filter((s) => s.role === "loan_officer").length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Managers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.filter((s) => s.role === "manager").length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Staff DataTable */}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <DataTable<StaffMember>
          columns={columns}
          rows={staff.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
          loading={loading}
          title="Staff Members"
          filterFields={filterFields}
          onQueryParamsChange={handleQueryParamsChange}
          emptyMessage="No staff members found"
          getRowId={(row) => row.id}
          pagination={{
            page,
            rowsPerPage,
            total: staff.length,
            onPageChange,
            onRowsPerPageChange,
          }}
        />

        <AddNewStaff
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => loadStaff()}
        />

        <EditStaff
          isOpen={isEditOpen}
          staffId={editStaffId}
          onClose={() => { setIsEditOpen(false); setEditStaffId(null) }}
          onSuccess={() => loadStaff()}
        />
      </div>
    </>
  )
}
