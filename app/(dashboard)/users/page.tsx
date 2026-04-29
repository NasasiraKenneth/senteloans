"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { Plus, Eye, Edit, Mail, Phone, MapPin, ShieldCheck, Clock, Calendar } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Tooltip from "@mui/material/Tooltip"
import { getSession } from "@/lib/session"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { Filter } from "@/types"
import { useToast } from "@/components/ui/toast"
import { downloadMembersExport } from "./export/export"

type UiClient = {
  id: string
  fullName: string
  clientNumber: string
  phoneNumber: string
  email: string
  location: string
  status: string
  kycStatus: string
  membershipFeePaid: number
  createdBy: string
  kycApprovedBy: string
  joinDate: string
  kycApprovedAt: string
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatDate(date: string): string {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatDateTime(date: string): string {
  if (!date) return "—"
  return new Date(date).toLocaleString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function UsersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [users, setUsers] = useState<UiClient[]>([])
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [membershipFee, setMembershipFee] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const permissionToastShown = useRef(false)
  const [memberPermissions, setMemberPermissions] = useState({
    viewMembers: false,
    createMember: false,
    editMember: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadMembers(queryParams?: object) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
            const range = value as { start?: string; end?: string }
            if (range.start) params.set(`${key}Start`, range.start)
            if (range.end) params.set(`${key}End`, range.end)
            return
          }
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      params.set("limit", "1000")
      const res = await fetch(`/api/institution/members?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 403 && body?.error === "missing_permission:view_members") {
          throw new Error("missing_permission:view_members")
        }
        throw new Error(body.error || "Failed to load members")
      }
      const data = (await res.json()) as {
        members: Array<{
          id: string
          member_number: string
          full_name: string
          phone_number: string
          email: string | null
          district: string | null
          status: string
          kyc_status: string
          membership_fee_paid: number | null
          join_date: string | null
          created_by: string | null
          kyc_approved_by: string | null
          kyc_approved_at: string | null
          created_by_name: string | null
          kyc_approved_by_name: string | null
        }>
        membershipFee: number
      }
      setMembershipFee(Number(data.membershipFee) || 0)
      const mapped: UiClient[] = data.members.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        clientNumber: c.member_number,
        phoneNumber: c.phone_number,
        email: c.email || "",
        location: c.district || "",
        status: c.status,
        kycStatus: c.kyc_status,
        membershipFeePaid: Number(c.membership_fee_paid) || 0,
        createdBy: c.created_by_name || c.created_by || "",
        kycApprovedBy: c.kyc_approved_by_name || c.kyc_approved_by || "",
        joinDate: c.join_date || "",
        kycApprovedAt: c.kyc_approved_at || "",
      }))
      setUsers(mapped)
      permissionToastShown.current = false
    } catch (e: any) {
      const message = e?.message || "Failed to load members"
      setUsers([])

      if (message === "missing_permission:view_members") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view members.",
          })
          permissionToastShown.current = true
        }
      } else {
        toast({
          variant: "destructive",
          title: "Failed to load members",
          description: message,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadMemberPermissions() {
    try {
      const res = await fetch("/api/institution/members/permissions", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as {
        permissions?: {
          viewMembers?: boolean
          createMember?: boolean
          editMember?: boolean
          isSuperAdmin?: boolean
          branches?: Array<{ id: string; name: string }>
        }
      }
      setMemberPermissions({
        viewMembers: !!data.permissions?.viewMembers,
        createMember: !!data.permissions?.createMember,
        editMember: !!data.permissions?.editMember,
        isSuperAdmin: !!data.permissions?.isSuperAdmin,
        branches: (data.permissions?.branches || []).map((b) => ({ value: b.id, label: b.name })),
      })
    } catch {
      // Keep defaults (all false) when permission lookup fails.
    }
  }

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    loadMemberPermissions()
    loadMembers()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized: Record<string, string> = {}
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v && typeof v === "object" && "start" in (v as Record<string, unknown>) && "end" in (v as Record<string, unknown>)) {
        const range = v as { start?: string; end?: string }
        if (range.start) normalized[`${k}Start`] = range.start
        if (range.end) normalized[`${k}End`] = range.end
        return
      }
      if (v !== undefined && v !== null && String(v).trim() !== "") normalized[k] = String(v)
    })
    setActiveFilters(normalized)
    loadMembers(params)
  }, [])

  const handleView = (row: UiClient) => {
    router.push(`/users/${row.id}`)
  }

  const handleEdit = (row: UiClient) => {
    router.push(`/users/${row.id}/edit`)
  }

  const terminology = {
    singular: "Member",
    plural: "Members",
    management: "Member Management",
    description: "Manage SACCO members, track KYC status, and handle registrations.",
    addButton: "Add Member",
  }

  // Table columns configuration
  const columns: DataTableColumn<UiClient>[] = [
    {
      key: "clientNumber",
      header: `${terminology.singular} ID`,
      render: (row) => (
        <div className="text-sm font-mono font-medium text-gray-700 hover:underline">{row.clientNumber}</div>
      ),
    },
    {
      key: "fullName",
      header: terminology.singular,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{getInitials(row.fullName)}</span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.fullName}</div>
          </div>
        </div>
      ),
    },
    {
      key: "phoneNumber",
      header: "Contact",
      render: (row) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            {row.phoneNumber}
          </div>
          {row.email && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              {row.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (row) => (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          {row.location || "—"}
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
        return (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${row.status === "Active" ? "bg-green-500" : row.status === "Suspended" ? "bg-red-500" : "bg-gray-400"}`} />
            {row.status}
          </div>
        )
      },
    },
    {
      key: "membershipFeePaid",
      header: "Membership Paid",
      render: (row) => {
        const fee = membershipFee
        const paid = row.membershipFeePaid

        if (fee <= 0) {
          return <span className="text-xs text-gray-400">Not set</span>
        }

        return (
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(paid)}
          </span>
        )
      },
    },
    {
      key: "paymentProgress",
      header: "Payment Progress",
      render: (row) => {
        const fee = membershipFee
        const paid = row.membershipFeePaid
        const percentage = fee > 0 ? (paid / fee) * 100 : 0
        const isFullyPaid = paid >= fee

        if (fee <= 0) {
          return <span className="text-xs text-gray-400">—</span>
        }

        return (
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isFullyPaid ? "text-green-600" : "text-orange-600"}`}>
              {Math.round(percentage)}%
            </span>
            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isFullyPaid ? "bg-green-500" : "bg-orange-500"}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      key: "kycStatus",
      header: "KYC",
      render: (row) => {
        const kycStyles: Record<string, string> = {
          Verified: "bg-green-100 text-green-700 border border-green-200",
          Pending: "bg-yellow-100 text-yellow-700 border border-yellow-200",
          Rejected: "bg-red-100 text-red-700 border border-red-200",
        }
        return (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${kycStyles[row.kycStatus] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {row.kycStatus}
          </div>
        )
      },
    },
    {
      key: "kycApprovedBy",
      header: "KYC Approved By",
      render: (row) => (
        row.kycApprovedBy ? (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
              <span className="text-[#f08c2b] text-xs font-semibold">{getInitials(row.kycApprovedBy)}</span>
            </div>
            <div className="text-sm text-gray-700">{row.kycApprovedBy}</div>
          </div>
        ) : (
          <span className="flex text-sm text-gray-700 justify-center ">-</span>
        )
      ),
    },
    {
      key: "kycApprovedAt",
      header: "KYC Approved At",
      render: (row) => (
        row.kycApprovedAt ? (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <div className="text-sm text-gray-700">{formatDate(row.kycApprovedAt)}</div>
          </div>
        ) : (
          <span className="flex text-sm text-gray-700 justify-center ">-</span>
        )
      ),
    },
    {
      key: "joinDate",
      header: "Join Date",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-sm text-gray-700">{formatDate(row.joinDate)}</span>
        </div>
      ),
    },
    {
      key: "createdBy",
      header: "Created By",
      render: (row) => (
        row.createdBy ? (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
              <span className="text-[#f08c2b] text-xs font-semibold">{getInitials(row.createdBy)}</span>
            </div>
            <div className="text-sm text-gray-700">{row.createdBy}</div>
          </div>
        ) : (
          <span className="flex text-sm text-gray-700 justify-center ">-</span>
        )
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        return <ActionButtons actions={actions} row={row} />
      },
    },
  ]

  // Table actions configuration
  const actions = [
    {
      label: "View",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4" />,
    },
    {
      label: "Edit",
      onClick: handleEdit,
      variant: "primary",
      icon: <Edit className="h-4 w-4" />,
      disabled: !memberPermissions.editMember,
    },
  ]

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!memberPermissions.viewMembers) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export members.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadMembersExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded ${terminology.plural.toLowerCase()} ${format.toUpperCase()} report.`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Failed to download ${format.toUpperCase()}`
      const denied =
        msg === "missing_permission:view_members" ||
        msg.toLowerCase().includes("permission") ||
        msg.toLowerCase().includes("forbidden")
      if (denied) {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export members.",
        })
        return
      }
      toast({
        variant: "destructive",
        title: `${format === "excel" ? "Excel" : "PDF"} download failed`,
        description: msg,
      })
    } finally {
      setExporting(null)
    }
  }

  // Filter configuration — field names match the API query params: search, status, kyc
  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
    {
      field: "search",
      label: "Search by name, number, or phone",
      type: "text",
    },
    {
      field: "kyc",
      label: "KYC Status",
      options: [
        { value: "Verified", label: "Verified" },
        { value: "Pending", label: "Pending" },
        { value: "Rejected", label: "Rejected" },
      ],
      multiple: false,
      type: "select",
    },
    {
      field: "openingBalanceRecorded",
      label: "Opening Balance Recorded",
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
      multiple: false,
      type: "select",
    },
    {
      field: "membershipPaymentStatus",
      label: "Membership Payment",
      options: [
        { value: "fully_paid", label: "Fully Paid" },
        { value: "partial", label: "Partial" },
      ],
      multiple: false,
      type: "select",
    },
    {
      field: "kycApprovedAt",
      label: "Search By KYC Date Range",
      type:"date-range"
    },
    ]

    return withBranchFilterFirst(fields, {
      isSuperAdmin: memberPermissions.isSuperAdmin,
      branchOptions: memberPermissions.branches,
    })
  }, [memberPermissions.isSuperAdmin, memberPermissions.branches])

  // Tabular filter options
  const filters:Filter[] = [
    { label: 'All Members', value: "" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
    { value: "Suspended", label: "Suspended" },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-balance">{terminology.management}</h2>
            <p className="text-muted-foreground text-pretty">{terminology.description}</p>
          </div>
          {memberPermissions.createMember ? (
            <Link href="/users/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {terminology.addButton}
              </Button>
            </Link>
          ) : (
            <Tooltip
              title="Missing create_member permission"
              placement="top"
              arrow
              enterDelay={300}
              slotProps={{
                tooltip: {
                  sx: {
                    bgcolor: "white",
                    color: "#282f40",
                    fontSize: "0.75rem",
                    padding: "6px 10px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                    borderRadius: "8px",
                  },
                },
                arrow: { sx: { color: "white" } },
              }}
            >
              <span className="inline-block cursor-not-allowed">
                <Button disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  {terminology.addButton}
                </Button>
              </span>
            </Tooltip>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total {terminology.plural}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active {terminology.plural}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.filter((m) => m.status === "Active").length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">KYC Verified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.filter((m) => m.kycStatus === "Verified").length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending KYC</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.filter((m) => m.kycStatus === "Pending").length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Members DataTable */}
        <DataTable<UiClient>
          columns={columns}
          rows={users.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
          loading={loading}
          title={terminology.plural}
          exportActions={{
            onExcel: () => void downloadExport("excel"),
            onPdf: () => void downloadExport("pdf"),
            excelDisabled: loading || users.length === 0 || exporting !== null || !memberPermissions.viewMembers,
            pdfDisabled: loading || users.length === 0 || exporting !== null || !memberPermissions.viewMembers,
          }}
          tabularFilters={filters}
          tabularFilterField="status"
          filterFields={filterFields}
          onQueryParamsChange={handleQueryParamsChange}
          emptyMessage={`No ${terminology.plural.toLowerCase()} found`}
          //renderDetail={(row) => <MemberExpandableContent member={row} />}
          //onRowClick={(row) => setShowDetail(row.id)}
          getRowId={(row) => row.id}
          pagination={{
            page,
            rowsPerPage,
            total: users.length,
            onPageChange,
            onRowsPerPageChange,
          }}
        />
      </div>
    </>
  )
}
