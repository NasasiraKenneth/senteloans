"use client"

import type React from "react"
import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import TooltipButton from "@/components/newUI/tooltip_button"
import { ArrowLeft, Save, CreditCard, Check, AlertCircle, User, MapPin, Users, Shield, Eye } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useStaffSession } from "@/components/staff-session-provider"
import { notFound } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { normalizeDateFromApi } from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-controls"
import MemberEditPersonalSection from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-personal-section"
import MemberEditLocationSection from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-location-section"
import MemberEditNokSection from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-nok-section"
import MemberEditPayoutSection from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-payout-section"
import MemberEditStatusSection from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-status-section"
import {
  emptyMemberEditFormData,
  type MemberEditFormData,
} from "@/app/(dashboard)/members/components/forms/memberEdit/member-edit-types"
import { readClientTerminology } from "@/lib/institution-branch-config"

interface UserEditPageProps {
  params: Promise<{ id: string }>
}

type MemberRecord = {
  full_name?: string
  member_number?: string
  phone_number?: string
  email?: string
  passport_photo?: string
  date_of_birth?: string
  join_date?: string
  gender?: string
  marital_status?: string
  district?: string
  village?: string
  occupation?: string
  monthly_income?: number | string
  next_of_kin_name?: string
  next_of_kin_relationship?: string
  next_of_kin_phone?: string
  status?: string
  notes?: string
  mobile_money_provider?: string
  mobile_money_number?: string
  bank_name?: string
  bank_account_number?: string
  bank_account_name?: string
  bank_branch?: string
}

function mapMemberToFormData(client: MemberRecord): MemberEditFormData {
  return {
    fullName: client.full_name || "",
    email: client.email || "",
    phoneNumber: client.phone_number || "",
    dateOfBirth: normalizeDateFromApi(client.date_of_birth),
    joinDate: normalizeDateFromApi(client.join_date),
    gender: client.gender || "",
    maritalStatus: client.marital_status || "",
    district: client.district || "",
    village: client.village || "",
    occupation: client.occupation || "",
    monthlyIncome: (client.monthly_income ?? "").toString(),
    nextOfKin: client.next_of_kin_name || "",
    nextOfKinRelationship: client.next_of_kin_relationship || "",
    nextOfKinPhone: client.next_of_kin_phone || "",
    status: client.status || "",
    notes: client.notes || "",
    mobileMoneyProvider: client.mobile_money_provider || "",
    mobileMoneyNumber: client.mobile_money_number || "",
    bankName: client.bank_name || "",
    bankAccountNumber: client.bank_account_number || "",
    bankAccountName: client.bank_account_name || "",
    bankBranch: client.bank_branch || "",
  }
}

export default function UserEditPage({ params }: UserEditPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { session } = useStaffSession()
  const [user, setUser] = useState<MemberRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [currency, setCurrency] = useState("UGX")
  const [memberPermissions, setMemberPermissions] = useState({ editMember: false })
  const { toast } = useToast()

  const [formData, setFormData] = useState<MemberEditFormData>(emptyMemberEditFormData())

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/institution/members/${id}`, { cache: "no-store" })
        if (!res.ok) {
          const { error: apiError } = await res.json()
          throw new Error(apiError || "Failed to load client")
        }
        const responseData = (await res.json()) as { member: MemberRecord }
        const client = responseData.member
        if (cancelled) return
        setUser(client)
        setFormData(mapMemberToFormData(client))
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load client")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    async function loadPermissions() {
      try {
        const res = await fetch("/api/institution/members/permissions", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { permissions?: { editMember?: boolean } }
        setMemberPermissions({ editMember: !!data.permissions?.editMember })
      } catch {
        setMemberPermissions({ editMember: false })
      }
    }
    loadPermissions()

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    async function loadCurrency() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (data?.config?.currency) setCurrency(data.config.currency)
        }
      } catch {
        // ignore
      }
    }
    loadCurrency()
  }, [])

  const getTerminology = () => {
    if (!session?.institution?.config) {
      return { singular: "Member", edit: "Edit Member", update: "Update Member" }
    }

    const clientTerm = readClientTerminology(session.institution.config)
    if (clientTerm === "Borrower") {
      return { singular: "Borrower", edit: "Edit Borrower", update: "Update Borrower" }
    }
    if (clientTerm === "Client") {
      return { singular: "Client", edit: "Edit Client", update: "Update Client" }
    }
    return { singular: "Member", edit: "Edit Member", update: "Update Member" }
  }

  const terminology = getTerminology()
  const canEdit = memberPermissions.editMember

  const handleInputChange = (field: keyof MemberEditFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!memberPermissions.editMember) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: `You do not have permission to edit ${terminology.singular.toLowerCase()} details.`,
      })
      return
    }

    const email = formData.email.trim()
    let phone = formData.phoneNumber.trim()
    if (!formData.fullName.trim()) {
      setError("Full Name is required")
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address")
      return
    }
    if (!phone) {
      setError("Phone Number is required")
      return
    }
    if (phone.startsWith("0")) phone = "+256" + phone.slice(1)
    if (formData.monthlyIncome && Number.isNaN(Number(formData.monthlyIncome))) {
      setError("Monthly Income must be a number")
      return
    }

    setSaving(true)
    try {
      const payload = {
        fullName: formData.fullName,
        email,
        phoneNumber: phone,
        dateOfBirth: formData.dateOfBirth,
        joinDate: formData.joinDate,
        gender: formData.gender,
        maritalStatus: formData.maritalStatus,
        district: formData.district,
        village: formData.village,
        occupation: formData.occupation,
        monthlyIncome: formData.monthlyIncome ? Number(formData.monthlyIncome) : undefined,
        nextOfKin: formData.nextOfKin,
        nextOfKinRelationship: formData.nextOfKin ? formData.nextOfKinRelationship : undefined,
        nextOfKinPhone: formData.nextOfKinPhone,
        notes: formData.notes,
        status: formData.status,
        mobileMoneyProvider: formData.mobileMoneyProvider || undefined,
        mobileMoneyNumber: formData.mobileMoneyNumber || undefined,
        bankName: formData.bankName || undefined,
        bankAccountNumber: formData.bankAccountNumber || undefined,
        bankAccountName: formData.bankAccountName || undefined,
        bankBranch: formData.bankBranch || undefined,
      }
      const res = await fetch(`/api/institution/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        const code = String(data?.code || data?.error || "")
        if (res.status === 403 && code === "missing_permission:edit_member") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: `You do not have permission to edit ${terminology.singular.toLowerCase()} details.`,
          })
          return
        }
        if (res.status === 403 && code === "super_admin_write_blocked") {
          toast({
            variant: "warning",
            title: "Read-only role",
            description:
              typeof data?.message === "string"
                ? data.message
                : "Super admins are not allowed to edit or modify data.",
          })
          return
        }
        if (res.status === 403 && code === "branch_inactive") {
          const statusLabel =
            typeof data?.branch_status === "string" ? data.branch_status.toLowerCase() : "inactive"
          toast({
            variant: "destructive",
            title: "Branch not active",
            description: `This member's branch is currently ${statusLabel}. Reactivate it from Settings → Branches before editing.`,
          })
          return
        }
        if (res.status === 403 && code === "branch_not_found") {
          toast({
            variant: "destructive",
            title: "Branch unavailable",
            description: "This member's branch could not be found. Contact your administrator.",
          })
          return
        }
        if (res.status === 403 && code === "member_inactive") {
          const statusLabel =
            typeof data?.member_status === "string" ? data.member_status.toLowerCase() : "inactive"
          toast({
            variant: "destructive",
            title: "Member not active",
            description: `This ${terminology.singular.toLowerCase()} is currently ${statusLabel}. Reactivate them before editing.`,
          })
          return
        }
        if (res.status === 403 && code === "cross_branch_operation_forbidden") {
          toast({
            variant: "warning",
            title: "Wrong branch",
            description: `You can only edit ${terminology.singular.toLowerCase()}s assigned to your branch.`,
          })
          return
        }
        if (res.status === 400 && code === "actor_branch_missing") {
          toast({
            variant: "destructive",
            title: "Branch not assigned",
            description: "Your account has no branch assigned. Contact your administrator.",
          })
          return
        }
        if (res.status === 400 && code === "invalid_phone_ug_format") {
          throw new Error("Phone number must start with +256 or 0 (Uganda format)")
        }
        if (res.status === 400 && code === "invalid_email") {
          throw new Error("Enter a valid email address")
        }
        throw new Error(
          (typeof data?.error === "string" ? data.error : "") ||
            `Failed to update ${terminology.singular.toLowerCase()}`,
        )
      }

      toast({
        variant: "success",
        title: `${terminology.singular} updated`,
        description: `${formData.fullName.trim()} has been saved successfully.`,
      })
      router.push(`/members/${id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to update ${terminology.singular.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto animate-pulse space-y-6">
        <div className="h-4 bg-muted rounded w-32" />
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="h-16 bg-muted/50" />
          <div className="px-6 pb-5 -mt-8 flex items-end gap-4">
            <div className="h-16 w-16 rounded-full bg-muted border-4 border-card" />
            <div className="flex-1 space-y-2 pb-1">
              <div className="h-5 bg-muted rounded w-48" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 w-24 bg-muted rounded-full" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-64 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  if (!user) {
    return notFound()
  }

  const initials = user.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?"

  const sections = [
    { id: "personal", label: "Personal Info", icon: User },
    { id: "location", label: "Location & Work", icon: MapPin },
    { id: "nok", label: "Next of Kin & Notes", icon: Users },
    { id: "payout", label: "Payout Accounts", icon: CreditCard },
    { id: "status", label: "Status", icon: Shield },
  ]

  const sectionProps = { formData, onChange: handleInputChange, canEdit, currency }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href={`/members/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {terminology.singular}
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-16 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
        <div className="px-6 pb-5">
          <div className="flex items-end gap-4 -mt-8">
            {user.passport_photo ? (
              <div className="relative h-16 w-16 shrink-0 rounded-full border-4 border-card overflow-hidden bg-muted shadow-sm">
                <Image src={user.passport_photo} alt={user.full_name || ""} fill className="object-cover" />
              </div>
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{initials}</span>
              </div>
            )}
            <div className="flex-1 min-w-0 pb-0.5">
              <h1 className="text-xl font-bold tracking-tight truncate">{user.full_name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                <span className="font-mono">{user.member_number}</span>
                <span className="text-border">·</span>
                <span>{user.phone_number}</span>
                {user.email && (
                  <>
                    <span className="hidden sm:inline text-border">·</span>
                    <span className="hidden sm:inline truncate max-w-[200px]">{user.email}</span>
                  </>
                )}
              </div>
            </div>
            <Link href={`/members/${id}`} className="hidden sm:inline-flex">
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                View Profile
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault()
              const el = document.getElementById(s.id)
              if (!el) return
              const scrollContainer = el.closest("main")
              if (scrollContainer) {
                const offset = el.offsetTop - scrollContainer.offsetTop - 24
                scrollContainer.scrollTo({ top: offset, behavior: "smooth" })
              } else {
                el.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </a>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          You have read-only access. Editing {terminology.singular.toLowerCase()} details requires the edit permission.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <MemberEditPersonalSection {...sectionProps} />
          <MemberEditLocationSection {...sectionProps} />
          <MemberEditNokSection {...sectionProps} />
          <MemberEditPayoutSection {...sectionProps} />
          <MemberEditStatusSection {...sectionProps} />
        </fieldset>

        <div className="sticky bottom-0 z-10 -mx-1 px-1">
          <div className="bg-background/95 backdrop-blur-sm border rounded-xl px-6 py-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground hidden sm:block">
                Review all sections before saving changes.
              </p>
              <div className="flex items-center gap-3 ml-auto">
                <Link href={`/members/${id}`}>
                  <Button variant="outline" type="button">
                    Cancel
                  </Button>
                </Link>
                {memberPermissions.editMember ? (
                  <Button type="submit" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : terminology.update}
                  </Button>
                ) : (
                  <TooltipButton
                    tooltip="Missing edit_member permission"
                    disabled
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-9 px-4 py-2 bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {terminology.update}
                  </TooltipButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
