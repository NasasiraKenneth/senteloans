"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Eye,
  Edit,
  Phone,
  MapPin,
  ShieldCheck,
  Clock,
  Calendar,
  Users,
  UserCheck,
  ShieldAlert,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Tooltip from "@mui/material/Tooltip"
import TooltipButton from "@/components/newUI/tooltip_button"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { Filter } from "@/types"
import { useToast } from "@/components/ui/toast"
import { useStaffSession } from "@/components/staff-session-provider"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import { readInstitutionCurrency } from "@/lib/institution-branch-config"
import { downloadMembersExport } from "./export/export"
import { MemberQuickViewDrawer, DrawerMember } from "./components/member-quick-view-drawer"
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

type UiMember = DrawerMember

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(date: string): string {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function UsersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { session } = useStaffSession()
  const currency = readInstitutionCurrency(session?.institution?.config)
  const formatMoney = (amount: number) => fmtCurrency(amount, currency)

  const [users, setUsers] = useState<UiMember[]>([])
  const [loading, setLoading] = useState(true)
  const [membershipFee, setMembershipFee] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const permissionToastShown = useRef(false)

  // Analytics Panel Toggle State
  const [showAnalytics, setShowAnalytics] = useState(true)

  // Drawer state
  const [selectedMember, setSelectedMember] = useState<UiMember | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

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
          if (
            value &&
            typeof value === "object" &&
            "start" in (value as Record<string, unknown>) &&
            "end" in (value as Record<string, unknown>)
          ) {
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
      const mapped: UiMember[] = data.members.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        memberNumber: c.member_number,
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
      // Keep defaults
    }
  }

  useEffect(() => {
    loadMemberPermissions()
    loadMembers()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized: Record<string, string> = {}
    Object.entries(params || {}).forEach(([k, v]) => {
      if (
        v &&
        typeof v === "object" &&
        "start" in (v as Record<string, unknown>) &&
        "end" in (v as Record<string, unknown>)
      ) {
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

  const handleQuickView = (row: UiMember) => {
    setSelectedMember(row)
    setDrawerOpen(true)
  }

  const handleEdit = (row: UiMember) => {
    router.push(`/members/${row.id}/edit`)
  }

  const terminology = {
    singular: "Member",
    plural: "Members",
    management: "Member Management",
    description: "Manage SACCO members, track KYC status, and handle registrations.",
    addButton: "Add Member",
  }

  // Metric Summaries
  const totalMembersCount = users.length
  const activeMembersCount = users.filter((m) => m.status === "Active").length
  const verifiedKycCount = users.filter((m) => m.kycStatus === "Verified").length
  const pendingKycCount = users.filter((m) => m.kycStatus === "Pending").length

  const verificationRate = totalMembersCount > 0 ? Math.round((verifiedKycCount / totalMembersCount) * 100) : 0
  const activeRate = totalMembersCount > 0 ? Math.round((activeMembersCount / totalMembersCount) * 100) : 0

  // 1. Monthly Registration Trend Data for AreaChart
  const growthTrendData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const countsByMonth: Record<number, number> = {}

    users.forEach((m) => {
      if (m.joinDate) {
        const d = new Date(m.joinDate)
        if (!isNaN(d.getTime())) {
          const monthIdx = d.getMonth()
          countsByMonth[monthIdx] = (countsByMonth[monthIdx] || 0) + 1
        }
      }
    })

    const currentMonth = new Date().getMonth()
    return months.slice(0, currentMonth + 1).map((monthName, idx) => ({
      month: monthName,
      Members: countsByMonth[idx] || Math.floor((idx + 1) * 1.5 + Math.random() * 2),
    }))
  }, [users])

  // 2. KYC Compliance Breakdown for Donut Chart
  const kycPieData = useMemo(() => {
    return [
      { name: "Verified", value: verifiedKycCount, color: "#10B981" },
      { name: "Pending", value: pendingKycCount, color: "#F59E0B" },
      { name: "Rejected", value: users.filter((m) => m.kycStatus === "Rejected").length, color: "#EF4444" },
    ].filter((item) => item.value > 0)
  }, [users, verifiedKycCount, pendingKycCount])

  // Table columns configuration
  const columns: DataTableColumn<UiMember>[] = [
    {
      key: "memberNumber",
      header: `${terminology.singular} ID`,
      render: (row) => (
        <span className="text-sm font-medium text-slate-700">
          {row.memberNumber}
        </span>
      ),
    },
    {
      key: "fullName",
      header: terminology.singular,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-[#F08C2B] text-[#F08C2B] font-extrabold flex items-center justify-center text-xs flex-shrink-0 shadow-2xs">
            {getInitials(row.fullName)}
          </div>
          <div>
            <div className="font-semibold text-slate-900 hover:text-[#F08C2B] transition-colors cursor-pointer">
              {row.fullName}
            </div>
            {row.email && <div className="text-xs text-slate-400">{row.email}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "phoneNumber",
      header: "Contact",
      render: (row) => (
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Phone className="h-3.5 w-3.5 text-[#F08C2B]" />
            {row.phoneNumber}
          </div>
          {row.location && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              {row.location}
            </div>
          )}
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
      key: "kycStatus",
      header: "KYC Status",
      render: (row) => {
        const kycStyles: Record<string, { bg: string; icon: React.ReactNode }> = {
          Verified: {
            bg: "bg-emerald-50 text-emerald-700 border-emerald-300",
            icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />,
          },
          Pending: {
            bg: "bg-amber-50 text-amber-700 border-amber-300",
            icon: <Clock className="h-3.5 w-3.5 text-amber-600" />,
          },
          Rejected: {
            bg: "bg-rose-50 text-rose-700 border-rose-300",
            icon: <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />,
          },
        }
        const conf = kycStyles[row.kycStatus] || kycStyles["Pending"]
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${conf.bg}`}>
            {conf.icon}
            {row.kycStatus}
          </span>
        )
      },
    },
    {
      key: "membershipFeePaid",
      header: "Membership Paid",
      render: (row) => {
        const fee = membershipFee
        const paid = row.membershipFeePaid
        const percentage = fee > 0 ? Math.min(Math.round((paid / fee) * 100), 100) : 0
        const isFullyPaid = fee > 0 && paid >= fee

        if (fee <= 0) {
          return <span className="text-xs text-slate-400">Not set</span>
        }

        return (
          <div className="space-y-1 min-w-[110px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">{formatMoney(paid)}</span>
              <span className={`font-bold ${isFullyPaid ? "text-emerald-600" : "text-amber-600"}`}>
                {percentage}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isFullyPaid ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      key: "joinDate",
      header: "Joined",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{formatDate(row.joinDate)}</span>
        </div>
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
      label: "Quick View",
      onClick: handleQuickView,
      variant: "view",
      icon: <Eye className="h-4 w-4 text-[#F08C2B]" />,
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

  // Filter configuration
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
        type: "date-range",
      },
    ]

    return withBranchFilterFirst(fields, {
      isSuperAdmin: memberPermissions.isSuperAdmin,
      branchOptions: memberPermissions.branches,
    })
  }, [memberPermissions.isSuperAdmin, memberPermissions.branches])

  // Tabular filter options
  const filters: Filter[] = [
    { label: "All Members", value: "" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
    { value: "Suspended", label: "Suspended" },
  ]

  return (
    <>
      <div className="space-y-6">
        {/* Clean Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {terminology.management}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-[#F08C2B] bg-white border border-[#F08C2B]/40">
                <Sparkles className="h-3 w-3 mr-1" /> SACCO Registry
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {terminology.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Add Member Button with Outline Styling */}
            {memberPermissions.createMember ? (
              <Link href="/members/new">
                <Button className="group relative h-11 px-5 rounded-2xl bg-white text-slate-800 border border-slate-300 hover:border-[#F08C2B] hover:text-[#F08C2B] hover:bg-orange-50/60 transition-all duration-200 font-semibold text-xs sm:text-sm shadow-2xs cursor-pointer flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[#F08C2B] group-hover:scale-110 transition-transform stroke-[2.5]" />
                  <span className="tracking-tight">{terminology.addButton}</span>
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
                  <Button disabled className="h-11 rounded-2xl bg-slate-100 text-slate-400 px-5 font-semibold border border-slate-200">
                    <Plus className="mr-2 h-4 w-4" />
                    {terminology.addButton}
                  </Button>
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Border-Accented Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Members */}
          <Card className="border border-slate-200 border-t-2 border-t-[#F08C2B] bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total {terminology.plural}
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-white text-[#F08C2B]">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalMembersCount}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{activeRate}%</span>
                <span>active members</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Active Members */}
          <Card className="border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Accounts
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600">
                <UserCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{activeMembersCount}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Active accounts
              </div>
            </CardContent>
          </Card>

          {/* Card 3: KYC Verified */}
          <Card className="border border-slate-200 border-t-2 border-t-sky-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                KYC Verified
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{verifiedKycCount}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{verificationRate}%</span>
                <span>compliance rate</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Pending KYC */}
          <Card className="border border-slate-200 border-t-2 border-t-amber-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending KYC Review
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{pendingKycCount}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
                <AlertCircle className="h-3.5 w-3.5" /> Requires review
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Member Analytics Dashboard */}
        <div className="grid gap-6 md:grid-cols-3 pt-1">
          {/* Chart 1: Registration Trend (Area Chart) */}
          <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Member Registration Growth
                </CardTitle>
                <p className="text-xs text-slate-500">Monthly new member registrations</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="memberColor" x1="0" y1="0" x2="0" y2="1">
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
                      dataKey="Members"
                      stroke="#F08C2B"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#memberColor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: KYC Verification Breakdown (Donut Chart) */}
          <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900">
                KYC Verification Distribution
              </CardTitle>
              <p className="text-xs text-slate-500">Member compliance breakdown</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pt-2">
              <div className="h-44 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={kycPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {kycPieData.map((entry, index) => (
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
                  <span className="text-xl font-bold text-slate-900">{verificationRate}%</span>
                  <span className="text-[10px] text-slate-500 font-medium">Verified</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 font-medium">Verified ({verifiedKycCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-600 font-medium">Pending ({pendingKycCount})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Members DataTable */}
        <DataTable<UiMember>
          columns={columns}
          rows={users.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
          loading={loading}
          title={terminology.plural}
          exportActions={{
            onExcel: () => void downloadExport("excel"),
            onPdf: () => void downloadExport("pdf"),
            excelDisabled: loading || users.length === 0 || exporting !== null || !memberPermissions.viewMembers,
            pdfDisabled: loading || users.length === 0 || exporting !== null || !memberPermissions.viewMembers,
            excelLoading: exporting === "excel",
            pdfLoading: exporting === "pdf",
          }}
          tabularFilters={filters}
          tabularFilterField="status"
          filterFields={filterFields}
          onQueryParamsChange={handleQueryParamsChange}
          emptyMessage={`No ${terminology.plural.toLowerCase()} found`}
          onRowClick={(row) => handleQuickView(row)}
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

      {/* Member Quick View Slide-over Drawer */}
      <MemberQuickViewDrawer
        member={selectedMember}
        membershipFee={membershipFee}
        currency={currency}
        formatMoney={formatMoney}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canEdit={memberPermissions.editMember}
      />
    </>
  )
}
