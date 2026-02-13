"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { FileUpload } from "@/components/ui/file-upload"
import { upload } from "@vercel/blob/client"
import {
  ArrowLeft,
  Camera,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  Smartphone,
  Building,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"

export default function ProfilePage() {
  type KycDocStatus = "missing" | "pending" | "verified" | "rejected"
  type KycDocState = { status: KycDocStatus; currentUrl: string; pendingUrl: string; reason: string; pendingId?: string | null }

  const [session, setSession] = useState<{ institution: any } | null>(null)
  const [currentClient, setCurrentClient] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("personal")
  const [showPassword, setShowPassword] = useState(false)
  const { toast } = useToast()

  // Form states
  const [personalInfo, setPersonalInfo] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    occupation: "",
    monthlyIncome: "",
    village: "",
    district: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
  })

  // KYC docs state (client portal)
  const [kycDocs, setKycDocs] = useState<{ passportPhoto: KycDocState; nationalIdFront: KycDocState; nationalIdBack: KycDocState }>(
    {
      passportPhoto: { status: "missing", currentUrl: "", pendingUrl: "", reason: "", pendingId: null },
      nationalIdFront: { status: "missing", currentUrl: "", pendingUrl: "", reason: "", pendingId: null },
      nationalIdBack: { status: "missing", currentUrl: "", pendingUrl: "", reason: "", pendingId: null },
    },
  )
  const [kycUploading, setKycUploading] = useState<{ [k: string]: boolean }>({})

  const [paymentInfo, setPaymentInfo] = useState({
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
    bankBranch: "",
  })
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [isEditingPayment, setIsEditingPayment] = useState(false)

  const [securitySettings, setSecuritySettings] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
    smsNotifications: true,
    emailNotifications: true,
  })
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/client/me", { cache: "no-store" })
        if (!res.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent("/client-portal/profile")}`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSession({ institution: data.institution })
        setCurrentClient(data.client)
        // Map minimal fields available from /api/client/me; rest remain empty until extended endpoints
        setPersonalInfo({
          fullName: data.client.fullName || "",
          email: data.client.email || "",
          phoneNumber: data.client.phone || "",
          dateOfBirth: data.client.dateOfBirth || "",
          gender: data.client.gender || "",
          maritalStatus: data.client.maritalStatus || "",
          occupation: data.client.occupation || "",
          monthlyIncome: data.client.monthlyIncome?.toString?.() || "",
          village: data.client.village || "",
          district: data.client.district || "",
          nextOfKinName: data.client.nextOfKinName || "",
          nextOfKinRelationship: data.client.nextOfKinRelationship || "",
          nextOfKinPhone: data.client.nextOfKinPhone || "",
        })
        // Payment info mapping
        setPaymentInfo({
          mobileMoneyProvider: data.client.mobileMoneyProvider || "",
          mobileMoneyNumber: data.client.mobileMoneyNumber || "",
          bankName: data.client.bankName || "",
          bankAccountNumber: data.client.bankAccountNumber || "",
          bankAccountName: data.client.bankAccountName || "",
          bankBranch: data.client.bankBranch || "",
        })
        // Load KYC docs status
        try {
          const kycRes = await fetch("/api/client/kyc-docs", { cache: "no-store" })
          if (kycRes.ok) {
            const k = await kycRes.json()
            const mapDoc = (node: any): KycDocState => {
              if (node?.pending) return { status: "pending", currentUrl: node?.current_verified?.url || "", pendingUrl: node?.pending?.url || "", reason: node?.last_rejection?.reason || "", pendingId: node?.pending?.id || null }
              if (node?.current_verified) return { status: "verified", currentUrl: node?.current_verified?.url || "", pendingUrl: "", reason: node?.last_rejection?.reason || "", pendingId: null }
              if (node?.last_rejection) return { status: "rejected", currentUrl: "", pendingUrl: "", reason: node?.last_rejection?.reason || "", pendingId: null }
              return { status: "missing", currentUrl: "", pendingUrl: "", reason: "", pendingId: null }
            }
            setKycDocs({
              passportPhoto: mapDoc(k?.docs?.passport_photo),
              nationalIdFront: mapDoc(k?.docs?.national_id_front),
              nationalIdBack: mapDoc(k?.docs?.national_id_back),
            })
          }
        } catch {}
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  const calculateKycProgress = () => {
    const totalDocs = Object.keys(kycDocs).length
    const verifiedDocs = Object.values(kycDocs).filter((doc: any) => doc.status === "verified").length
    return Math.round((verifiedDocs / totalDocs) * 100)
  }

  const handlePersonalInfoSave = async () => {
    // Validate only editable fields
    const errors: string[] = []
    if (personalInfo.village && personalInfo.village.length > 100) errors.push("Village is too long")
    if (personalInfo.district && personalInfo.district.length > 100) errors.push("District is too long")
    if (personalInfo.occupation && personalInfo.occupation.length > 100) errors.push("Occupation is too long")
    if (personalInfo.nextOfKinName && personalInfo.nextOfKinName.length > 255) errors.push("Next of Kin name is too long")
    if (personalInfo.nextOfKinRelationship && personalInfo.nextOfKinRelationship.length > 100)
      errors.push("Next of Kin relationship is too long")
    const phone = (personalInfo.nextOfKinPhone || "").trim()
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) errors.push("Enter a valid next of kin phone (+256701234567)")
    if (errors.length > 0) {
      toast({ title: "Validation error", description: errors.join("; "), variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch("/api/client/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          village: personalInfo.village || undefined,
          district: personalInfo.district || undefined,
          occupation: personalInfo.occupation || undefined,
          nextOfKinName: personalInfo.nextOfKinName || undefined,
          nextOfKinRelationship: personalInfo.nextOfKinRelationship || undefined,
          nextOfKinPhone: personalInfo.nextOfKinPhone || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to save profile")
      toast({ title: "Saved", description: "Your profile was updated.", variant: "success" })
      setIsEditing(false)
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || "Unexpected error", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelReplacement = async (docType: "passport_photo" | "national_id_front" | "national_id_back") => {
    const state = docType === "passport_photo" ? kycDocs.passportPhoto : docType === "national_id_front" ? kycDocs.nationalIdFront : kycDocs.nationalIdBack
    if (!state.pendingId) return
    try {
      const res = await fetch("/api/client/kyc-docs/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: state.pendingId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to cancel")
      setKycDocs((prev) => {
        const next = { ...prev }
        const revertStatus = state.currentUrl ? "verified" : state.reason ? "rejected" : "missing"
        if (docType === "passport_photo") next.passportPhoto = { ...next.passportPhoto, status: revertStatus as KycDocStatus, pendingUrl: "", pendingId: null }
        if (docType === "national_id_front") next.nationalIdFront = { ...next.nationalIdFront, status: revertStatus as KycDocStatus, pendingUrl: "", pendingId: null }
        if (docType === "national_id_back") next.nationalIdBack = { ...next.nationalIdBack, status: revertStatus as KycDocStatus, pendingUrl: "", pendingId: null }
        return next
      })
      toast({ title: "Cancelled", description: "Replacement request was cancelled.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e?.message || "Unexpected error", variant: "destructive" })
    }
  }

  const handleKycUpload = async (
    docType: "passport_photo" | "national_id_front" | "national_id_back",
    file: File,
  ) => {
    if (!currentClient?.id) throw new Error("Missing client context")
    try {
      setKycUploading((p) => ({ ...p, [docType]: true }))
      const name = `client-kyc-pending/${currentClient.id}/${docType}-${Date.now()}-${file.name}`
      const res = await upload(name, file, {
        handleUploadUrl: "/api/vercel_blob/upload",
        access: "public",
        contentType: file.type,
      })
      // Persist pending row via client endpoint
      const endpoint = (() => {
        const statusByType = docType === "passport_photo" ? kycDocs.passportPhoto.status : docType === "national_id_front" ? kycDocs.nationalIdFront.status : kycDocs.nationalIdBack.status
        return statusByType === "verified" ? "/api/client/kyc-docs/replace" : "/api/client/kyc-docs"
      })()
      const save = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, url: res.url }),
      })
      const data = await save.json().catch(() => ({}))
      if (!save.ok) throw new Error(data?.error || "Failed to submit document")
      // Update UI state to pending
      setKycDocs((prev) => {
        const next = { ...prev }
        const newPendingId = data?.pendingId || null
        if (docType === "passport_photo") next.passportPhoto = { ...next.passportPhoto, status: "pending", pendingUrl: res.url, pendingId: newPendingId }
        if (docType === "national_id_front") next.nationalIdFront = { ...next.nationalIdFront, status: "pending", pendingUrl: res.url, pendingId: newPendingId }
        if (docType === "national_id_back") next.nationalIdBack = { ...next.nationalIdBack, status: "pending", pendingUrl: res.url, pendingId: newPendingId }
        return next
      })
      toast({ title: "Uploaded", description: "Document submitted for review.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Unexpected error", variant: "destructive" })
      throw e
    } finally {
      setKycUploading((p) => ({ ...p, [docType]: false }))
    }
  }

  const handlePaymentSave = async () => {
    const errs: string[] = []
    const phoneRe = /^\+?[0-9]{7,15}$/
    if (paymentInfo.mobileMoneyNumber && !phoneRe.test(paymentInfo.mobileMoneyNumber)) errs.push("Invalid mobile money number")
    if (paymentInfo.bankAccountNumber && paymentInfo.bankAccountNumber.length > 50) errs.push("Bank account number too long")
    if (paymentInfo.bankName && paymentInfo.bankName.length > 255) errs.push("Bank name too long")
    if (paymentInfo.bankAccountName && paymentInfo.bankAccountName.length > 255) errs.push("Account name too long")
    if (paymentInfo.bankBranch && paymentInfo.bankBranch.length > 255) errs.push("Bank branch too long")
    if (errs.length > 0) {
      toast({ title: "Validation error", description: errs.join("; "), variant: "destructive" })
      return
    }

    setIsSavingPayment(true)
    try {
      const res = await fetch("/api/client/payment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentInfo),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to save payment info")
      toast({ title: "Saved", description: "Payment information updated.", variant: "success" })
      setIsEditingPayment(false)
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || "Unexpected error", variant: "destructive" })
    } finally {
      setIsSavingPayment(false)
    }
  }

  const handlePasswordChange = async () => {
    // Client-side validation
    const errs: string[] = []
    const { currentPassword, newPassword, confirmPassword } = securitySettings
    if (!currentPassword) errs.push("Current password is required")
    if (!newPassword) errs.push("New password is required")
    if (newPassword && newPassword.length < 8) errs.push("New password must be at least 8 characters")
    if (newPassword !== confirmPassword) errs.push("Passwords do not match")
    if (errs.length > 0) {
      toast({ title: "Validation error", description: errs.join("; "), variant: "destructive" })
      return
    }

    setIsChangingPassword(true)
    try {
      const res = await fetch("/api/client/security/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data?.error === "invalid_current_password"
            ? "Current password is incorrect"
            : data?.error || "Failed to change password"
        throw new Error(msg)
      }
      toast({ title: "Password updated", description: "Your password has been changed.", variant: "success" })
      setSecuritySettings((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }))
    } catch (e: any) {
      toast({ title: "Could not update password", description: e?.message || "Unexpected error", variant: "destructive" })
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!session || !currentClient) {
    return null
  }

  const institution = session.institution
  const clientTerminology = institution?.config?.clientTerminology || "Member"
  const kycProgress = calculateKycProgress()
  const verifiedCount = Object.values(kycDocs).filter((doc: any) => doc.status === "verified").length
  const remainingDocs = Math.max(0, 3 - verifiedCount)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center space-x-3">
          <Link href="/client-portal">
            <Button size="sm" variant="ghost" className="text-primary-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">My Profile</h1>
            <p className="text-sm opacity-90">Manage your account information</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Profile Summary */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">
                  {String(currentClient.fullName || "")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{currentClient.fullName}</h2>
                <p className="text-muted-foreground">{currentClient.phone}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant={currentClient.kycStatus === "Verified" ? "default" : "outline"}>
                    {currentClient.kycStatus === "Verified" && <CheckCircle className="w-3 h-3 mr-1" />}
                    {currentClient.kycStatus === "Pending" && <Clock className="w-3 h-3 mr-1" />}
                    {currentClient.kycStatus}
                  </Badge>
                  <Badge variant="outline">
                    {clientTerminology} since {currentClient.joinDate}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KYC Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              KYC Verification Progress
            </CardTitle>
            <CardDescription>Complete your verification to unlock all features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Verification Progress</span>
                <span>{kycProgress}% Complete</span>
              </div>
              <Progress value={kycProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {kycProgress === 100 ? "Verification complete!" : `${remainingDocs} document${remainingDocs === 1 ? "" : "s"} remaining`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="personal" className="text-xs">
              Personal
            </TabsTrigger>
            <TabsTrigger value="kyc" className="text-xs">
              KYC
            </TabsTrigger>
            <TabsTrigger value="payment" className="text-xs">
              Payment
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs">
              Security
            </TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value="personal" className="space-y-4">
            {/* Identity & KYC (Read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identity & KYC (Read-only)</CardTitle>
                <CardDescription>Core identity details captured at onboarding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <p className="text-sm mt-1">{personalInfo.fullName || "—"}</p>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <p className="text-sm mt-1">{personalInfo.email || "—"}</p>
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <p className="text-sm mt-1">{personalInfo.phoneNumber || "—"}</p>
                  </div>
                  <div>
                    <Label>Date of Birth</Label>
                    <p className="text-sm mt-1">{personalInfo.dateOfBirth || "—"}</p>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <p className="text-sm mt-1 capitalize">{personalInfo.gender || "—"}</p>
                  </div>
                  <div>
                    <Label>Marital Status</Label>
                    <p className="text-sm mt-1 capitalize">{personalInfo.maritalStatus || "—"}</p>
                  </div>
                  <div>
                    <Label>Monthly Income (UGX)</Label>
                    <p className="text-sm mt-1">{personalInfo.monthlyIncome || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact & Context (Editable) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Contact & Context</CardTitle>
                    <CardDescription>Editable: occupation, location, next of kin information</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant={isEditing ? "default" : "outline"}
                    onClick={() => (isEditing ? handlePersonalInfoSave() : setIsEditing(true))}
                    disabled={isSaving}
                  >
                    {isEditing ? (isSaving ? "Saving..." : "Save Changes") : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input
                      id="occupation"
                      value={personalInfo.occupation}
                      onChange={(e) => setPersonalInfo((prev) => ({ ...prev, occupation: e.target.value }))}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label htmlFor="village">Village/Area</Label>
                    <Input
                      id="village"
                      value={personalInfo.village}
                      onChange={(e) => setPersonalInfo((prev) => ({ ...prev, village: e.target.value }))}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label htmlFor="district">District</Label>
                    <Input
                      id="district"
                      value={personalInfo.district}
                      onChange={(e) => setPersonalInfo((prev) => ({ ...prev, district: e.target.value }))}
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="block mb-2">Next of Kin Information</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="nokName">Full Name</Label>
                        <Input
                          id="nokName"
                          value={personalInfo.nextOfKinName}
                          onChange={(e) => setPersonalInfo((prev) => ({ ...prev, nextOfKinName: e.target.value }))}
                          disabled={!isEditing}
                        />
                      </div>
                      <div>
                        <Label htmlFor="nokRelationship">Relationship</Label>
                        <Input
                          id="nokRelationship"
                          value={personalInfo.nextOfKinRelationship}
                          onChange={(e) =>
                            setPersonalInfo((prev) => ({ ...prev, nextOfKinRelationship: e.target.value }))
                          }
                          disabled={!isEditing}
                        />
                      </div>
                      <div>
                        <Label htmlFor="nokPhone">Phone Number</Label>
                        <Input
                          id="nokPhone"
                          value={personalInfo.nextOfKinPhone}
                          onChange={(e) => setPersonalInfo((prev) => ({ ...prev, nextOfKinPhone: e.target.value }))}
                          disabled={!isEditing}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
          </Card>
          </TabsContent>

          {/* KYC Documents Tab */}
          <TabsContent value="kyc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">KYC Documents</CardTitle>
                <CardDescription>Upload identification documents for verification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Passport Photo */}
                <FileUpload
                  label="Passport Photo"
                  description="Upload a clear passport-style photo (JPG, PNG, or PDF)"
                  currentUrl={kycDocs.passportPhoto.currentUrl}
                  uploading={!!kycUploading["passport_photo"]}
                  onUpload={(file) => handleKycUpload("passport_photo", file)}
                  accept="image/*,application/pdf"
                  maxSize={5}
                  layout="inline"
                />
                <div className="-mt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {kycDocs.passportPhoto.status === "verified" && (
                      <Badge><CheckCircle className="w-3 h-3" /> Verified</Badge>
                    )}
                    {kycDocs.passportPhoto.status === "pending" && (
                      <Badge variant="outline"><Clock className="w-3 h-3" /> Pending Review</Badge>
                    )}
                    {kycDocs.passportPhoto.status === "missing" && (
                      <Badge variant="secondary"><AlertCircle className="w-3 h-3" /> Missing</Badge>
                    )}
                    {kycDocs.passportPhoto.status === "rejected" && (
                      <Badge variant="destructive"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(kycDocs.passportPhoto.status === "rejected" || kycDocs.passportPhoto.status === "verified") && kycDocs.passportPhoto.reason && (
                      <span className="text-destructive text-xs">Last rejection: {kycDocs.passportPhoto.reason}</span>
                    )}
                    {kycDocs.passportPhoto.status === "pending" && kycDocs.passportPhoto.pendingId && kycDocs.passportPhoto.currentUrl && (
                      <Button size="sm" variant="outline" onClick={() => handleCancelReplacement("passport_photo")}>
                        Cancel replacement
                      </Button>
                    )}
                  </div>
                </div>

                {/* National ID (Front) */}
                <FileUpload
                  label="National ID (Front)"
                  description="Upload the front side of your national ID card"
                  currentUrl={kycDocs.nationalIdFront.currentUrl}
                  uploading={!!kycUploading["national_id_front"]}
                  onUpload={(file) => handleKycUpload("national_id_front", file)}
                  accept="image/*,application/pdf"
                  maxSize={5}
                  layout="inline"
                />
                <div className="-mt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {kycDocs.nationalIdFront.status === "verified" && (
                      <Badge><CheckCircle className="w-3 h-3" /> Verified</Badge>
                    )}
                    {kycDocs.nationalIdFront.status === "pending" && (
                      <Badge variant="outline"><Clock className="w-3 h-3" /> Pending Review</Badge>
                    )}
                    {kycDocs.nationalIdFront.status === "missing" && (
                      <Badge variant="secondary"><AlertCircle className="w-3 h-3" /> Missing</Badge>
                    )}
                    {kycDocs.nationalIdFront.status === "rejected" && (
                      <Badge variant="destructive"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(kycDocs.nationalIdFront.status === "rejected" || kycDocs.nationalIdFront.status === "verified") && kycDocs.nationalIdFront.reason && (
                      <span className="text-destructive text-xs">Last rejection: {kycDocs.nationalIdFront.reason}</span>
                    )}
                    {kycDocs.nationalIdFront.status === "pending" && kycDocs.nationalIdFront.pendingId && kycDocs.nationalIdFront.currentUrl && (
                      <Button size="sm" variant="outline" onClick={() => handleCancelReplacement("national_id_front")}>
                        Cancel replacement
                      </Button>
                    )}
                  </div>
                </div>

                {/* National ID (Back) */}
                <FileUpload
                  label="National ID (Back)"
                  description="Upload the back side of your national ID card"
                  currentUrl={kycDocs.nationalIdBack.currentUrl}
                  uploading={!!kycUploading["national_id_back"]}
                  onUpload={(file) => handleKycUpload("national_id_back", file)}
                  accept="image/*,application/pdf"
                  maxSize={5}
                  layout="inline"
                />
                <div className="-mt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {kycDocs.nationalIdBack.status === "verified" && (
                      <Badge><CheckCircle className="w-3 h-3" /> Verified</Badge>
                    )}
                    {kycDocs.nationalIdBack.status === "pending" && (
                      <Badge variant="outline"><Clock className="w-3 h-3" /> Pending Review</Badge>
                    )}
                    {kycDocs.nationalIdBack.status === "missing" && (
                      <Badge variant="secondary"><AlertCircle className="w-3 h-3" /> Missing</Badge>
                    )}
                    {kycDocs.nationalIdBack.status === "rejected" && (
                      <Badge variant="destructive"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(kycDocs.nationalIdBack.status === "rejected" || kycDocs.nationalIdBack.status === "verified") && kycDocs.nationalIdBack.reason && (
                      <span className="text-destructive text-xs">Last rejection: {kycDocs.nationalIdBack.reason}</span>
                    )}
                    {kycDocs.nationalIdBack.status === "pending" && kycDocs.nationalIdBack.pendingId && kycDocs.nationalIdBack.currentUrl && (
                      <Button size="sm" variant="outline" onClick={() => handleCancelReplacement("national_id_back")}>
                        Cancel replacement
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings Tab */}
          <TabsContent value="payment" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center">
                      <Smartphone className="h-4 w-4 mr-2" />
                      Mobile Money
                    </CardTitle>
                    <CardDescription>Link your mobile money number for fast disbursements</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant={isEditingPayment ? "default" : "outline"}
                    onClick={() => (isEditingPayment ? handlePaymentSave() : setIsEditingPayment(true))}
                    disabled={isSavingPayment}
                  >
                    {isEditingPayment ? (isSavingPayment ? "Saving..." : "Save Changes") : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mmProvider">Provider</Label>
                    <Input
                      id="mmProvider"
                      value={paymentInfo.mobileMoneyProvider}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, mobileMoneyProvider: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                  <div>
                    <Label htmlFor="mmNumber">Phone Number</Label>
                    <Input
                      id="mmNumber"
                      value={paymentInfo.mobileMoneyNumber}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, mobileMoneyNumber: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Building className="h-4 w-4 mr-2" />
                  Bank Account
                </CardTitle>
                <CardDescription>Provide bank details for loan disbursements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={paymentInfo.bankName}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankName: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bankBranch">Branch</Label>
                    <Input
                      id="bankBranch"
                      value={paymentInfo.bankBranch}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankBranch: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      value={paymentInfo.bankAccountName}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankAccountName: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={paymentInfo.bankAccountNumber}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                      disabled={!isEditingPayment}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPassword ? "text" : "password"}
                      value={securitySettings.currentPassword}
                      onChange={(e) => setSecuritySettings((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={securitySettings.newPassword}
                    onChange={(e) => setSecuritySettings((prev) => ({ ...prev, newPassword: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={securitySettings.confirmPassword}
                    onChange={(e) => setSecuritySettings((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
                <Button onClick={handlePasswordChange} className="w-full" disabled={isChangingPassword}>
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">SMS Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive payment reminders via SMS</p>
                  </div>
                  <Button
                    variant={securitySettings.smsNotifications ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setSecuritySettings((prev) => ({ ...prev, smsNotifications: !prev.smsNotifications }))
                    }
                  >
                    {securitySettings.smsNotifications ? "Enabled" : "Disabled"}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive statements and updates via email</p>
                  </div>
                  <Button
                    variant={securitySettings.emailNotifications ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setSecuritySettings((prev) => ({ ...prev, emailNotifications: !prev.emailNotifications }))
                    }
                  >
                    {securitySettings.emailNotifications ? "Enabled" : "Disabled"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
