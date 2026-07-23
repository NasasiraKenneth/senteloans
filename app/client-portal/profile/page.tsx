"use client"

import { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, CreditCard, Lock, Shield, User, Mail, Phone, Calendar, Heart, Wallet, Sparkles } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { KycTabView } from "@/app/client-portal/profile/kyc-tab-view"
import {
  ProfileCard,
  ProfileField,
  ProfileHeader,
  ProfileLoadingSkeleton,
  ProfileRow,
  ProfileTabNav,
  ProfileTabPanel,
  ProfileToggleRow,
  profileInputClass,
  type ProfileTabConfig,
} from "@/components/client-portal-profile-ui"
import { useClientSession } from "@/components/client-session-provider"
import type { ClientPortalClient } from "@/lib/client-session-types"
import { computeClientKycProgress, parseProfileTab, type ProfileTab } from "@/lib/client-portal-kyc"
import type { KycDocType, KycUploadField, MemberKycDocRow } from "@/lib/members/kyc-docs"
import { MEMBER_TRANSACTIONAL_EMAIL_TYPES } from "@/lib/email/seed-member-preferences"
import { Badge } from "@/components/ui/badge"

function seedProfileForms(client: ClientPortalClient) {
  return {
    personalInfo: {
      fullName: client.fullName || "",
      email: client.email || "",
      phoneNumber: client.phone || "",
      dateOfBirth: client.dateOfBirth || "",
      gender: client.gender || "",
      maritalStatus: client.maritalStatus || "",
      occupation: client.occupation || "",
      monthlyIncome: client.monthlyIncome?.toString?.() || "",
      village: client.village || "",
      district: client.district || "",
      nextOfKinName: client.nextOfKinName || "",
      nextOfKinRelationship: client.nextOfKinRelationship || "",
      nextOfKinPhone: client.nextOfKinPhone || "",
    },
    paymentInfo: {
      mobileMoneyProvider: client.mobileMoneyProvider || "",
      mobileMoneyNumber: client.mobileMoneyNumber || "",
      bankName: client.bankName || "",
      bankAccountNumber: client.bankAccountNumber || "",
      bankAccountName: client.bankAccountName || "",
      bankBranch: client.bankBranch || "",
    },
  }
}

const PROFILE_TABS: ProfileTabConfig[] = [
  { id: "personal", label: "Personal", icon: User },
  { id: "kyc", label: "KYC", icon: Shield },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "security", label: "Security", icon: Lock },
]

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading profile...
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  )
}

function clientInitials(fullName: string): string {
  return fullName
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function ProfilePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data, clientTerminology, refresh, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => parseProfileTab(searchParams.get("tab")))
  const [showPassword, setShowPassword] = useState(false)
  const [kycError, setKycError] = useState<string | null>(null)
  const [kycRow, setKycRow] = useState<MemberKycDocRow | null>(null)
  const [kycDocType, setKycDocType] = useState<KycDocType>("national_id")
  const [kycUploading, setKycUploading] = useState<Record<string, boolean>>({})
  const [personalDraft, setPersonalDraft] = useState<ReturnType<typeof seedProfileForms>["personalInfo"] | null>(null)
  const [prefsSaving, setPrefsSaving] = useState(false)
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
  const [paymentDraft, setPaymentDraft] = useState<ReturnType<typeof seedProfileForms>["paymentInfo"] | null>(null)

  const [securitySettings, setSecuritySettings] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
    smsNotifications: true,
    emailNotifications: true,
  })
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const kycProgress = useMemo(
    () => computeClientKycProgress(kycDocType, kycRow),
    [kycDocType, kycRow],
  )

  const loadKyc = useCallback(async () => {
    try {
      const kycRes = await fetch("/api/client/kyc-docs", { cache: "no-store" })
      const k = await kycRes.json()
      if (!kycRes.ok) throw new Error(k?.error || "Failed to load KYC documents")
      setKycRow(k.kycRow || null)
      setKycDocType(k.docType || "national_id")
      setKycError(null)
    } catch (e: unknown) {
      setKycError((e as Error)?.message || "Could not load KYC documents")
    }
  }, [])

  const loadNotificationPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/client/notification-preferences", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) return
      const prefs = data.preferences || []
      const emailOn = prefs.length > 0 && prefs.every((p: { emailEnabled: boolean }) => p.emailEnabled)
      const smsOn = prefs.some((p: { smsEnabled: boolean }) => p.smsEnabled)
      setSecuritySettings((prev) => ({
        ...prev,
        emailNotifications: emailOn,
        smsNotifications: smsOn,
      }))
    } catch {
      // Preferences are optional for initial render
    }
  }, [])

  useEffect(() => {
    setActiveTab(parseProfileTab(searchParams.get("tab")))
  }, [searchParams])

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab)
    router.replace(`/client-portal/profile?tab=${tab}`, { scroll: false })
  }

  const startPaymentEdit = () => {
    setPaymentDraft(paymentInfo)
    setIsEditingPayment(true)
  }

  const cancelPaymentEdit = () => {
    if (paymentDraft) setPaymentInfo(paymentDraft)
    setPaymentDraft(null)
    setIsEditingPayment(false)
  }

  useEffect(() => {
    if (!data?.client) return
    let cancelled = false

    const seeded = seedProfileForms(data.client)
    setPersonalInfo(seeded.personalInfo)
    setPaymentInfo(seeded.paymentInfo)

    const load = async () => {
      await Promise.all([loadKyc(), loadNotificationPrefs()])
      if (!cancelled) setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [data, loadKyc, loadNotificationPrefs])

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
      setPersonalDraft(null)
      await refresh()
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || "Unexpected error", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const startPersonalEdit = () => {
    setPersonalDraft(personalInfo)
    setIsEditing(true)
  }

  const cancelPersonalEdit = () => {
    if (personalDraft) setPersonalInfo(personalDraft)
    setPersonalDraft(null)
    setIsEditing(false)
  }

  const handleKycUploadComplete = async (field: KycUploadField, _pendingId: string | null, _url: string) => {
    toast({ title: "Uploaded", description: "Document submitted for review.", variant: "success" })
    await loadKyc()
    if (field === "passport_photo") {
      await refresh()
    }
  }

  const updateNotificationPrefs = async (emailEnabled: boolean, smsEnabled: boolean) => {
    setPrefsSaving(true)
    try {
      const res = await fetch("/api/client/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: MEMBER_TRANSACTIONAL_EMAIL_TYPES.map((notificationType) => ({
            notificationType,
            emailEnabled,
            smsEnabled,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to update preferences")
      setSecuritySettings((prev) => ({
        ...prev,
        emailNotifications: emailEnabled,
        smsNotifications: smsEnabled,
      }))
      toast({ title: "Saved", description: "Notification preferences updated.", variant: "success" })
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: (e as Error)?.message || "Unexpected error",
        variant: "destructive",
      })
    } finally {
      setPrefsSaving(false)
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
      setPaymentDraft(null)
      await refresh()
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
    return <ProfileLoadingSkeleton />
  }

  if (!currentClient || !institution) {
    return null
  }

  const currency = institution.config?.currency || "UGX"

  return (
    <div className="w-full space-y-6 pb-12">
      <ProfileHeader
        fullName={currentClient.fullName}
        phone={currentClient.phone}
        avatarUrl={currentClient.avatarUrl}
        initials={clientInitials(currentClient.fullName)}
        kycStatus={currentClient.kycStatus}
        clientTerminology={clientTerminology}
        joinDate={currentClient.joinDate}
        kycPercent={kycProgress.percent}
        kycComplete={kycProgress.complete}
        onKycClick={() => handleTabChange("kyc")}
      />

      <ProfileTabNav tabs={PROFILE_TABS} activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === "personal" ? (
        <ProfileTabPanel tabKey="personal">
          <div className="grid gap-6 lg:grid-cols-2">
            <ProfileCard title="Identity" description="Immutable registration details from Sacco records">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Full Name</p>
                    <p className="text-sm font-semibold text-foreground truncate">{personalInfo.fullName || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Email Address</p>
                    <p className="text-sm font-semibold text-foreground truncate">{personalInfo.email || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Phone Number</p>
                    <p className="text-sm font-semibold text-foreground">{personalInfo.phoneNumber || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Date of Birth</p>
                    <p className="text-sm font-semibold text-foreground">{personalInfo.dateOfBirth || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Gender</p>
                    <p className="text-sm font-semibold text-foreground">
                      {personalInfo.gender
                        ? personalInfo.gender.charAt(0).toUpperCase() + personalInfo.gender.slice(1)
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Heart className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Marital Status</p>
                    <p className="text-sm font-semibold text-foreground">
                      {personalInfo.maritalStatus
                        ? personalInfo.maritalStatus.charAt(0).toUpperCase() + personalInfo.maritalStatus.slice(1)
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg sm:col-span-2">
                  <div className="h-8 w-8 rounded-full bg-[#f08c2b]/10 flex items-center justify-center text-[#f08c2b] shrink-0">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Monthly Net Income</p>
                    <p className="text-sm font-bold text-emerald-600 font-mono">
                      {personalInfo.monthlyIncome ? formatMoney(Number(personalInfo.monthlyIncome)) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </ProfileCard>

            <ProfileCard
              title="Contact & next of kin"
              description="Occupation, location, and emergency contact"
              editable
              editing={isEditing}
              saving={isSaving}
              onEdit={startPersonalEdit}
              onCancel={cancelPersonalEdit}
              onSave={handlePersonalInfoSave}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileField label="Occupation" className="sm:col-span-2">
                  <input
                    id="occupation"
                    value={personalInfo.occupation}
                    onChange={(e) => setPersonalInfo((prev) => ({ ...prev, occupation: e.target.value }))}
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
                <ProfileField label="Village / area">
                  <input
                    id="village"
                    value={personalInfo.village}
                    onChange={(e) => setPersonalInfo((prev) => ({ ...prev, village: e.target.value }))}
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
                <ProfileField label="District">
                  <input
                    id="district"
                    value={personalInfo.district}
                    onChange={(e) => setPersonalInfo((prev) => ({ ...prev, district: e.target.value }))}
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
                <ProfileField label="Next of kin" className="sm:col-span-2">
                  <input
                    id="nokName"
                    placeholder="Name"
                    value={personalInfo.nextOfKinName}
                    onChange={(e) => setPersonalInfo((prev) => ({ ...prev, nextOfKinName: e.target.value }))}
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
                <ProfileField label="Relationship">
                  <input
                    id="nokRelationship"
                    value={personalInfo.nextOfKinRelationship}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, nextOfKinRelationship: e.target.value }))
                    }
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
                <ProfileField label="Next of kin phone">
                  <input
                    id="nokPhone"
                    value={personalInfo.nextOfKinPhone}
                    onChange={(e) => setPersonalInfo((prev) => ({ ...prev, nextOfKinPhone: e.target.value }))}
                    disabled={!isEditing}
                    readOnly={!isEditing}
                    className={profileInputClass(isEditing)}
                  />
                </ProfileField>
              </div>
            </ProfileCard>
          </div>
        </ProfileTabPanel>
      ) : null}

      {activeTab === "kyc" ? (
        <ProfileTabPanel tabKey="kyc">
          {kycError ? (
            <ProfileCard title="Documents" description="Could not load your KYC documents">
              <p className="text-sm text-destructive">{kycError}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void loadKyc()}>
                Retry
              </Button>
            </ProfileCard>
          ) : currentClient?.id ? (
            <KycTabView
              memberId={currentClient.id}
              docType={kycDocType}
              kycRow={kycRow}
              kycStatus={currentClient.kycStatus}
              uploading={kycUploading}
              onUploadingChange={(field, value) =>
                setKycUploading((prev) => ({ ...prev, [field]: value }))
              }
              onUploadComplete={(field, pendingId, url) =>
                void handleKycUploadComplete(field, pendingId, url)
              }
            />
          ) : null}
        </ProfileTabPanel>
      ) : null}

      {activeTab === "payment" ? (
        <ProfileTabPanel tabKey="payment">
          <ProfileCard
            title="Settlement Details"
            description="Mobile money and bank account settings for automated payouts"
            editable
            editing={isEditingPayment}
            saving={isSavingPayment}
            onEdit={startPaymentEdit}
            onCancel={cancelPaymentEdit}
            onSave={handlePaymentSave}
          >
            <div className="space-y-6">
              {/* Section 1: Mobile Money Wallet */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#f08c2b]">
                    Mobile Money Wallet (Primary Payout)
                  </span>
                  <Badge variant="secondary" className="bg-[#f08c2b]/10 text-[#f08c2b] border-[#f08c2b]/20 text-[9px] font-bold px-2 py-0.5">
                    RECOMMENDED
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProfileField label="Mobile money provider">
                    <input
                      id="mmProvider"
                      placeholder="e.g. MTN Uganda"
                      value={paymentInfo.mobileMoneyProvider}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, mobileMoneyProvider: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                  <ProfileField label="Mobile money number">
                    <input
                      id="mmNumber"
                      placeholder="e.g. +256770123456"
                      value={paymentInfo.mobileMoneyNumber}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, mobileMoneyNumber: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                </div>
              </div>

              {/* Section 2: Bank Account Details */}
              <div className="space-y-3.5 pt-2">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    Bank Account Details (Alternate Cashout)
                  </span>
                  <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground border-border/60">
                    EFT / RTGS
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <ProfileField label="Bank">
                    <input
                      id="bankName"
                      placeholder="e.g. Centenary Bank"
                      value={paymentInfo.bankName}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankName: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                  <ProfileField label="Branch">
                    <input
                      id="bankBranch"
                      placeholder="e.g. Kampala Corporate"
                      value={paymentInfo.bankBranch}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankBranch: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                  <ProfileField label="Account name">
                    <input
                      id="accountName"
                      placeholder="e.g. John Doe"
                      value={paymentInfo.bankAccountName}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankAccountName: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                  <ProfileField label="Account number">
                    <input
                      id="accountNumber"
                      placeholder="e.g. 31000..."
                      value={paymentInfo.bankAccountNumber}
                      onChange={(e) => setPaymentInfo((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                      disabled={!isEditingPayment}
                      readOnly={!isEditingPayment}
                      className={profileInputClass(isEditingPayment)}
                    />
                  </ProfileField>
                </div>
              </div>
            </div>
          </ProfileCard>
        </ProfileTabPanel>
      ) : null}

      {activeTab === "security" ? (
        <ProfileTabPanel tabKey="security">
          <div className="grid gap-6 lg:grid-cols-2">
            <ProfileCard title="Password" description="Update your sign-in password">
              <div className="space-y-4">
                <ProfileField label="Current password">
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showPassword ? "text" : "password"}
                      value={securitySettings.currentPassword}
                      onChange={(e) =>
                        setSecuritySettings((prev) => ({ ...prev, currentPassword: e.target.value }))
                      }
                      className={`${profileInputClass(true)} pr-10`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-10 px-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </ProfileField>
                <ProfileField label="New password">
                  <input
                    id="newPassword"
                    type="password"
                    value={securitySettings.newPassword}
                    onChange={(e) => setSecuritySettings((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className={profileInputClass(true)}
                  />
                </ProfileField>
                <ProfileField label="Confirm password">
                  <input
                    id="confirmPassword"
                    type="password"
                    value={securitySettings.confirmPassword}
                    onChange={(e) =>
                      setSecuritySettings((prev) => ({ ...prev, confirmPassword: e.target.value }))
                    }
                    className={profileInputClass(true)}
                  />
                </ProfileField>
                <Button onClick={handlePasswordChange} disabled={isChangingPassword} className="w-full">
                  {isChangingPassword ? "Updating…" : "Update password"}
                </Button>
              </div>
            </ProfileCard>

            <ProfileCard title="Notifications" description="How we reach you">
              <div className="bg-muted/10 border border-border/40 rounded-lg divide-y divide-border/40 overflow-hidden px-4">
                <ProfileToggleRow
                  label="SMS Notifications"
                  description="Payment reminders, security codes and transactional alerts"
                  checked={securitySettings.smsNotifications}
                  disabled={prefsSaving}
                  onCheckedChange={(checked) =>
                    void updateNotificationPrefs(securitySettings.emailNotifications, checked)
                  }
                />
                <ProfileToggleRow
                  label="Email Notifications"
                  description="Monthly statements, invoice receipts and account updates"
                  checked={securitySettings.emailNotifications}
                  disabled={prefsSaving}
                  onCheckedChange={(checked) =>
                    void updateNotificationPrefs(checked, securitySettings.smsNotifications)
                  }
                />
              </div>
            </ProfileCard>
          </div>
        </ProfileTabPanel>
      ) : null}
    </div>
  )
}
