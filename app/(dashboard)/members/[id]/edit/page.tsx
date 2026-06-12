"use client"

import type React from "react"
import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { updateInstitutionConfig } from "@/lib/session"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Popover from "@mui/material/Popover"
import ReeveDatePicker from "@/components/newUI/date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"

import { FileUpload } from "@/components/ui/file-upload"
// Removed mock-data; use live API
import { ArrowLeft, Save, CreditCard, Smartphone, Check, BookOpen, PiggyBank, Landmark, AlertCircle, User, MapPin, Users, FileText, Shield, Phone, Eye } from "lucide-react"
import Image from "next/image"
import { upload } from "@vercel/blob/client"
import Link from "next/link"
import { getSession } from "@/lib/session"
import { notFound } from "next/navigation"
import { calculateLoanTerms, normalizeLoanMethod } from "@/lib/loans/calculations"
import { useToast } from "@/components/ui/toast"

interface UserEditPageProps {
  params: Promise<{ id: string }>
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

type SelectOption = { value: string; label: string }
const normalizeDateFromApi = (value: unknown): string => {
  if (!value) return ""
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const prefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (prefix?.[1]) return prefix[1]

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const year = parts.find((p) => p.type === "year")?.value
  const month = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return year && month && day ? `${year}-${month}-${day}` : ""
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={`${inputClass} ${className || ""}`.trim()} />
}

function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: SelectOption[]
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = Boolean(anchor)
  const selectedLabel = options.find((o) => o.value === value)?.label

  return (
    <>
      <div
        onClick={(e) => {
          if (disabled) return
          setAnchor(e.currentTarget)
        }}
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 ${
          disabled
            ? "bg-muted/50 text-gray-500 cursor-not-allowed border-gray-200"
            : open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{selectedLabel || placeholder}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            width: anchor?.offsetWidth || 200,
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {options.map((opt) => {
            const isSelected = value === opt.value
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setAnchor(null)
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div
                  className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                    isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-800">{opt.label}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

export default function UserEditPage({ params }: UserEditPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<any | null>(null)
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // KYC docs state
  const [docs, setDocs] = useState({ passportPhoto: "", nationalIdFront: "", nationalIdBack: "" })
  const [docUploading, setDocUploading] = useState<{ [k: string]: boolean }>({})

  const [currency, setCurrency] = useState("UGX")
  const [memberPermissions, setMemberPermissions] = useState({
    editMember: false,
    editMembershipFee: false,
    editShares: false,
    editOpeningSavings: false,
    editOpeningLoans: false,
  })
  const { toast } = useToast()

  // Opening balances state
  const [obLoading, setObLoading] = useState(true)
  const [obRecorded, setObRecorded] = useState(false)
  const [obSavingsAccounts, setObSavingsAccounts] = useState<any[]>([])
  const [obLoans, setObLoans] = useState<any[]>([])
  const [obLoanProducts, setObLoanProducts] = useState<any[]>([])
  const [obSavingsBalance, setObSavingsBalance] = useState("")
  const [obSavingsAccountId, setObSavingsAccountId] = useState("")
  const [obLoanBalance, setObLoanBalance] = useState("")
  const [obLoanProductId, setObLoanProductId] = useState("")
  const [obLoanTenure, setObLoanTenure] = useState("")
  const [obLoanPrincipal, setObLoanPrincipal] = useState("")
  const [obLoanLastPaymentDate, setObLoanLastPaymentDate] = useState("")
  const [obLoanOriginalTenure, setObLoanOriginalTenure] = useState("")
  const [obSubmitting, setObSubmitting] = useState(false)
  const [obSuccess, setObSuccess] = useState<string | null>(null)
  const [obError, setObError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    joinDate: "",
    gender: "",
    maritalStatus: "",
    district: "",
    village: "",
    occupation: "",
    monthlyIncome: "",
    monthlySavings: "",
    nextOfKin: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
    status: "",
    notes: "",
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
    bankBranch: "",
  })

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/institution/members/${id}`, { cache: "no-store" })
        if (!res.ok) {
          const { error } = await res.json()
          throw new Error(error || "Failed to load client")
        }
        const responseData = (await res.json()) as any
        const client = responseData.member
        if (cancelled) return
        setUser(client)
        setFormData({
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
          monthlySavings: (client.monthly_savings ?? "").toString(),
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
        })
        setDocs({
          passportPhoto: client.passport_photo || "",
          nationalIdFront: client.national_id_front || "",
          nationalIdBack: client.national_id_back || "",
        })
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load client")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    async function loadPermissions() {
      try {
        const res = await fetch("/api/institution/members/permissions", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          permissions?: {
            editMember?: boolean
            editMembershipFee?: boolean
            editShares?: boolean
            editOpeningSavings?: boolean
            editOpeningLoans?: boolean
          }
        }
        setMemberPermissions({
          editMember: !!data.permissions?.editMember,
          editMembershipFee: !!data.permissions?.editMembershipFee,
          editShares: !!data.permissions?.editShares,
          editOpeningSavings: !!data.permissions?.editOpeningSavings,
          editOpeningLoans: !!data.permissions?.editOpeningLoans,
        })
      } catch {
        setMemberPermissions({
          editMember: false,
          editMembershipFee: false,
          editShares: false,
          editOpeningSavings: false,
          editOpeningLoans: false,
        })
      }
    }
    loadPermissions()
    return () => {
      cancelled = true
    }
  }, [id])

  // Load institution currency
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

  // Load opening balance data
  useEffect(() => {
    let cancelled = false
    async function loadOb() {
      setObLoading(true)
      try {
        const res = await fetch(`/api/institution/members/${id}/opening-balances`, { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setObRecorded(data.openingBalanceRecorded || false)
            setObSavingsAccounts(data.savingsAccounts || [])
            setObLoans(data.loans || [])
            setObLoanProducts(data.loanProducts || [])
            if (data.savingsAccounts?.length > 0) {
              setObSavingsAccountId(data.savingsAccounts[0].id)
            }
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setObLoading(false)
      }
    }
    loadOb()
    return () => { cancelled = true }
  }, [id])

  const handleOpeningBalanceSubmit = async () => {
    setObError(null)
    setObSuccess(null)

    const canEditOpeningSavings = memberPermissions.editOpeningSavings
    const canEditOpeningLoans = memberPermissions.editOpeningLoans

    if (!canEditOpeningSavings && !canEditOpeningLoans) {
      setObError("You do not have permission to edit opening balances")
      return
    }

    const savBal = canEditOpeningSavings ? (Number(obSavingsBalance) || 0) : 0
    const loanBal = canEditOpeningLoans ? (Number(obLoanBalance) || 0) : 0

    if (savBal <= 0 && loanBal <= 0) {
      setObError("Enter at least a savings balance or loan balance")
      return
    }

    setObSubmitting(true)
    try {
      const payload: Record<string, unknown> = {}
      if (savBal > 0) {
        payload.savingsBalance = savBal
        if (obSavingsAccountId) payload.savingsAccountId = obSavingsAccountId
      }
      if (loanBal > 0) {
        if (!obLoanProductId) {
          setObError("Select a loan product for the opening loan balance")
          setObSubmitting(false)
          return
        }
        const remTenure = Number(obLoanTenure) || 0
        if (remTenure <= 0) {
          setObError("Remaining tenure is required for loan opening balance")
          setObSubmitting(false)
          return
        }
        const principal = Number(obLoanPrincipal) || 0
        if (principal > 0 && principal < loanBal) {
          setObError("Original principal amount cannot be less than the outstanding balance")
          setObSubmitting(false)
          return
        }
        const origTenure = Number(obLoanOriginalTenure) || 0
        if (origTenure > 0 && remTenure > 0 && origTenure < remTenure) {
          setObError("Original tenure cannot be less than remaining tenure")
          setObSubmitting(false)
          return
        }
        payload.loanOutstandingBalance = loanBal
        payload.loanProductId = obLoanProductId
        if (obLoanTenure) payload.loanTenureMonths = Number(obLoanTenure)
        if (principal > 0) payload.loanPrincipalAmount = principal
        if (obLoanLastPaymentDate) payload.loanLastPaymentDate = obLoanLastPaymentDate
        if (origTenure > 0) payload.loanOriginalTenure = origTenure
      }

      const res = await fetch(`/api/institution/members/${id}/opening-balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to record opening balances")

      setObRecorded(true)
      setObSuccess("Opening balances recorded successfully")
      setObSavingsBalance("")
      setObLoanBalance("")
      setObLoanPrincipal("")
      setObLoanLastPaymentDate("")
      setObLoanOriginalTenure("")

      // Reload the data
      const reloadRes = await fetch(`/api/institution/members/${id}/opening-balances`, { cache: "no-store" })
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json()
        setObSavingsAccounts(reloadData.savingsAccounts || [])
        setObLoans(reloadData.loans || [])
      }
    } catch (err: any) {
      setObError(err?.message || "Failed to record opening balances")
    } finally {
      setObSubmitting(false)
    }
  }

  // Local fallback config if session is missing or stale
  const [instConfig, setInstConfig] = useState<any | null>(null)
  const hasSavings =
    session?.institution?.config?.modules?.savings ?? instConfig?.modules?.savings

  // If session config is missing, hydrate from API and cache locally (best-effort)
  useEffect(() => {
    async function hydrateConfig() {
      if (!session?.institution?.config) {
        try {
          const res = await fetch(`/api/institution/settings`, { cache: "no-store" })
          if (res.ok) {
            const data = await res.json()
            if (data?.config) {
              setInstConfig(data.config)
              // Attempt to cache in localStorage if a session exists
              try {
                updateInstitutionConfig(data.config)
              } catch {}
            }
          }
        } catch (_) {
          // ignore
        }
      }
    }
    hydrateConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.institution?.config])

  const getTerminology = () => {
    if (!session?.institution?.config) {
      return {
        singular: "Member",
        edit: "Edit Member",
        update: "Update Member",
      }
    }

    const clientTerm = session.institution.config.clientTerminology || "Member"

    if (clientTerm === "Borrower") {
      return {
        singular: "Borrower",
        edit: "Edit Borrower",
        update: "Update Borrower",
      }
    } else if (clientTerm === "Client") {
      return {
        singular: "Client",
        edit: "Edit Client",
        update: "Update Client",
      }
    }

    return {
      singular: "Member",
      edit: "Edit Member",
      update: "Update Member",
    }
  }

  const terminology = getTerminology()

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleDocUpload = async (docType: "passport_photo" | "national_id_front" | "national_id_back", file: File) => {
    try {
      setDocUploading((p) => ({ ...p, [docType]: true }))
      const name = `client-kyc/${id}/${docType}-${Date.now()}-${file.name}`
      const blobResult = await upload(name, file, {
        handleUploadUrl: "/api/vercel_blob/upload",
        access: "public",
        contentType: file.type,
      })

      if (!blobResult?.url) {
        throw new Error("Upload completed but no URL was returned")
      }

      const saveRes = await fetch(`/api/institution/members/${id}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, url: blobResult.url }),
      })
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}))
        throw new Error(saveData?.error || "Failed to save document URL to database")
      }

      setDocs((prev) => {
        const next = { ...prev }
        if (docType === "passport_photo") next.passportPhoto = blobResult.url
        if (docType === "national_id_front") next.nationalIdFront = blobResult.url
        if (docType === "national_id_back") next.nationalIdBack = blobResult.url
        return next
      })
    } catch (e: any) {
      console.error("[kyc-upload] error:", e)
      setError(e?.message || "Failed to upload document")
      throw e
    } finally {
      setDocUploading((p) => ({ ...p, [docType]: false }))
    }
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

    // Client-side validation
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
    if (formData.monthlySavings && Number.isNaN(Number(formData.monthlySavings))) {
      setError("Monthly Savings must be a number")
      return
    }

    setSaving(true)
    try {
      // Update member information
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
        monthlySavings: formData.monthlySavings ? Number(formData.monthlySavings) : undefined,
        nextOfKin: formData.nextOfKin,
        nextOfKinRelationship: formData.nextOfKin ? formData.nextOfKinRelationship : undefined,
        nextOfKinPhone: formData.nextOfKinPhone,
        notes: formData.notes,
        status: formData.status,
        // Payout accounts
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
        const { error } = await res.json()
        if (res.status === 403 && error === "missing_permission:edit_member") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: `You do not have permission to edit ${terminology.singular.toLowerCase()} details.`,
          })
          return
        }
        if (res.status === 400 && error === "invalid_phone_ug_format") {
          throw new Error("Phone number must start with +256 or 0 (Uganda format)")
        }
        if (res.status === 400 && error === "invalid_email") {
          throw new Error("Enter a valid email address")
        }
        throw new Error(error || `Failed to update ${terminology.singular.toLowerCase()}`)
      }

      toast({
        variant: "success",
        title: `${terminology.singular} updated`,
        description: `${formData.fullName.trim()} has been saved successfully.`,
      })
      router.push(`/users/${id}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || `Failed to update ${terminology.singular.toLowerCase()}`)
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
    ? user.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const sections = [
    { id: "personal", label: "Personal Info", icon: User },
    { id: "kyc", label: "KYC Documents", icon: FileText },
    { id: "location", label: "Location & Work", icon: MapPin },
    { id: "nok", label: "Next of Kin", icon: Users },
    { id: "payout", label: "Payout Accounts", icon: CreditCard },
    { id: "opening-balances", label: "Opening Balances", icon: BookOpen },
    { id: "status", label: "Status & Notes", icon: Shield },
  ]

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
            {/* Back link */}
            <div>
              <Link href={`/members/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to {terminology.singular}
              </Link>
            </div>

            {/* Profile header */}
            <div className="relative overflow-hidden rounded-xl border bg-card">
              <div className="h-16 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
              <div className="px-6 pb-5">
                <div className="flex items-end gap-4 -mt-8">
                  {user.passport_photo ? (
                    <div className="relative h-16 w-16 shrink-0 rounded-full border-4 border-card overflow-hidden bg-muted shadow-sm">
                      <Image src={user.passport_photo} alt={user.full_name} fill className="object-cover" />
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

            {/* Section navigation pills */}
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

            {/* Alerts */}
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

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <Card id="personal" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>Name, contact details, and demographic information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <StyledInput
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange("fullName", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <StyledInput
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <StyledInput
                        id="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <ReeveDatePicker
                        value={formData.dateOfBirth}
                        onChange={(value) => handleInputChange("dateOfBirth", value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <StyledSelect
                        value={formData.gender}
                        onChange={(value) => handleInputChange("gender", value)}
                        placeholder="Select gender"
                        options={[
                          { value: "Male", label: "Male" },
                          { value: "Female", label: "Female" },
                          { value: "Other", label: "Other" },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maritalStatus">Marital Status</Label>
                      <StyledSelect
                        value={formData.maritalStatus}
                        onChange={(value) => handleInputChange("maritalStatus", value)}
                        placeholder="Select marital status"
                        options={[
                          { value: "Single", label: "Single" },
                          { value: "Married", label: "Married" },
                          { value: "Divorced", label: "Divorced" },
                          { value: "Widowed", label: "Widowed" },
                        ]}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card id="kyc" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    KYC Documents
                  </CardTitle>
                  <CardDescription>
                    Upload identification documents for verification. Drag and drop files or click to browse.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FileUpload
                    label="Passport Photo"
                    description="Upload a clear passport-style photo (JPG, PNG, or PDF)"
                    currentUrl={docs.passportPhoto}
                    uploading={docUploading["passport_photo"]}
                    onUpload={(file) => handleDocUpload("passport_photo", file)}
                    accept="image/*,application/pdf"
                    maxSize={5}
                    layout="inline"
                  />

                  <FileUpload
                    label="National ID (Front)"
                    description="Upload the front side of your national ID card"
                    currentUrl={docs.nationalIdFront}
                    uploading={docUploading["national_id_front"]}
                    onUpload={(file) => handleDocUpload("national_id_front", file)}
                    accept="image/*,application/pdf"
                    maxSize={5}
                    layout="inline"
                  />

                  <FileUpload
                    label="National ID (Back)"
                    description="Upload the back side of your national ID card"
                    currentUrl={docs.nationalIdBack}
                    uploading={docUploading["national_id_back"]}
                    onUpload={(file) => handleDocUpload("national_id_back", file)}
                    accept="image/*,application/pdf"
                    maxSize={5}
                    layout="inline"
                  />
                </CardContent>
              </Card>

              {/* Location & Occupation */}
              <Card id="location" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Location & Occupation
                  </CardTitle>
                  <CardDescription>Address and employment information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="district">District</Label>
                      <StyledInput
                        id="district"
                        value={formData.district}
                        onChange={(e) => handleInputChange("district", e.target.value)}
                        placeholder="e.g., Kampala"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="village">Village / Area</Label>
                      <StyledInput
                        id="village"
                        value={formData.village}
                        onChange={(e) => handleInputChange("village", e.target.value)}
                        placeholder="e.g., Ntinda"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="occupation">Occupation</Label>
                      <StyledInput
                        id="occupation"
                        value={formData.occupation}
                        onChange={(e) => handleInputChange("occupation", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyIncome">Monthly Income ({currency})</Label>
                      <StyledInput
                        id="monthlyIncome"
                        value={formData.monthlyIncome}
                        onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlySavings">Monthly Savings ({currency})</Label>
                      <StyledInput
                        id="monthlySavings"
                        type="number"
                        min={0}
                        value={formData.monthlySavings}
                        onChange={(e) => handleInputChange("monthlySavings", e.target.value)}
                        placeholder="e.g., 50,000"
                      />
                      <p className="text-xs text-muted-foreground">
                        The agreed monthly savings contribution.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Emergency Contact */}
              <Card id="nok" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Emergency Contact
                  </CardTitle>
                  <CardDescription>Next of kin and beneficiary details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKin">Full Name</Label>
                      <StyledInput
                        id="nextOfKin"
                        value={formData.nextOfKin}
                        onChange={(e) => handleInputChange("nextOfKin", e.target.value)}
                        placeholder="e.g., Mary Nakamya"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                      <StyledSelect
                        value={formData.nextOfKinRelationship}
                        onChange={(value) => handleInputChange("nextOfKinRelationship", value)}
                        placeholder="Select relationship"
                        options={[
                          { value: "Spouse", label: "Spouse" },
                          { value: "Father", label: "Father" },
                          { value: "Mother", label: "Mother" },
                          { value: "Son", label: "Son" },
                          { value: "Daughter", label: "Daughter" },
                          { value: "Brother", label: "Brother" },
                          { value: "Sister", label: "Sister" },
                          { value: "Uncle", label: "Uncle" },
                          { value: "Aunt", label: "Aunt" },
                          { value: "Friend", label: "Friend" },
                          { value: "Other", label: "Other" },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinPhone">Phone Number</Label>
                      <StyledInput
                        id="nextOfKinPhone"
                        value={formData.nextOfKinPhone}
                        onChange={(e) => handleInputChange("nextOfKinPhone", e.target.value)}
                        placeholder="e.g., +256701234567"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Linked Payout Accounts */}
              <Card id="payout" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Linked Payout Accounts
                  </CardTitle>
                  <CardDescription>
                    Configure payout accounts for loan disbursements and repayment collections.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Mobile Money Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Smartphone className="h-4 w-4 text-primary" />
                      <h4 className="font-medium">Mobile Money Account</h4>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="mobileMoneyProvider">Mobile Money Provider</Label>
                        <StyledSelect
                          value={formData.mobileMoneyProvider}
                          onChange={(value) => handleInputChange("mobileMoneyProvider", value)}
                          placeholder="Select provider"
                          options={[
                            { value: "MTN Mobile Money", label: "MTN Mobile Money" },
                            { value: "Airtel Money", label: "Airtel Money" },
                            { value: "M-Sente", label: "M-Sente" },
                          ]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mobileMoneyNumber">Mobile Money Number</Label>
                        <StyledInput
                          id="mobileMoneyNumber"
                          value={formData.mobileMoneyNumber}
                          onChange={(e) => handleInputChange("mobileMoneyNumber", e.target.value)}
                          placeholder="e.g., +256701234567"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bank Account Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <h4 className="font-medium">Bank Account Details</h4>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="bankName">Bank Name</Label>
                        <StyledSelect
                          value={formData.bankName}
                          onChange={(value) => handleInputChange("bankName", value)}
                          placeholder="Select bank"
                          options={[
                            { value: "Stanbic Bank", label: "Stanbic Bank" },
                            { value: "Centenary Bank", label: "Centenary Bank" },
                            { value: "DFCU Bank", label: "DFCU Bank" },
                            { value: "Equity Bank", label: "Equity Bank" },
                            { value: "Bank of Africa", label: "Bank of Africa" },
                            { value: "PostBank Uganda", label: "PostBank Uganda" },
                            { value: "Other", label: "Other" },
                          ]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountNumber">Account Number</Label>
                        <StyledInput
                          id="bankAccountNumber"
                          value={formData.bankAccountNumber}
                          onChange={(e) => handleInputChange("bankAccountNumber", e.target.value)}
                          placeholder="e.g., 9030012345678"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountName">Account Name</Label>
                        <StyledInput
                          id="bankAccountName"
                          value={formData.bankAccountName}
                          onChange={(e) => handleInputChange("bankAccountName", e.target.value)}
                          placeholder="Account holder name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankBranch">Branch</Label>
                        <StyledInput
                          id="bankBranch"
                          value={formData.bankBranch}
                          onChange={(e) => handleInputChange("bankBranch", e.target.value)}
                          placeholder="e.g., Kampala Main Branch"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Opening Balances */}
              <Card id="opening-balances" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Opening Balances
                  </CardTitle>
                  <CardDescription>
                    Record existing savings and loan balances for members migrating from a previous system.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {obLoading ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  ) : (
                    <>
                      {obRecorded && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700">Opening balances have been recorded for this {terminology.singular.toLowerCase()}</span>
                        </div>
                      )}

                      {obSuccess && (
                        <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded">{obSuccess}</div>
                      )}
                      {obError && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{obError}</div>
                      )}

                      {/* Current Balances Summary */}
                      {(obSavingsAccounts.length > 0 || obLoans.length > 0) && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-900">Current Balances</h4>
                          <div className="grid gap-3 md:grid-cols-2">
                            {obSavingsAccounts.map((acc: any) => (
                              <div key={acc.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                                <PiggyBank className="h-5 w-5 text-green-600" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{acc.account_number}</div>
                                  <div className="text-xs text-muted-foreground">{acc.account_type} Savings</div>
                                </div>
                                <div className="text-sm font-bold text-green-700">
                                  {currency} {Number(acc.available_balance).toLocaleString()}
                                </div>
                              </div>
                            ))}
                            {obLoans.filter((l: any) => ["Active", "Disbursed"].includes(l.status)).map((loan: any) => (
                              <div key={loan.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                                <Landmark className="h-5 w-5 text-orange-600" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{loan.application_id}</div>
                                  <div className="text-xs text-muted-foreground">{loan.product_name || "Loan"}</div>
                                </div>
                                <div className="text-sm font-bold text-orange-700">
                                  {currency} {Number(loan.outstanding_balance).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Record Opening Balances Form */}
                      <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {obRecorded
                              ? "You can record additional opening balances if needed."
                              : "Record the member's balances from their previous system."}
                          </span>
                        </div>

                        {/* Savings Opening Balance */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <PiggyBank className="h-4 w-4 text-green-600" />
                            <h4 className="font-medium text-sm">Savings Opening Balance</h4>
                          </div>
                          {obSavingsAccounts.length === 0 ? (
                            <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 p-2 rounded">
                              No savings account found. One will be created when the member was added.
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                              {obSavingsAccounts.length > 1 && (
                                <div className="space-y-2">
                                  <Label>Savings Account</Label>
                                  <StyledSelect
                                    value={obSavingsAccountId}
                                    onChange={setObSavingsAccountId}
                                    placeholder="Select account"
                                    disabled={!memberPermissions.editOpeningSavings}
                                    options={obSavingsAccounts.map((acc: any) => ({
                                      value: acc.id,
                                      label: `${acc.account_number} (${acc.account_type})`,
                                    }))}
                                  />
                                </div>
                              )}
                              <div className="space-y-2">
                                <Label htmlFor="obSavingsBalance">Opening Savings Balance ({currency})</Label>
                                <StyledInput
                                  id="obSavingsBalance"
                                  type="number"
                                  min={0}
                                  value={obSavingsBalance}
                                  disabled={!memberPermissions.editOpeningSavings}
                                  onChange={(e) => setObSavingsBalance(e.target.value)}
                                  placeholder="e.g., 500,000"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Loan Opening Balance */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <Landmark className="h-4 w-4 text-orange-600" />
                            <h4 className="font-medium text-sm">Loan Opening Balance</h4>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Provide the original loan details to create a full loan lifecycle with repayment schedule.
                          </p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Loan Product <span className="text-red-500">*</span></Label>
                              <StyledSelect
                                value={obLoanProductId}
                                onChange={setObLoanProductId}
                                placeholder="Select loan product"
                                disabled={!memberPermissions.editOpeningLoans}
                                options={obLoanProducts.map((p: any) => ({
                                  value: p.id,
                                  label: `${p.product_name} (${p.interest_rate}%)`,
                                }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanPrincipal">Original Loan Amount ({currency}) <span className="text-red-500">*</span></Label>
                              <StyledInput
                                id="obLoanPrincipal"
                                type="number"
                                min={0}
                                value={obLoanPrincipal}
                                disabled={!memberPermissions.editOpeningLoans}
                                onChange={(e) => setObLoanPrincipal(e.target.value)}
                                placeholder="e.g., 2,000,000"
                              />
                              <p className="text-xs text-muted-foreground">The full principal amount that was originally disbursed</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanBalance">Outstanding Balance ({currency}) <span className="text-red-500">*</span></Label>
                              <StyledInput
                                id="obLoanBalance"
                                type="number"
                                min={0}
                                value={obLoanBalance}
                                disabled={!memberPermissions.editOpeningLoans}
                                onChange={(e) => setObLoanBalance(e.target.value)}
                                placeholder="e.g., 1,000,000"
                              />
                              <p className="text-xs text-muted-foreground">The amount still owed today</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanOriginalTenure">Original Tenure (months)</Label>
                              <StyledInput
                                id="obLoanOriginalTenure"
                                type="number"
                                min={1}
                                value={obLoanOriginalTenure}
                                disabled={!memberPermissions.editOpeningLoans}
                                onChange={(e) => setObLoanOriginalTenure(e.target.value)}
                                placeholder="e.g., 24"
                              />
                              <p className="text-xs text-muted-foreground">Total months the loan was originally issued for</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanTenure">Remaining Tenure (months) <span className="text-red-500">*</span></Label>
                              <StyledInput
                                id="obLoanTenure"
                                type="number"
                                min={1}
                                value={obLoanTenure}
                                disabled={!memberPermissions.editOpeningLoans}
                                onChange={(e) => setObLoanTenure(e.target.value)}
                                placeholder="e.g., 12"
                              />
                              <p className="text-xs text-muted-foreground">Months still remaining to be paid</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanLastPaymentDate">Last Payment Date</Label>
                              <ReeveDatePicker
                                value={obLoanLastPaymentDate}
                                onChange={(v) => {
                                  if (!memberPermissions.editOpeningLoans) return
                                  setObLoanLastPaymentDate(v)
                                }}
                                placeholder="Select date"
                              />
                              <p className="text-xs text-muted-foreground">Date of the most recent payment in the previous system</p>
                            </div>
                          </div>

                          {/* Loan calculation preview */}
                          {Number(obLoanBalance) > 0 && Number(obLoanTenure) > 0 && obLoanProductId && (() => {
                            const bal = Number(obLoanBalance)
                            const rem = Number(obLoanTenure)
                            const selectedProduct = obLoanProducts.find((p: any) => p.id === obLoanProductId)
                            const rate = selectedProduct ? Number(selectedProduct.interest_rate) : 0
                            const terms = calculateLoanTerms(
                              bal,
                              rate,
                              rem,
                              selectedProduct?.interest_calculation_method
                            )
                            const mp = terms.monthlyPayment
                            const totalRepayment = terms.totalAmount
                            const totalInterest = totalRepayment - bal
                            const calcMethod = normalizeLoanMethod(selectedProduct?.interest_calculation_method)
                              .replace("_", " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())
                            return (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                                <h5 className="text-xs font-semibold text-blue-800">Projected Repayment Schedule</h5>
                                <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                                  <div>
                                    <span className="block text-blue-500">Monthly Payment</span>
                                    <span className="font-semibold">{currency} {Math.round(mp).toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="block text-blue-500">Total Interest</span>
                                    <span className="font-semibold">{currency} {Math.round(totalInterest).toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="block text-blue-500">Total Repayment</span>
                                    <span className="font-semibold">{currency} {Math.round(totalRepayment).toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="text-xs text-blue-600 mt-1">
                                  Method: <span className="font-semibold">{calcMethod}</span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>

                        <Button
                          type="button"
                          onClick={handleOpeningBalanceSubmit}
                          disabled={
                            obSubmitting ||
                            (!memberPermissions.editOpeningSavings && !memberPermissions.editOpeningLoans) ||
                            ((memberPermissions.editOpeningSavings ? Number(obSavingsBalance) : 0) <= 0 &&
                              (memberPermissions.editOpeningLoans ? Number(obLoanBalance) : 0) <= 0)
                          }
                          className="w-full sm:w-auto"
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          {obSubmitting ? "Recording..." : "Record Opening Balances"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Status & Management */}
              <Card id="status" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Status & Management
                  </CardTitle>
                  <CardDescription>Account status and administrative notes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="status">Account Status</Label>
                      <StyledSelect
                        value={formData.status}
                        onChange={(value) => handleInputChange("status", value)}
                        placeholder="Select status"
                        options={[
                          { value: "Active", label: "Active" },
                          { value: "Inactive", label: "Inactive" },
                          { value: "Suspended", label: "Suspended" },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="joinDate">Join Date</Label>
                      <ReeveDatePicker
                        value={formData.joinDate}
                        onChange={(value) => handleInputChange("joinDate", value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      placeholder="Additional notes or comments..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Sticky Save Bar */}
              <div className="sticky bottom-0 z-10 -mx-1 px-1">
                <div className="bg-background/95 backdrop-blur-sm border rounded-xl px-6 py-4 shadow-lg">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground hidden sm:block">
                      Review all sections before saving changes.
                    </p>
                    <div className="flex items-center gap-3 ml-auto">
                      <Link href={`/users/${id}`}>
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
    </>
  )
}
