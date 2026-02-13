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
import AppLayout from "@/components/layout/app-layout"
import { FileUpload } from "@/components/ui/file-upload"
// Removed mock-data; use live API
import { ArrowLeft, Save, CreditCard, Smartphone, Share, Calculator } from "lucide-react"
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
        const { client } = (await res.json()) as any
        if (cancelled) return
        setUser(client)
        setFormData({
          fullName: client.full_name || "",
          email: client.email || "",
          phoneNumber: client.phone_number || "",
          dateOfBirth: client.date_of_birth || "",
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
      const res = await upload(name, file, {
        handleUploadUrl: "/api/vercel_blob/upload",
        access: "public",
        contentType: file.type,
      })
      // Persist URL to Supabase via our API (works locally without Vercel callback)
      await fetch(`/api/institution/clients/${id}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, url: res.url }),
      })
      setDocs((prev) => {
        const next = { ...prev }
        if (docType === "passport_photo") next.passportPhoto = res.url
        if (docType === "national_id_front") next.nationalIdFront = res.url
        if (docType === "national_id_back") next.nationalIdBack = res.url
        return next
      })
    } catch (e: any) {
      setError(e?.message || "Failed to upload document")
      throw e // Re-throw for FileUpload component to handle
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
      <AppLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </AppLayout>
    )
  }

  if (!user) {
    return notFound()
  }

  return (
    <AppLayout>
      <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Link href={`/users/${id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h2 className="text-3xl font-bold text-balance">{terminology.edit}</h2>
                <p className="text-muted-foreground text-pretty">
                  Update {terminology.singular.toLowerCase()} information and settings.
                </p>
              </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</div>}
            {success && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded">{success}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Personal details and contact information.</CardDescription>
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

              <Card id="kyc">
                <CardHeader>
                  <CardTitle>KYC Documents</CardTitle>
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
              <Card>
                <CardHeader>
                  <CardTitle>Location & Occupation</CardTitle>
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
                      <Label htmlFor="monthlyIncome">Monthly Income (UGX)</Label>
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
              <Card id="nok">
                <CardHeader>
                  <CardTitle>Emergency Contact</CardTitle>
                  <CardDescription>Next of kin information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKin">Next of Kin</Label>
                      <Input
                        id="nextOfKin"
                        value={formData.nextOfKin}
                        onChange={(e) => handleInputChange("nextOfKin", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinPhone">Next of Kin Phone</Label>
                      <Input
                        id="nextOfKinPhone"
                        value={formData.nextOfKinPhone}
                        onChange={(e) => handleInputChange("nextOfKinPhone", e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Linked Payout Accounts */}
              <Card id="payout">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Linked Payout Accounts
                  </CardTitle>
                  <CardDescription>
                    Configure payout accounts for loan disbursements and repayment collections. Essential for financial
                    transactions.
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

              {hasShares && (
                <Card id="shares">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Share className="h-5 w-5" />
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

              {/* Status & Management */}
              <Card>
                <CardHeader>
                  <CardTitle>Status & Management</CardTitle>
                  <CardDescription>Account status and administrative information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4" id="notes">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
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
                    />
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

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-4">
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
            </form>
      </div>
    </AppLayout>
  )
}
