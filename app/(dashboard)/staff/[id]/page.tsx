"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react"
import EditStaff from "../components/edit/editStaff"

type StaffDetail = {
  id: string
  full_name: string
  email: string
  phone_number: string | null
  branch_name: string | null
  role: string
  role_id: string
  status: string
  joined_at: string | null
  last_login: string | null
  created_at: string
  username: string | null
}

function formatRole(role: string): string {
  switch (role) {
    case "institution_admin":
      return "Admin"
    case "super_admin":
      return "Super Admin"
    case "manager":
      return "Manager"
    case "loan_officer":
      return "Loan Officer"
    case "teller":
      return "Teller"
    default:
      return role.replace(/_/g, " ")
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function StaffDetailPage() {
  const params = useParams()
  const staffId = params.id as string
  const [staff, setStaff] = useState<StaffDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const loadStaff = async () => {
    setLoading(true)
    setError(null)
    try {
      const [staffRes, permRes] = await Promise.all([
        fetch(`/api/institution/staff/${staffId}`, { cache: "no-store" }),
        fetch("/api/institution/staff/permissions", { cache: "no-store" }),
      ])
      const staffBody = await staffRes.json().catch(() => ({}))
      const permBody = await permRes.json().catch(() => ({}))

      if (!staffRes.ok) {
        throw new Error(staffBody.error || "Failed to load staff member")
      }

      setStaff(staffBody.staff as StaffDetail)
      setCanEdit(Boolean(permBody?.permissions?.editUser))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load staff member")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (staffId) void loadStaff()
  }, [staffId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
      </div>
    )
  }

  if (error || !staff) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/staff">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Staff
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-600">
            {error || "Staff member not found"}
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusStyles: Record<string, string> = {
    Active: "bg-green-100 text-green-700 border border-green-200",
    Inactive: "bg-gray-100 text-gray-700 border border-gray-200",
    Suspended: "bg-red-100 text-red-700 border border-red-200",
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/staff">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h2 className="text-2xl font-bold">{staff.full_name}</h2>
              <p className="text-muted-foreground text-sm">Staff profile</p>
            </div>
          </div>
          {canEdit ? (
            <Button className="hover:bg-black/70 hover:text-[#f08c2b]" onClick={() => setIsEditOpen(true)}>
              Edit Staff
            </Button>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
                <span className="text-[#f08c2b] text-2xl font-semibold">{getInitials(staff.full_name)}</span>
              </div>
              <div>
                <p className="font-semibold text-lg">{staff.full_name}</p>
                <p className="text-sm text-muted-foreground">@{staff.username || "—"}</p>
              </div>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${statusStyles[staff.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}
              >
                {staff.status}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={staff.email} />
              <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={staff.phone_number || "—"} />
              <DetailRow icon={<ShieldCheck className="h-4 w-4" />} label="Role" value={formatRole(staff.role)} />
              <DetailRow icon={<User className="h-4 w-4" />} label="Branch" value={staff.branch_name || "—"} />
              <DetailRow icon={<Calendar className="h-4 w-4" />} label="Joined" value={formatDate(staff.joined_at || staff.created_at)} />
              <DetailRow icon={<Clock className="h-4 w-4" />} label="Last login" value={timeAgo(staff.last_login)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <EditStaff
        isOpen={isEditOpen}
        staffId={isEditOpen ? staffId : null}
        onClose={() => setIsEditOpen(false)}
        onSuccess={() => {
          setIsEditOpen(false)
          void loadStaff()
        }}
      />
    </>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  )
}
