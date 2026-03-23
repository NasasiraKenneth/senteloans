"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Save, User, SettingsIcon, DollarSign, Zap, BellRing, Clock3, ShieldAlert, SlidersHorizontal, Building2, Pencil, X } from "lucide-react"

import { getSession, updateInstitutionConfig } from "@/lib/session"
import { useToast } from "@/components/ui/toast"

interface InstitutionConfig {
  modules: { loans: boolean; shares: boolean; savings: boolean; mobile_money: boolean }
  currency: string
  shareValue?: number
  minimumShares?: number
  maximumShares?: number
  clientTerminology: string
  membershipFee?: number
  maximumParallelLoans?: number
  loanLatePenalty?: number
  loanLatePenaltyPeriodDays?: number
  membershipLatePenalty?: number
  membershipLatePenaltyPeriodDays?: number
  autoInvoices?: boolean
  invoicePeriodDays?: number
  defaultedAfterDays?: number
  monthlyOverdueGraceDays?: number
}

interface InstitutionOrg {
  id: string
  name: string
  type: string
  address: string
  phone_number: string
  email: string
  license_number: string
  registration_number: string
  website: string
  established_date: string | null
}

type InstitutionSettingsWorkspace = "general" | "loan" | "penalties" | "shares"

interface StaffMember {
  id: string
  full_name: string
  email: string | null
  phone_number: string | null
  role: string | null
  status: string | null
  joined_at: string | null
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [session, setSession] = useState<any>(null)
  const [institution, setInstitution] = useState<{ id: string; name: string; type: string } | null>(null)
  const [config, setConfig] = useState<InstitutionConfig | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])

  const [isSavingInstitution, setIsSavingInstitution] = useState(false)
  const [isSavingOrg, setIsSavingOrg] = useState(false)
  const [org, setOrg] = useState<InstitutionOrg | null>(null)
  const [isOrgEditMode, setIsOrgEditMode] = useState(false)
  const [orgDraftBackup, setOrgDraftBackup] = useState<InstitutionOrg | null>(null)
  const [activeTab, setActiveTab] = useState<"general" | "loan" | "penalties" | "shares" | "organization" | "admin">("general")
  const [institutionEditWorkspace, setInstitutionEditWorkspace] = useState<InstitutionSettingsWorkspace | null>(null)
  const [institutionConfigDraftBackup, setInstitutionConfigDraftBackup] = useState<InstitutionConfig | null>(null)
  const memberInputClass =
    "h-10 rounded-md border-gray-300 text-sm transition-all duration-200 hover:border-gray-400 focus-visible:ring-[1.5px] focus-visible:ring-[#f08c2b] focus-visible:border-transparent"
  const memberSelectClass =
    "h-10 rounded-md border-gray-300 text-sm transition-all duration-200 hover:border-gray-400 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent"

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    ;(async () => {
      try {
        const [instRes, orgRes, staffRes] = await Promise.all([
          fetch("/api/institution/settings", { cache: "no-store" }),
          fetch("/api/institution/organization", { cache: "no-store" }),
          fetch("/api/institution/staff?limit=200", { cache: "no-store" }),
        ])
        if (instRes.ok) {
          const inst = await instRes.json()
          setInstitution({ id: inst.id, name: inst.name, type: inst.type })
          setConfig(inst.config)
        }
        if (orgRes.ok) {
          const o = await orgRes.json()
          setOrg({
            id: o.id,
            name: o.name,
            type: o.type,
            address: o.address || "",
            phone_number: o.phone_number || "",
            email: o.email || "",
            license_number: o.license_number || "",
            registration_number: o.registration_number || "",
            website: o.website || "",
            established_date: o.established_date || null,
          })
        }
        if (staffRes.ok) {
          const staffData = await staffRes.json()
          setStaffMembers(Array.isArray(staffData?.staff) ? staffData.staff : [])
        }
      } catch (_) {
        // swallow
      }
    })()
  }, [])

  const setConfigField = (field: keyof InstitutionConfig, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev))
  }
  const setModule = (key: keyof InstitutionConfig["modules"], value: boolean) => {
    setConfig((prev) => (prev ? { ...prev, modules: { ...prev.modules, [key]: value } } : prev))
  }

  const cloneConfig = (value: InstitutionConfig): InstitutionConfig => JSON.parse(JSON.stringify(value))

  const handleSaveInstitution = async (): Promise<boolean> => {
    if (!config || !institution) return false
    // basic client-side validations
    const isSaccoOrMfi = institution.type === "SACCO" || institution.type === "MFI"
    if (isSaccoOrMfi && config.modules.shares) {
      if (!config.shareValue || config.shareValue <= 0) {
        toast({ title: "Validation", description: "Please set a valid Value per Share for shares-enabled institutions.", variant: "warning" })
        return false
      }
      if (typeof config.minimumShares === "number" && config.minimumShares < 0) {
        toast({ title: "Validation", description: "Minimum shares must be >= 0", variant: "warning" })
        return false
      }
      if (
        typeof config.minimumShares === "number" &&
        typeof config.maximumShares === "number" &&
        config.minimumShares > config.maximumShares
      ) {
        toast({ title: "Validation", description: "Minimum shares cannot be greater than maximum shares", variant: "warning" })
        return false
      }
    }
    if ((config.defaultedAfterDays ?? 0) < 1) {
      toast({ title: "Validation", description: "Auto default days must be at least 1.", variant: "warning" })
      return false
    }
    if ((config.invoicePeriodDays ?? 0) < 1) {
      toast({ title: "Validation", description: "Invoice due period must be at least 1 day.", variant: "warning" })
      return false
    }
    if ((config.loanLatePenaltyPeriodDays ?? 0) < 1 || (config.membershipLatePenaltyPeriodDays ?? 0) < 1) {
      toast({ title: "Validation", description: "Penalty periods must be at least 1 day.", variant: "warning" })
      return false
    }
    if ((config.loanLatePenalty ?? 0) < 0 || (config.loanLatePenalty ?? 0) > 100) {
      toast({ title: "Validation", description: "Loan late penalty must be between 0% and 100%.", variant: "warning" })
      return false
    }
    if (!Number.isInteger(config.maximumParallelLoans ?? 1) || (config.maximumParallelLoans ?? 1) < 1) {
      toast({ title: "Validation", description: "Maximum number of parallel loans must be at least 1.", variant: "warning" })
      return false
    }

    setIsSavingInstitution(true)
    try {
      const a = await fetch("/api/institution/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      })
      if (!a.ok) {
        const { error } = await a.json()
        throw new Error(error || "Failed to save institution settings")
      }
      const updated = await a.json()
      // update local session config immediately so the app reflects changes without reload
      if (updated?.config) {
        try { updateInstitutionConfig(updated.config) } catch {}
        setConfig(updated.config)
        setInstitutionConfigDraftBackup(cloneConfig(updated.config))
      }
      toast({ title: "Saved", description: "Institution settings updated.", variant: "success" })
      return true
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save settings", variant: "destructive" })
      return false
    } finally {
      setIsSavingInstitution(false)
    }
  }

  const getInstitutionTerminology = () => {
    if (!institution) return { name: "Institution", type: "Institution" }
    switch (institution.type) {
      case "SACCO":
        return { name: "SACCO", type: "SACCO" }
      case "MFI":
        return { name: "MFI", type: "Microfinance Institution" }
      case "Money Lender":
        return { name: "Money Lender", type: "Money Lending Business" }
      default:
        return { name: "Institution", type: "Institution" }
    }
  }

  const terminology = getInstitutionTerminology()
  const tabMeta: Record<"general" | "loan" | "penalties" | "shares" | "organization" | "admin", { title: string; subtitle: string }> = {
    general: {
      title: "General Configuration",
      subtitle: "Core institution preferences and member defaults.",
    },
    loan: {
      title: "Loan Policies",
      subtitle: "Configure processing, invoicing, overdue and default behavior.",
    },
    penalties: {
      title: "Penalty Rules",
      subtitle: "Define late-penalty values and recurrence periods.",
    },
    shares: {
      title: "Shares Workspace",
      subtitle: "Enable shares and set share pricing requirements.",
    },
    organization: {
      title: "Organization Profile",
      subtitle: "Maintain official institutional records and contacts.",
    },
    admin: {
      title: "Institution Admins",
      subtitle: "View institution administrators and staff directory.",
    },
  }
  const isSaccoOrMfi = institution?.type === "SACCO" || institution?.type === "MFI"

  useEffect(() => {
    if (!institutionEditWorkspace) return
    const activeWorkspace =
      activeTab === "general" || activeTab === "loan" || activeTab === "penalties" || activeTab === "shares"
        ? activeTab
        : null
    if (activeWorkspace && activeWorkspace !== institutionEditWorkspace) {
      if (institutionConfigDraftBackup) setConfig(cloneConfig(institutionConfigDraftBackup))
      setInstitutionEditWorkspace(null)
    }
  }, [activeTab, institutionEditWorkspace, institutionConfigDraftBackup])

  if (!institution || !config) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </>
    )
  }

  const setOrgField = (field: keyof InstitutionOrg, value: string) => {
    setOrg((prev) => (prev ? { ...prev, [field]: value } as InstitutionOrg : prev))
  }

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const isValidPhone = (phone: string) => /^[+\d][\d\s-]{6,19}$/.test(phone)
  const isValidUrl = (url: string) => {
    try { new URL(url); return true } catch { return false }
  }
  const getInitials = (name: string | null | undefined) =>
    (name || "")
      .split(" ")
      .map((part) => part.trim()[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "NA"
  const formatRole = (role: string | null | undefined) => (role || "staff").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

  const getActiveInstitutionWorkspace = (): InstitutionSettingsWorkspace | null => {
    if (activeTab === "general" || activeTab === "loan" || activeTab === "penalties" || activeTab === "shares") return activeTab
    return null
  }

  const canEditInstitutionWorkspace = (workspace: InstitutionSettingsWorkspace): boolean => institutionEditWorkspace === workspace

  const handleStartInstitutionEdit = () => {
    if (!config) return
    const workspace = getActiveInstitutionWorkspace()
    if (!workspace) return
    setInstitutionConfigDraftBackup(cloneConfig(config))
    setInstitutionEditWorkspace(workspace)
  }

  const handleCancelInstitutionEdit = () => {
    if (institutionConfigDraftBackup) setConfig(cloneConfig(institutionConfigDraftBackup))
    setInstitutionEditWorkspace(null)
  }

  const handleSaveInstitutionEdit = async () => {
    const ok = await handleSaveInstitution()
    if (ok) setInstitutionEditWorkspace(null)
  }

  const cloneOrg = (value: InstitutionOrg): InstitutionOrg => JSON.parse(JSON.stringify(value))

  const handleSaveOrg = async (): Promise<boolean> => {
    if (!org) return false
    // client-side validation
    if (org.email && !isValidEmail(org.email)) {
      toast({ title: "Validation", description: "Enter a valid email address", variant: "warning" })
      return false
    }
    if (org.phone_number && !isValidPhone(org.phone_number)) {
      toast({ title: "Validation", description: "Enter a valid phone number", variant: "warning" })
      return false
    }
    if (org.website && !isValidUrl(org.website)) {
      toast({ title: "Validation", description: "Enter a valid website URL (include http/https)", variant: "warning" })
      return false
    }
    if (org.established_date) {
      const d = new Date(org.established_date)
      if (Number.isNaN(d.getTime())) {
        toast({ title: "Validation", description: "Established date is invalid", variant: "warning" })
        return false
      }
    }

    setIsSavingOrg(true)
    try {
      const res = await fetch("/api/institution/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: org.address,
          phone_number: org.phone_number,
          email: org.email,
          license_number: org.license_number,
          registration_number: org.registration_number,
          website: org.website,
          established_date: org.established_date,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save institution profile")
      setOrg((prev) => (prev ? { ...prev, ...data } : prev))
      setOrgDraftBackup((prev) => {
        const next = prev ? { ...prev, ...data } : data
        return cloneOrg(next)
      })
      toast({ title: "Saved", description: "Institution profile updated.", variant: "success" })
      return true
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save institution profile", variant: "destructive" })
      return false
    } finally {
      setIsSavingOrg(false)
    }
  }

  const handleStartOrgEdit = () => {
    if (!org) return
    setOrgDraftBackup(cloneOrg(org))
    setIsOrgEditMode(true)
  }

  const handleCancelOrgEdit = () => {
    if (orgDraftBackup) setOrg(cloneOrg(orgDraftBackup))
    setIsOrgEditMode(false)
  }

  const handleSaveOrgEdit = async () => {
    const ok = await handleSaveOrg()
    if (ok) setIsOrgEditMode(false)
  }

  return (
    <>
      <div className="container mx-auto max-w-6xl py-4">
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#111111]/10 bg-white shadow-sm">
                <div className="p-6 md:p-7 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-[#f08c2b] mb-1">INSTITUTION SETTINGS</p>
                    <h1 className="text-3xl font-bold tracking-tight text-[#111111]">Control Center</h1>
                    <p className="text-muted-foreground mt-1">
                      Manage policies, automation, and organization profile for your {terminology.type.toLowerCase()}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-[#111111] text-white hover:bg-[#111111]">{institution.type}</Badge>
                    <Badge className="bg-[#f08c2b]/15 text-[#c06107] border border-[#f08c2b]/25 hover:bg-[#f08c2b]/15">{config.currency}</Badge>
                    <Badge className="bg-[#111111]/5 text-[#111111] border border-[#111111]/10 hover:bg-[#111111]/5">
                      {config.modules.shares ? "Shares Enabled" : "Shares Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                <aside className="lg:col-span-3">
                  <div className="rounded-2xl border border-[#111111]/10 bg-white p-3 shadow-sm lg:sticky lg:top-4">
                    <div className="px-2 pb-3">
                      <p className="text-xs font-semibold tracking-wide text-[#f08c2b]">WORKSPACE</p>
                      <p className="text-sm text-muted-foreground mt-1">Select a section to configure</p>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("general")}
                        className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                          activeTab === "general"
                            ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                            : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                        }`}
                      >
                        <SettingsIcon className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">General</span>
                          <span className={`text-xs ${activeTab === "general" ? "text-white/70" : "text-muted-foreground"}`}>Currency and member setup</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("loan")}
                        className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                          activeTab === "loan"
                            ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                            : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                        }`}
                      >
                        <SlidersHorizontal className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">Loan Policies</span>
                          <span className={`text-xs ${activeTab === "loan" ? "text-white/70" : "text-muted-foreground"}`}>Processing and default logic</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("penalties")}
                        className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                          activeTab === "penalties"
                            ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                            : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                        }`}
                      >
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">Penalty Rules</span>
                          <span className={`text-xs ${activeTab === "penalties" ? "text-white/70" : "text-muted-foreground"}`}>Loan and membership penalties</span>
                        </span>
                      </button>
                      {isSaccoOrMfi && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("shares")}
                          className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                            activeTab === "shares"
                              ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                              : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                          }`}
                        >
                          <DollarSign className="h-4 w-4 shrink-0" />
                          <span className="flex flex-col">
                            <span className="text-sm font-semibold">Shares Workspace</span>
                            <span className={`text-xs ${activeTab === "shares" ? "text-white/70" : "text-muted-foreground"}`}>Share enablement and value</span>
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab("organization")}
                        className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                          activeTab === "organization"
                            ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                            : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                        }`}
                      >
                        <Building2 className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">Organization Profile</span>
                          <span className={`text-xs ${activeTab === "organization" ? "text-white/70" : "text-muted-foreground"}`}>Legal and contact records</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("admin")}
                        className={`w-full min-h-14 rounded-xl px-3 text-left transition-all flex items-center gap-2 border ${
                          activeTab === "admin"
                            ? "bg-[#111111] text-white shadow-sm border-[#111111]"
                            : "bg-transparent text-[#111111]/75 border-transparent hover:bg-[#f08c2b]/10 hover:text-[#111111] hover:border-[#f08c2b]/25"
                        }`}
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">Institution Admins</span>
                          <span className={`text-xs ${activeTab === "admin" ? "text-white/70" : "text-muted-foreground"}`}>Admins and staff directory</span>
                        </span>
                      </button>
                    </div>
                    <div className="mt-4 rounded-xl border border-[#111111]/10 bg-[#111111]/5 p-3 text-xs text-muted-foreground">
                      Changes are saved per section. Use panel save actions to commit updates.
                    </div>
                  </div>
                </aside>
                <div className="lg:col-span-9 space-y-5">
                <div className="rounded-2xl border border-[#111111]/10 bg-white p-4 md:p-5 shadow-sm">
                  <p className="text-xs font-semibold tracking-wide text-[#f08c2b] mb-1">ACTIVE SECTION</p>
                  <h2 className="text-xl font-semibold text-[#111111]">{tabMeta[activeTab].title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{tabMeta[activeTab].subtitle}</p>
                </div>
                {/* Institution Configuration */}
                {(activeTab === "general" || activeTab === "loan" || activeTab === "penalties" || activeTab === "shares") && (
                <Card className="group border-[#1f1f1f]/10 shadow-md rounded-2xl overflow-hidden">
                  <CardHeader className="bg-white border-b border-[#111111]/10">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <SettingsIcon className="h-5 w-5 text-[#f08c2b]" />
                          {terminology.name} Configuration
                        </CardTitle>
                        <CardDescription>
                          Configure your {terminology.type.toLowerCase()}'s operational settings
                        </CardDescription>
                      </div>
                      <div className={`flex items-center gap-2 transition-opacity ${institutionEditWorkspace === activeTab ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        {institutionEditWorkspace === activeTab ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelInstitutionEdit}
                              disabled={isSavingInstitution}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              aria-label="Cancel editing institution settings"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveInstitutionEdit}
                              disabled={isSavingInstitution}
                              className="h-8 w-8 text-[#f08c2b] hover:text-[#c06107]"
                              aria-label="Save institution settings"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleStartInstitutionEdit}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            aria-label="Edit institution settings"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(activeTab === "general" || activeTab === "shares") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{terminology.name} Name</Label>
                        <Input value={institution.name} readOnly className={memberInputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label>Institution Type</Label>
                        <Input value={institution.type} readOnly className={memberInputClass} />
                      </div>
                    </div>
                    )}

                    {(activeTab === "general" || activeTab === "shares") && <Separator />}

                    {activeTab === "general" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currency">Preferred Currency</Label>
                        <Select disabled={!canEditInstitutionWorkspace("general")} value={config.currency} onValueChange={(value) => setConfigField("currency", value)}>
                          <SelectTrigger className={memberSelectClass}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UGX">Ugandan Shilling (UGX)</SelectItem>
                            <SelectItem value="USD">US Dollar (USD)</SelectItem>
                            <SelectItem value="KES">Kenyan Shilling (KES)</SelectItem>
                            <SelectItem value="TZS">Tanzanian Shilling (TZS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientTerm">Client Terminology</Label>
                        <Input
                          id="clientTerm"
                          value={config.clientTerminology}
                          onChange={(e) => setConfigField("clientTerminology", e.target.value)}
                          disabled={!canEditInstitutionWorkspace("general")}
                          className={memberInputClass}
                        />
                      </div>
                    </div>
                    )}

                    {activeTab === "loan" && (
                    <div className="rounded-lg border border-[#111111]/10 bg-white p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                        <Zap className="h-4 w-4 text-[#f08c2b]" />
                        Automation & Loan Policies
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="maximumParallelLoans">Maximum Number of Parallel Loans</Label>
                          <Input
                            id="maximumParallelLoans"
                            type="number"
                            min={1}
                            step="1"
                            value={Number(config.maximumParallelLoans ?? 1)}
                            onChange={(e) => setConfigField("maximumParallelLoans", Number.parseInt(e.target.value || "1"))}
                            disabled={!canEditInstitutionWorkspace("loan")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="monthlyOverdueGraceDays">Monthly Payment Overdue Grace (days)</Label>
                          <Input
                            id="monthlyOverdueGraceDays"
                            type="number"
                            min={0}
                            value={Number(config.monthlyOverdueGraceDays ?? 0)}
                            onChange={(e) => setConfigField("monthlyOverdueGraceDays", Number.parseInt(e.target.value || "0"))}
                            disabled={!canEditInstitutionWorkspace("loan")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="defaultedAfterDays">Auto Default After Days Past Due</Label>
                          <Input
                            id="defaultedAfterDays"
                            type="number"
                            min={1}
                            value={Number(config.defaultedAfterDays ?? 90)}
                            onChange={(e) => setConfigField("defaultedAfterDays", Number.parseInt(e.target.value || "90"))}
                            disabled={!canEditInstitutionWorkspace("loan")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="invoicePeriodDays">Invoice Due Period (days)</Label>
                          <Input
                            id="invoicePeriodDays"
                            type="number"
                            min={1}
                            value={Number(config.invoicePeriodDays ?? 30)}
                            onChange={(e) => setConfigField("invoicePeriodDays", Number.parseInt(e.target.value || "30"))}
                            disabled={!canEditInstitutionWorkspace("loan")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Auto Invoices</Label>
                          <div className="flex items-center gap-2">
                            <label htmlFor="autoInvoices" className="relative inline-flex cursor-pointer">
                              <input
                                id="autoInvoices"
                                type="checkbox"
                                className="peer sr-only"
                                checked={!!config.autoInvoices}
                                disabled={!canEditInstitutionWorkspace("loan")}
                                onChange={(e) => setConfigField("autoInvoices", e.target.checked)}
                              />
                              <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#f08c2b]" />
                              <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                            </label>
                            <Label htmlFor="autoInvoices" className="text-sm text-muted-foreground cursor-pointer">
                              Automatically generate monthly invoices/dues reminders
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                    )}

                    {activeTab === "penalties" && (
                    <div className="rounded-lg border border-[#111111]/10 bg-white p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                        <ShieldAlert className="h-4 w-4 text-[#f08c2b]" />
                        Late Penalty Rules
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="loanLatePenalty">Loan Late Penalty (%)</Label>
                          <Input
                            id="loanLatePenalty"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={Number(config.loanLatePenalty ?? 0)}
                            onChange={(e) => setConfigField("loanLatePenalty", Number.parseFloat(e.target.value || "0"))}
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="loanLatePenaltyPeriodDays">Loan Late Penalty Period (days)</Label>
                          <Input
                            id="loanLatePenaltyPeriodDays"
                            type="number"
                            min={1}
                            value={Number(config.loanLatePenaltyPeriodDays ?? 30)}
                            onChange={(e) => setConfigField("loanLatePenaltyPeriodDays", Number.parseInt(e.target.value || "30"))}
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="membershipLatePenalty">Membership Late Penalty ({config.currency})</Label>
                          <Input
                            id="membershipLatePenalty"
                            type="number"
                            min={0}
                            value={Number(config.membershipLatePenalty ?? 0)}
                            onChange={(e) => setConfigField("membershipLatePenalty", Number.parseFloat(e.target.value || "0"))}
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="membershipLatePenaltyPeriodDays">Membership Late Penalty Period (days)</Label>
                          <Input
                            id="membershipLatePenaltyPeriodDays"
                            type="number"
                            min={1}
                            value={Number(config.membershipLatePenaltyPeriodDays ?? 30)}
                            onChange={(e) => setConfigField("membershipLatePenaltyPeriodDays", Number.parseInt(e.target.value || "30"))}
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            className={memberInputClass}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <BellRing className="h-3.5 w-3.5 mt-0.5" />
                        <span>
                          Period means how long after due date a penalty is applied again (for example, every 30 days).
                        </span>
                      </div>
                    </div>
                    )}

                    {(activeTab === "shares" && isSaccoOrMfi) && (
                      <div className="space-y-2">
                        <Label>Enable Shares</Label>
                        <div className="flex items-center gap-2">
                          <label htmlFor="enableShares" className="relative inline-flex cursor-pointer">
                            <input
                              id="enableShares"
                              type="checkbox"
                              className="peer sr-only"
                              checked={!!config.modules.shares}
                              disabled={!canEditInstitutionWorkspace("shares")}
                              onChange={(e) => setModule("shares", e.target.checked)}
                            />
                            <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#f08c2b]" />
                            <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                          </label>
                          <Label htmlFor="enableShares" className="text-sm text-muted-foreground cursor-pointer">
                            Allow members to hold shares (SACCO/MFI only)
                          </Label>
                        </div>
                      </div>
                    )}

                    {(activeTab === "shares" && isSaccoOrMfi && config.modules.shares) && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="minShares">Minimum Number of Shares</Label>
                            <Input
                              id="minShares"
                              type="number"
                              value={Number(config.minimumShares ?? 0)}
                              onChange={(e) => setConfigField("minimumShares", Number.parseInt(e.target.value || "0"))}
                              disabled={!canEditInstitutionWorkspace("shares")}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="shareAmount">Value per Share ({config.currency})</Label>
                            <Input
                              id="shareAmount"
                              type="number"
                              value={Number(config.shareValue ?? 0)}
                              onChange={(e) => setConfigField("shareValue", Number.parseInt(e.target.value || "0"))}
                              disabled={!canEditInstitutionWorkspace("shares")}
                              className={memberInputClass}
                            />
                          </div>
                        </div>

                        <div className="pt-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="h-4 w-4" />
                            <span>
                              Minimum capital requirement: {config.currency}{" "}
                              {((Number(config.minimumShares ?? 0) * Number(config.shareValue ?? 0)) || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {activeTab === "general" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="membershipFee">Membership Fee ({config.currency})</Label>
                        <Input
                          id="membershipFee"
                          type="number"
                          min={0}
                          value={Number(config.membershipFee ?? 0)}
                          onChange={(e) => setConfigField("membershipFee", Number.parseInt(e.target.value || "0"))}
                          disabled={!canEditInstitutionWorkspace("general")}
                          placeholder="e.g. 50000"
                          className={memberInputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clockHint">Policy Cycle Hint</Label>
                        <div id="clockHint" className="h-10 px-3 rounded-md border border-[#111111]/10 bg-[#111111]/5 text-sm flex items-center text-muted-foreground">
                          <Clock3 className="h-4 w-4 mr-2 text-[#f08c2b]" />
                          Billing and penalty policies are day-based for clarity.
                        </div>
                      </div>
                    </div>
                    )}
                  </CardContent>
                </Card>
                )}

                {/* Institution Profile (Organization) */}
                {activeTab === "organization" && (
                <Card className="group border-[#1f1f1f]/10 shadow-md rounded-2xl">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <User className="h-5 w-5" />
                          {terminology.name} Profile
                        </CardTitle>
                        <CardDescription>Update your institution's official details</CardDescription>
                      </div>
                      <div className={`flex items-center gap-2 transition-opacity ${isOrgEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        {isOrgEditMode ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelOrgEdit}
                              disabled={isSavingOrg}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              aria-label="Cancel editing organization profile"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveOrgEdit}
                              disabled={isSavingOrg}
                              className="h-8 w-8 text-[#f08c2b] hover:text-[#c06107]"
                              aria-label="Save organization profile"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleStartOrgEdit}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            aria-label="Edit organization profile"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{terminology.name} Name</Label>
                        <Input value={org?.name || ""} readOnly className={memberInputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label>Institution Type</Label>
                        <Input value={org?.type || ""} readOnly className={memberInputClass} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="regNo">Registration Number</Label>
                      <Input id="regNo" value={org?.registration_number || ""} onChange={(e) => setOrgField("registration_number", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="licenseNo">License Number</Label>
                      <Input id="licenseNo" value={org?.license_number || ""} onChange={(e) => setOrgField("license_number", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" value={org?.address || ""} onChange={(e) => setOrgField("address", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="orgPhone">Phone Number</Label>
                        <Input id="orgPhone" value={org?.phone_number || ""} onChange={(e) => setOrgField("phone_number", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="orgEmail">Email</Label>
                        <Input id="orgEmail" type="email" value={org?.email || ""} onChange={(e) => setOrgField("email", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input id="website" value={org?.website || ""} onChange={(e) => setOrgField("website", e.target.value)} disabled={!isOrgEditMode} placeholder="https://example.com" className={memberInputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="established">Established Date</Label>
                        <Input id="established" type="date" value={(org?.established_date ?? "") as string} onChange={(e) => setOrgField("established_date", e.target.value)} disabled={!isOrgEditMode} className={memberInputClass} />
                      </div>
                    </div>

                  </CardContent>
                </Card>
                )}

                {/* Institution Admins */}
                {activeTab === "admin" && (
                <Card className="border-[#1f1f1f]/10 shadow-md rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Institution Admins
                    </CardTitle>
                    <CardDescription>Read-only view of administrators in your institution.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge className="bg-[#f08c2b]/15 text-[#c06107] border border-[#f08c2b]/25 hover:bg-[#f08c2b]/15">
                        Admins: {staffMembers.filter((s) => s.role === "institution_admin").length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[...staffMembers]
                        .filter((member) => member.role === "institution_admin")
                        .sort((a, b) => {
                          return String(a.full_name || "").localeCompare(String(b.full_name || ""))
                        })
                        .map((member) => (
                          <div key={member.id} className="rounded-xl border border-[#111111]/10 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-full bg-[#f08c2b]/15 text-[#c06107] flex items-center justify-center text-xs font-bold shrink-0">
                                  {getInitials(member.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#111111] truncate">{member.full_name || "Unnamed Staff"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{member.email || "No email"}</p>
                                </div>
                              </div>
                              {member.role === "institution_admin" && (
                                <Badge className="bg-[#111111] text-white hover:bg-[#111111]">Admin</Badge>
                              )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md bg-[#111111]/5 px-2 py-1.5 text-muted-foreground">
                                Role: <span className="text-[#111111] font-medium">{formatRole(member.role)}</span>
                              </div>
                              <div className="rounded-md bg-[#111111]/5 px-2 py-1.5 text-muted-foreground">
                                Status: <span className="text-[#111111] font-medium">{member.status || "Unknown"}</span>
                              </div>
                              <div className="col-span-2 rounded-md bg-[#111111]/5 px-2 py-1.5 text-muted-foreground truncate">
                                Email: <span className="text-[#111111] font-medium">{member.email || "Not provided"}</span>
                              </div>
                              <div className="col-span-2 rounded-md bg-[#111111]/5 px-2 py-1.5 text-muted-foreground truncate">
                                Phone: <span className="text-[#111111] font-medium">{member.phone_number || "Not provided"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      {staffMembers.filter((member) => member.role === "institution_admin").length === 0 && (
                        <div className="md:col-span-2 rounded-xl border border-dashed border-[#111111]/20 bg-[#111111]/5 p-6 text-center text-sm text-muted-foreground">
                          No admin records found for this institution.
                        </div>
                      )}
                    </div>
                    <div className="pt-1 text-xs text-muted-foreground">
                      Directory updates automatically when staff are added or updated.
                    </div>
                  </CardContent>
                </Card>
                )}
                </div>
              </div>

              
            </div>
          </div>
    </>
  )
}
