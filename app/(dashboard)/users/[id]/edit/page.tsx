"use client"

import type React from "react"
import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { updateInstitutionConfig } from "@/lib/session"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { FileUpload } from "@/components/ui/file-upload"
// Removed mock-data; use live API
import { ArrowLeft, Save, CreditCard, Smartphone, Share, Calculator, DollarSign, Check, BookOpen, PiggyBank, Landmark, AlertCircle, User, MapPin, Users, FileText, Shield, Phone, Eye } from "lucide-react"
import Image from "next/image"
import { upload } from "@vercel/blob/client"
import Link from "next/link"
import { getSession } from "@/lib/session"
import { notFound } from "next/navigation"

interface UserEditPageProps {
  params: Promise<{ id: string }>
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

  // Membership fee state
  const [membershipFee, setMembershipFee] = useState(0)
  const [membershipFeePaid, setMembershipFeePaid] = useState(0)
  const [feePaymentAmount, setFeePaymentAmount] = useState("")
  const [feePaymentMode, setFeePaymentMode] = useState("Cash")
  const [feePaymentType, setFeePaymentType] = useState<"remaining" | "custom">("remaining")
  const [feeSubmitting, setFeeSubmitting] = useState(false)
  const [feeSuccess, setFeeSuccess] = useState<string | null>(null)
  const [feePayments, setFeePayments] = useState<any[]>([])
  const [currency, setCurrency] = useState("UGX")

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
    gender: "",
    maritalStatus: "",
    location: "",
    occupation: "",
    monthlyIncome: "",
    nextOfKin: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
    status: "",
    kycStatus: "",
    loanOfficer: "",
    notes: "",
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
    bankBranch: "",
    sharesToBuy: "",
  })

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/institution/clients/${id}`, { cache: "no-store" })
        if (!res.ok) {
          const { error } = await res.json()
          throw new Error(error || "Failed to load client")
        }
        const responseData = (await res.json()) as any
        const client = responseData.client
        if (cancelled) return
        setUser(client)
        if (typeof responseData.membershipFee === "number") {
          setMembershipFee(responseData.membershipFee)
        }
        if (typeof client.membership_fee_paid === "number") {
          setMembershipFeePaid(client.membership_fee_paid)
        }
        setFormData({
          fullName: client.full_name || "",
          email: client.email || "",
          phoneNumber: client.phone_number || "",
          dateOfBirth: client.date_of_birth ? client.date_of_birth.slice(0, 10) : "",
          gender: client.gender || "",
          maritalStatus: client.marital_status || "",
          location: [client.village, client.district].filter(Boolean).join(", "),
          occupation: client.occupation || "",
          monthlyIncome: (client.monthly_income ?? "").toString(),
          nextOfKin: client.next_of_kin_name || "",
          nextOfKinRelationship: client.next_of_kin_relationship || "",
          nextOfKinPhone: client.next_of_kin_phone || "",
          status: client.status || "",
          kycStatus: client.kyc_status || "",
          loanOfficer: client.loan_officer || "",
          notes: client.notes || "",
          mobileMoneyProvider: client.mobile_money_provider || "",
          mobileMoneyNumber: client.mobile_money_number || "",
          bankName: client.bank_name || "",
          bankAccountNumber: client.bank_account_number || "",
          bankAccountName: client.bank_account_name || "",
          bankBranch: client.bank_branch || "",
          sharesToBuy: "",
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
    return () => {
      cancelled = true
    }
  }, [id])

  // Load membership fee payment history
  useEffect(() => {
    let cancelled = false
    async function loadFeeData() {
      try {
        const res = await fetch(`/api/institution/clients/${id}/membership-fee`, { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setFeePayments(data.payments || [])
            if (typeof data.membershipFee === "number") setMembershipFee(data.membershipFee)
            if (typeof data.membershipFeePaid === "number") setMembershipFeePaid(data.membershipFeePaid)
          }
        }
      } catch {
        // ignore
      }
    }
    loadFeeData()
    return () => { cancelled = true }
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
        const res = await fetch(`/api/institution/clients/${id}/opening-balances`, { cache: "no-store" })
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

    const savBal = Number(obSavingsBalance) || 0
    const loanBal = Number(obLoanBalance) || 0

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
        const principal = Number(obLoanPrincipal) || 0
        if (principal > 0 && principal < loanBal) {
          setObError("Original principal amount cannot be less than the outstanding balance")
          setObSubmitting(false)
          return
        }
        const origTenure = Number(obLoanOriginalTenure) || 0
        const remTenure = Number(obLoanTenure) || 0
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

      const res = await fetch(`/api/institution/clients/${id}/opening-balances`, {
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
      const reloadRes = await fetch(`/api/institution/clients/${id}/opening-balances`, { cache: "no-store" })
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
  const [instType, setInstType] = useState<string | null>(null)
  const hasShares = Boolean(
    (session?.institution?.config?.modules?.shares ?? instConfig?.modules?.shares) &&
      ["SACCO", "MFI"].includes((session?.institution?.type as string) || instType || ""),
  )
  const hasSavings = session?.institution?.config?.modules?.savings
  const [shares, setShares] = useState<any[] | null>(null)
  const configuredShareValue = (session?.institution?.config?.shareValue ?? instConfig?.shareValue) as
    | number
    | undefined

  useEffect(() => {
    if (hasShares) {
      async function loadShares() {
        try {
          const res = await fetch(`/api/institution/clients/${id}/shares`, { cache: "no-store" })
          if (!res.ok) {
            const { error } = await res.json()
            throw new Error(error || "Failed to load shares")
          }
          const { shares } = (await res.json()) as any
          setShares(shares)
        } catch (e: any) {
          setError(e?.message || "Failed to load shares")
        }
      }
      loadShares()
    }
  }, [hasShares, id])

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
              setInstType(data.type)
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

      const saveRes = await fetch(`/api/institution/clients/${id}/kyc`, {
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

    // Client-side validation
    const email = formData.email.trim()
    const phone = formData.phoneNumber.trim()
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
    if (formData.monthlyIncome && Number.isNaN(Number(formData.monthlyIncome))) {
      setError("Monthly Income must be a number")
      return
    }

    setSaving(true)
    try {
      // Update client information
      const payload = {
        fullName: formData.fullName,
        email,
        phoneNumber: phone,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        maritalStatus: formData.maritalStatus,
        location: formData.location,
        occupation: formData.occupation,
        monthlyIncome: formData.monthlyIncome ? Number(formData.monthlyIncome) : undefined,
        nextOfKin: formData.nextOfKin,
        nextOfKinRelationship: formData.nextOfKin ? formData.nextOfKinRelationship : undefined,
        nextOfKinPhone: formData.nextOfKinPhone,
        notes: formData.notes,
        status: formData.status,
        kycStatus: formData.kycStatus,
        loanOfficer: formData.loanOfficer,
        // Payout accounts
        mobileMoneyProvider: formData.mobileMoneyProvider || undefined,
        mobileMoneyNumber: formData.mobileMoneyNumber || undefined,
        bankName: formData.bankName || undefined,
        bankAccountNumber: formData.bankAccountNumber || undefined,
        bankAccountName: formData.bankAccountName || undefined,
        bankBranch: formData.bankBranch || undefined,
      }
      const res = await fetch(`/api/institution/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to update client")
      }

      if (formData.sharesToBuy && Number(formData.sharesToBuy) > 0) {
        const sharesToBuy = Number(formData.sharesToBuy)
        const sharesRes = await fetch(`/api/institution/clients/${id}/shares`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numberOfShares: sharesToBuy }),
        })
        if (!sharesRes.ok) {
          const { error } = await sharesRes.json()
          throw new Error(error || "Failed to purchase shares")
        }
      }

      setSuccess("Saved successfully")
      router.push(`/users/${id}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Failed to update client")
    } finally {
      setSaving(false)
    }
  }

  const handleFeePayment = async () => {
    setError(null)
    setFeeSuccess(null)
    const remaining = membershipFee - membershipFeePaid
    const amount = feePaymentType === "remaining" ? remaining : Number(feePaymentAmount) || 0

    if (amount <= 0) {
      setError("Please enter a valid payment amount")
      return
    }
    if (amount > remaining + 0.01) {
      setError(`Payment amount cannot exceed the remaining fee of ${currency} ${remaining.toLocaleString()}`)
      return
    }

    setFeeSubmitting(true)
    try {
      const res = await fetch(`/api/institution/clients/${id}/membership-fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          mode: feePaymentMode,
          description: "Membership fee payment",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to record payment")

      setMembershipFeePaid(data.membershipFeePaid)
      setFeePaymentAmount("")
      setFeeSuccess(`Payment of ${currency} ${amount.toLocaleString()} recorded successfully`)

      // Reload payment history
      const histRes = await fetch(`/api/institution/clients/${id}/membership-fee`, { cache: "no-store" })
      if (histRes.ok) {
        const histData = await histRes.json()
        setFeePayments(histData.payments || [])
      }
    } catch (err: any) {
      setError(err?.message || "Failed to record membership fee payment")
    } finally {
      setFeeSubmitting(false)
    }
  }

  const handleSharesPurchaseOnly = async () => {
    if (!formData.sharesToBuy || Number(formData.sharesToBuy) <= 0) {
      setError("Please enter a valid number of shares to buy")
      return
    }

    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const sharesToBuy = Number(formData.sharesToBuy)
      const res = await fetch(`/api/institution/clients/${id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberOfShares: sharesToBuy }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to purchase shares")
      }
      setSuccess("Shares purchased successfully")
      setFormData((prev) => ({ ...prev, sharesToBuy: "" }))
      // Reload shares data
      if (hasShares) {
        const sharesRes = await fetch(`/api/institution/clients/${id}/shares`, { cache: "no-store" })
        if (sharesRes.ok) {
          const { shares } = await sharesRes.json()
          setShares(shares)
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to purchase shares")
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
    ...(hasShares ? [{ id: "shares", label: "Shares", icon: Share }] : []),
    ...(membershipFee > 0 ? [{ id: "membership-fee", label: "Membership Fee", icon: DollarSign }] : []),
    { id: "status", label: "Status & Notes", icon: Shield },
  ]

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
            {/* Back link */}
            <div>
              <Link href={`/users/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
                      <span className="font-mono">{user.client_number}</span>
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
                  <Link href={`/users/${id}`} className="hidden sm:inline-flex">
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
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange("fullName", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maritalStatus">Marital Status</Label>
                      <Select
                        value={formData.maritalStatus}
                        onValueChange={(value) => handleInputChange("maritalStatus", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select marital status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Single">Single</SelectItem>
                          <SelectItem value="Married">Married</SelectItem>
                          <SelectItem value="Divorced">Divorced</SelectItem>
                          <SelectItem value="Widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => handleInputChange("location", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="occupation">Occupation</Label>
                      <Input
                        id="occupation"
                        value={formData.occupation}
                        onChange={(e) => handleInputChange("occupation", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyIncome">Monthly Income ({currency})</Label>
                      <Input
                        id="monthlyIncome"
                        value={formData.monthlyIncome}
                        onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                      />
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
                      <Input
                        id="nextOfKin"
                        value={formData.nextOfKin}
                        onChange={(e) => handleInputChange("nextOfKin", e.target.value)}
                        placeholder="e.g., Mary Nakamya"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                      <Select
                        value={formData.nextOfKinRelationship}
                        onValueChange={(value) => handleInputChange("nextOfKinRelationship", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select relationship" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Spouse">Spouse</SelectItem>
                          <SelectItem value="Father">Father</SelectItem>
                          <SelectItem value="Mother">Mother</SelectItem>
                          <SelectItem value="Son">Son</SelectItem>
                          <SelectItem value="Daughter">Daughter</SelectItem>
                          <SelectItem value="Brother">Brother</SelectItem>
                          <SelectItem value="Sister">Sister</SelectItem>
                          <SelectItem value="Uncle">Uncle</SelectItem>
                          <SelectItem value="Aunt">Aunt</SelectItem>
                          <SelectItem value="Friend">Friend</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinPhone">Phone Number</Label>
                      <Input
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
                        <Select
                          value={formData.mobileMoneyProvider}
                          onValueChange={(value) => handleInputChange("mobileMoneyProvider", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MTN Mobile Money">MTN Mobile Money</SelectItem>
                            <SelectItem value="Airtel Money">Airtel Money</SelectItem>
                            <SelectItem value="M-Sente">M-Sente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mobileMoneyNumber">Mobile Money Number</Label>
                        <Input
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
                        <Select
                          value={formData.bankName}
                          onValueChange={(value) => handleInputChange("bankName", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select bank" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Stanbic Bank">Stanbic Bank</SelectItem>
                            <SelectItem value="Centenary Bank">Centenary Bank</SelectItem>
                            <SelectItem value="DFCU Bank">DFCU Bank</SelectItem>
                            <SelectItem value="Equity Bank">Equity Bank</SelectItem>
                            <SelectItem value="Bank of Africa">Bank of Africa</SelectItem>
                            <SelectItem value="PostBank Uganda">PostBank Uganda</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountNumber">Account Number</Label>
                        <Input
                          id="bankAccountNumber"
                          value={formData.bankAccountNumber}
                          onChange={(e) => handleInputChange("bankAccountNumber", e.target.value)}
                          placeholder="e.g., 9030012345678"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountName">Account Name</Label>
                        <Input
                          id="bankAccountName"
                          value={formData.bankAccountName}
                          onChange={(e) => handleInputChange("bankAccountName", e.target.value)}
                          placeholder="Account holder name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankBranch">Branch</Label>
                        <Input
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
                                  <Select value={obSavingsAccountId} onValueChange={setObSavingsAccountId}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {obSavingsAccounts.map((acc: any) => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                          {acc.account_number} ({acc.account_type})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              <div className="space-y-2">
                                <Label htmlFor="obSavingsBalance">Opening Savings Balance ({currency})</Label>
                                <Input
                                  id="obSavingsBalance"
                                  type="number"
                                  min={0}
                                  value={obSavingsBalance}
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
                              <Select value={obLoanProductId} onValueChange={setObLoanProductId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select loan product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {obLoanProducts.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.product_name} ({p.interest_rate}%)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanPrincipal">Original Loan Amount ({currency}) <span className="text-red-500">*</span></Label>
                              <Input
                                id="obLoanPrincipal"
                                type="number"
                                min={0}
                                value={obLoanPrincipal}
                                onChange={(e) => setObLoanPrincipal(e.target.value)}
                                placeholder="e.g., 2,000,000"
                              />
                              <p className="text-xs text-muted-foreground">The full principal amount that was originally disbursed</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanBalance">Outstanding Balance ({currency}) <span className="text-red-500">*</span></Label>
                              <Input
                                id="obLoanBalance"
                                type="number"
                                min={0}
                                value={obLoanBalance}
                                onChange={(e) => setObLoanBalance(e.target.value)}
                                placeholder="e.g., 1,000,000"
                              />
                              <p className="text-xs text-muted-foreground">The amount still owed today</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanOriginalTenure">Original Tenure (months)</Label>
                              <Input
                                id="obLoanOriginalTenure"
                                type="number"
                                min={1}
                                value={obLoanOriginalTenure}
                                onChange={(e) => setObLoanOriginalTenure(e.target.value)}
                                placeholder="e.g., 24"
                              />
                              <p className="text-xs text-muted-foreground">Total months the loan was originally issued for</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanTenure">Remaining Tenure (months) <span className="text-red-500">*</span></Label>
                              <Input
                                id="obLoanTenure"
                                type="number"
                                min={1}
                                value={obLoanTenure}
                                onChange={(e) => setObLoanTenure(e.target.value)}
                                placeholder="e.g., 12"
                              />
                              <p className="text-xs text-muted-foreground">Months still remaining to be paid</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="obLoanLastPaymentDate">Last Payment Date</Label>
                              <Input
                                id="obLoanLastPaymentDate"
                                type="date"
                                value={obLoanLastPaymentDate}
                                onChange={(e) => setObLoanLastPaymentDate(e.target.value)}
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
                            const monthlyRate = rate / 100 / 12
                            const mp = monthlyRate > 0
                              ? (bal * monthlyRate * Math.pow(1 + monthlyRate, rem)) / (Math.pow(1 + monthlyRate, rem) - 1)
                              : bal / rem
                            const totalRepayment = mp * rem
                            const totalInterest = totalRepayment - bal
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
                              </div>
                            )
                          })()}
                        </div>

                        <Button
                          type="button"
                          onClick={handleOpeningBalanceSubmit}
                          disabled={obSubmitting || (Number(obSavingsBalance) <= 0 && Number(obLoanBalance) <= 0)}
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

              {hasShares && (
                <Card id="shares" className="scroll-mt-24">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Share className="h-5 w-5 text-primary" />
                      Shares Management
                    </CardTitle>
                    <CardDescription>
                      Purchase and manage shares for this {terminology.singular.toLowerCase()}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!configuredShareValue && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                        <p className="text-sm text-yellow-700 font-medium">
                          Share value is not configured. Please configure it in the institution settings.
                        </p>
                      </div>
                    )}
                    {shares && (
                      <div className="space-y-4">
                        {(() => {
                          const totalShares = Array.isArray(shares)
                            ? shares.reduce((acc, r: any) => acc + (r.number_of_shares || 0), 0)
                            : 0
                          const lastShareValue = Array.isArray(shares) && shares[0]?.share_value
                          const totalValue = Array.isArray(shares)
                            ? shares.reduce((acc, r: any) => acc + (r.total_value || 0), 0)
                            : 0
                          return (
                            <>
                              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-primary">{totalShares}</div>
                                  <div className="text-sm text-muted-foreground">Total Shares</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-primary">
                                    {lastShareValue ?? configuredShareValue ?? "-"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">Value per Share</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-primary">
                                    UGX {Number(totalValue || 0).toLocaleString("en-UG")}
                                  </div>
                                  <div className="text-sm text-muted-foreground">Total Value</div>
                                </div>
                              </div>

                              <div className="border-t pt-4">
                                <div className="space-y-4">
                                  <div className="grid gap-4 md:grid-cols-3 items-end">
                                    <div className="space-y-2">
                                      <Label htmlFor="sharesToBuy">Shares to Purchase</Label>
                                      <Input
                                        id="sharesToBuy"
                                        type="number"
                                        min={1}
                                        value={formData.sharesToBuy}
                                        onChange={(e) => handleInputChange("sharesToBuy", e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Value per Share</Label>
                                      <Input value={`UGX ${configuredShareValue ?? "-"}`} readOnly />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Calculator className="h-4 w-4 text-muted-foreground" />
                                      <Button
                                        type="button"
                                        onClick={handleSharesPurchaseOnly}
                                        disabled={!configuredShareValue || saving}
                                        className="flex-1"
                                      >
                                        {saving ? "Processing..." : "Purchase Shares"}
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    You can purchase shares separately or include them when saving all changes.
                                  </p>
                                </div>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Membership Fee */}
              {membershipFee > 0 && (
                <Card id="membership-fee" className="scroll-mt-24">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      Membership Fee
                    </CardTitle>
                    <CardDescription>
                      Manage membership fee payments for this {terminology.singular.toLowerCase()}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Current Status */}
                    {(() => {
                      const remaining = membershipFee - membershipFeePaid
                      const percentage = membershipFee > 0 ? (membershipFeePaid / membershipFee) * 100 : 0
                      const isFullyPaid = membershipFeePaid >= membershipFee

                      return (
                        <>
                          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">
                                {currency} {membershipFeePaid.toLocaleString()}
                              </div>
                              <div className="text-sm text-muted-foreground">Paid</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">
                                {currency} {membershipFee.toLocaleString()}
                              </div>
                              <div className="text-sm text-muted-foreground">Total Fee</div>
                            </div>
                            <div className="text-center">
                              <div className={`text-2xl font-bold ${isFullyPaid ? "text-green-600" : "text-orange-600"}`}>
                                {Math.round(percentage)}%
                              </div>
                              <div className="text-sm text-muted-foreground">Progress</div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${isFullyPaid ? "bg-green-500" : "bg-orange-500"}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>

                          {isFullyPaid ? (
                            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <Check className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-medium text-green-700">Membership fee fully paid</span>
                            </div>
                          ) : (
                            <div className="border-t pt-4 space-y-4">
                              <h4 className="text-sm font-semibold text-gray-900">Record Additional Payment</h4>

                              {feeSuccess && (
                                <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded">{feeSuccess}</div>
                              )}

                              {/* Payment Type */}
                              <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="feePaymentType"
                                    value="remaining"
                                    checked={feePaymentType === "remaining"}
                                    onChange={() => setFeePaymentType("remaining")}
                                    className="w-4 h-4 accent-[#f08c2b]"
                                  />
                                  <span className="text-sm text-gray-700">
                                    Pay Remaining ({currency} {remaining.toLocaleString()})
                                  </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="feePaymentType"
                                    value="custom"
                                    checked={feePaymentType === "custom"}
                                    onChange={() => setFeePaymentType("custom")}
                                    className="w-4 h-4 accent-[#f08c2b]"
                                  />
                                  <span className="text-sm text-gray-700">Custom Amount</span>
                                </label>
                              </div>

                              <div className="grid gap-4 md:grid-cols-3 items-end">
                                <div className="space-y-2">
                                  <Label htmlFor="feePaymentAmount">Amount ({currency})</Label>
                                  {feePaymentType === "remaining" ? (
                                    <Input
                                      value={remaining.toLocaleString()}
                                      readOnly
                                      className="bg-gray-50 text-gray-600"
                                    />
                                  ) : (
                                    <Input
                                      id="feePaymentAmount"
                                      type="number"
                                      value={feePaymentAmount}
                                      onChange={(e) => setFeePaymentAmount(e.target.value)}
                                      placeholder={`Max: ${remaining.toLocaleString()}`}
                                      max={remaining}
                                      min={1}
                                    />
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label>Payment Mode</Label>
                                  <Select value={feePaymentMode} onValueChange={setFeePaymentMode}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select mode" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Cash">Cash</SelectItem>
                                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                      <SelectItem value="Cheque">Cheque</SelectItem>
                                      <SelectItem value="Card">Card</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button
                                  type="button"
                                  onClick={handleFeePayment}
                                  disabled={feeSubmitting}
                                >
                                  {feeSubmitting ? "Processing..." : "Record Payment"}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Payment History */}
                          {feePayments.length > 0 && (
                            <div className="border-t pt-4">
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">Payment History</h4>
                              <div className="space-y-2">
                                {feePayments.map((p: any) => (
                                  <div key={p.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground">{p.transaction_number}</span>
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.mode}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">{currency} {Number(p.amount).toLocaleString()}</span>
                                      <span className="text-muted-foreground text-xs">
                                        {new Date(p.transaction_date).toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" })}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Status & Management */}
              <Card id="status" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Status & Management
                  </CardTitle>
                  <CardDescription>Account status, KYC verification, and administrative notes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="status">Account Status</Label>
                      <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kycStatus">KYC Status</Label>
                      <Select value={formData.kycStatus} onValueChange={(value) => handleInputChange("kycStatus", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select KYC status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Verified">Verified</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanOfficer">Loan Officer</Label>
                      <Input
                        id="loanOfficer"
                        value={formData.loanOfficer}
                        onChange={(e) => handleInputChange("loanOfficer", e.target.value)}
                        placeholder="e.g., John Mukasa"
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
                      <Button type="submit" disabled={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? "Saving..." : terminology.update}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
      </div>
    </>
  )
}
