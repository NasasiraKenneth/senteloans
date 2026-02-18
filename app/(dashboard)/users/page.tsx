"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { Plus, Eye, Edit, Mail, Phone, MapPin, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"

type UiClient = {
  id: string
  fullName: string
  clientNumber: string
  phoneNumber: string
  email: string
  location: string
  status: string
  kycStatus: string
  loanOfficer: string
  membershipFeePaid: number
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG").format(amount)
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UiClient[]>([])
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [membershipFee, setMembershipFee] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadClients(queryParams?: object) {
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
      const res = await fetch(`/api/institution/clients?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to load clients")
      }
      const data = (await res.json()) as {
        clients: Array<{
          id: string
          client_number: string
          full_name: string
          phone_number: string
          email: string | null
          district: string | null
          status: string
          kyc_status: string
          loan_officer: string | null
          membership_fee_paid: number | null
        }>
        membershipFee: number
      }
      setMembershipFee(Number(data.membershipFee) || 0)
      const mapped: UiClient[] = data.clients.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        clientNumber: c.client_number,
        phoneNumber: c.phone_number,
        email: c.email || "",
        location: c.district || "",
        status: c.status,
        kycStatus: c.kyc_status,
        loanOfficer: c.loan_officer || "",
        membershipFeePaid: Number(c.membership_fee_paid) || 0,
      }))
      setUsers(mapped)
    } catch (e: any) {
      setError(e?.message || "Failed to load clients")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    loadClients()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadClients(params)
  }, [])

  const handleView = (row: UiClient) => {
    router.push(`/users/${row.id}`)
  }

  const handleEdit = (row: UiClient) => {
    router.push(`/users/${row.id}/edit`)
  }

  const getTerminology = () => {
    if (!session?.institution?.config) {
      return {
        singular: "Member",
        plural: "Members",
        management: "Member Management",
        description: "Manage SACCO members, track KYC status, and handle registrations.",
        addButton: "Add Member",
      }
    }

    const clientTerm = session.institution.config.clientTerminology || "Member"

    if (clientTerm === "Borrower") {
      return {
        singular: "Borrower",
        plural: "Borrowers",
        management: "Borrower Management",
        description: "Manage borrowers, track KYC status, and handle registrations.",
        addButton: "Add Borrower",
      }
    } else if (clientTerm === "Client") {
      return {
        singular: "Client",
        plural: "Clients",
        management: "Client Management",
        description: "Manage clients, track KYC status, and handle registrations.",
        addButton: "Add Client",
      }
    }

    return {
      singular: "Member",
      plural: "Members",
      management: "Member Management",
      description: "Manage SACCO members, track KYC status, and handle registrations.",
      addButton: "Add Member",
    }
  }

  const terminology = getTerminology()

  // Table columns configuration
  const columns: DataTableColumn<UiClient>[] = [
    {
      key: "clientNumber",
      header: `${terminology.singular} ID`,
      render: (row) => (
        <div className="text-sm font-mono font-medium text-gray-700 underline">{row.clientNumber}</div>
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
    },
  ]

  // Filter configuration — field names match the API query params: search, status, kyc
  const filterFields: FilterField[] = [
    {
      field: "search",
      label: "Search by name, number, or phone",
      type: "text",
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
  ]

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-balance">{terminology.management}</h2>
            <p className="text-muted-foreground text-pretty">{terminology.description}</p>
          </div>
          <Link href="/users/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {terminology.addButton}
            </Button>
          </Link>
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
        {error && <div className="text-sm text-red-600">{error}</div>}
        <DataTable<UiClient>
          columns={columns}
          rows={users.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
          loading={loading}
          title={terminology.plural}
          filterFields={filterFields}
          onQueryParamsChange={handleQueryParamsChange}
          emptyMessage={`No ${terminology.plural.toLowerCase()} found`}
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
