"use client"

import { useMemo, useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Save,
  User,
  SettingsIcon,
  DollarSign,
  Zap,
  BellRing,
  Clock3,
  ShieldAlert,
  SlidersHorizontal,
  Building2,
  Pencil,
  Search,
  Smartphone,
  CreditCard,
  Mail,
  Tags,
  LayoutGrid,
  Info,
  ChevronRight,
  X,
} from "lucide-react"

import { getSession, updateInstitutionConfig } from "@/lib/session"
import { useToast } from "@/components/ui/toast"

interface InstitutionConfig {
  modules: { loans: boolean; shares: boolean; savings: boolean; mobile_money: boolean }
  currency: string
  shareValue?: number
  minimumShares?: number
  maximumShares?: number
  membershipFee?: number
  maximumParallelLoans?: number
  loanLatePenalty?: number
  loanLatePenaltyPeriodDays?: number
  membershipLatePenalty?: number
  membershipLatePenaltyPeriodDays?: number
  membershipLatePenaltyPeriodUnit?: string
  loanLatePenaltyPeriodUnit?: string
  autoInvoices?: boolean
  invoicePeriodDays?: number
  defaultedAfterDays?: number
  savingsOverduePeriod?: number
  mtnMobileMoneyContact?: string
  airtelMobileMoneyContact?: string
}

interface InstitutionOrg {
  id: string
  name: string
  type: string
  license_number: string
  registration_number: string
  website: string
  logo: string
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
  const [workspaceSearch, setWorkspaceSearch] = useState("")
  const [workspaceCategory, setWorkspaceCategory] = useState<"All" | "Core" | "Profile">("All")
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
            license_number: o.license_number || "",
            registration_number: o.registration_number || "",
            website: o.website || "",
            logo: o.logo || "",
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
    if ((config.savingsOverduePeriod ?? 0) < 1) {
      toast({ title: "Validation", description: "Savings overdue period must be at least 1 day.", variant: "warning" })
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
  const workspaceItems: Array<{
    key: "general" | "loan" | "penalties" | "shares" | "organization" | "admin"
    title: string
    subtitle: string
    category: "Core" | "Profile"
    icon: any
    visible?: boolean
  }> = [
    { key: "general", title: "General", subtitle: "Currency, modules and membership", category: "Core", icon: SettingsIcon },
    { key: "loan", title: "Loan Policies", subtitle: "Loan and invoice behavior", category: "Core", icon: SlidersHorizontal },
    { key: "penalties", title: "Penalty Rules", subtitle: "Late penalties and periods", category: "Core", icon: ShieldAlert },
    { key: "shares", title: "Shares Workspace", subtitle: "Share limits and value setup", category: "Core", icon: DollarSign, visible: isSaccoOrMfi },
    { key: "organization", title: "Organization Profile", subtitle: "Legal and contact details", category: "Profile", icon: Building2 },
    { key: "admin", title: "Institution Admins", subtitle: "Admins and staff directory", category: "Profile", icon: User },
  ]

  const filteredWorkspaceItems = useMemo(() => {
    const term = workspaceSearch.trim().toLowerCase()
    return workspaceItems.filter((item) => {
      if (item.visible === false) return false
      if (workspaceCategory !== "All" && item.category !== workspaceCategory) return false
      if (!term) return true
      return item.title.toLowerCase().includes(term) || item.subtitle.toLowerCase().includes(term)
    })
  }, [workspaceItems, workspaceCategory, workspaceSearch])

  const groupedWorkspaceNav = useMemo(() => {
    const core = filteredWorkspaceItems.filter((i) => i.category === "Core")
    const profile = filteredWorkspaceItems.filter((i) => i.category === "Profile")
    return { core, profile }
  }, [filteredWorkspaceItems])

  const operationalSnapshot = useMemo(() => {
    if (!config) return null
    const mtn = (config.mtnMobileMoneyContact ?? "").trim()
    const airtel = (config.airtelMobileMoneyContact ?? "").trim()
    const wallets = (mtn ? 1 : 0) + (airtel ? 1 : 0)
    const mmOn = config.modules.mobile_money
    let mmStatus = "Inactive"
    let mmDetail = "Turn on Mobile Money in General, then add operator numbers."
    let mmPct = 12
    if (mmOn) {
      if (wallets === 2) {
        mmStatus = "Ready"
        mmDetail = "MTN + Airtel numbers on file"
        mmPct = 100
      } else if (wallets === 1) {
        mmStatus = "Partial"
        mmDetail = "Add the second operator number for full coverage"
        mmPct = 58
      } else {
        mmStatus = "Needs setup"
        mmDetail = "No mobile money numbers saved yet"
        mmPct = 32
      }
    }

    const adminRows = staffMembers.filter((s) => s.role === "institution_admin")
    const adminsWithEmail = adminRows.filter((s) => s.email && String(s.email).trim()).length
    const hasWebsite = !!(org?.website && String(org.website).trim())
    let emailStatus = "Limited"
    let emailDetail = "Add a website or ensure admins have email on file."
    let emailPct = 35
    if (hasWebsite && adminsWithEmail >= 1) {
      emailStatus = "Healthy"
      emailDetail = `${adminsWithEmail} admin email(s) · website linked`
      emailPct = 100
    } else if (hasWebsite || adminsWithEmail >= 1) {
      emailStatus = "OK"
      emailDetail = hasWebsite
        ? "Website set · complete admin emails for stronger reach"
        : `${adminsWithEmail} admin email(s) on file · add website in Organization`
      emailPct = 72
    }

    const moduleFlags = [
      config.modules.loans,
      config.modules.shares,
      config.modules.savings,
      config.modules.mobile_money,
    ]
    const moduleOn = moduleFlags.filter(Boolean).length
    const modulePct = Math.round((moduleOn / 4) * 100)

    return { mmStatus, mmDetail, mmPct, emailStatus, emailDetail, emailPct, moduleOn, modulePct }
  }, [config, org, staffMembers])

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
        <div className="flex min-h-[70vh] w-full items-center justify-center">
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
    if (org.website && !isValidUrl(org.website)) {
      toast({ title: "Validation", description: "Enter a valid website URL (include http/https)", variant: "warning" })
      return false
    }

    setIsSavingOrg(true)
    try {
      const res = await fetch("/api/institution/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_number: org.license_number,
          registration_number: org.registration_number,
          website: org.website,
          logo: org.logo,
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
      <div className="container mx-auto  py-4">
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#111111]/10 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 p-6 md:p-7">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-[#f08c2b]">INSTITUTION SETTINGS</p>
                    <h1 className="text-3xl font-bold tracking-tight text-[#111111]">Control Center</h1>
                    <p className="mt-1 text-muted-foreground">
                      Manage policies, automation, and organization profile for your {terminology.type.toLowerCase()}.
                    </p>
                  </div>
                  {operationalSnapshot && (
                    <div className="flex w-full max-w-full flex-wrap justify-start gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:justify-end">
                      <div className="w-[calc(50%-0.25rem)] min-w-30 shrink-0 rounded-lg border border-emerald-200/70 bg-linear-to-br from-emerald-50 to-emerald-100/40 p-2 shadow-sm backdrop-blur-sm sm:w-29">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <div className="rounded-md bg-emerald-500 p-1 shadow-sm">
                            <Smartphone className="h-3 w-3 text-white" />
                          </div>
                          <div
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.modules.mobile_money ? "animate-pulse bg-emerald-500" : "bg-emerald-300"}`}
                          />
                          <span className="truncate text-[11px] font-semibold leading-tight text-emerald-900">Mobile money</span>
                        </div>
                        <p className="truncate text-[10px] font-medium text-emerald-800">{operationalSnapshot.mmStatus}</p>
                        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-emerald-700/90">{operationalSnapshot.mmDetail}</p>
                        <div className="mt-1.5 h-0.5 w-full rounded-full bg-emerald-200/90">
                          <div
                            className={`h-0.5 rounded-full ${config.modules.mobile_money ? "bg-emerald-500" : "bg-emerald-400"}`}
                            style={{ width: `${operationalSnapshot.mmPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="w-[calc(50%-0.25rem)] min-w-30 shrink-0 rounded-lg border border-sky-200/70 bg-linear-to-br from-sky-50 to-sky-100/40 p-2 shadow-sm backdrop-blur-sm sm:w-29">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <div className="rounded-md bg-sky-500 p-1 shadow-sm">
                            <Mail className="h-3 w-3 text-white" />
                          </div>
                          <div
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${operationalSnapshot.emailPct >= 72 ? "animate-pulse bg-sky-500" : "bg-sky-300"}`}
                          />
                          <span className="truncate text-[11px] font-semibold leading-tight text-sky-900">Email</span>
                        </div>
                        <p className="truncate text-[10px] font-medium text-sky-800">{operationalSnapshot.emailStatus}</p>
                        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-sky-700/90">{operationalSnapshot.emailDetail}</p>
                        <div className="mt-1.5 h-0.5 w-full rounded-full bg-sky-200/90">
                          <div
                            className={`h-0.5 rounded-full bg-sky-500 ${operationalSnapshot.emailPct >= 72 ? "animate-pulse" : ""}`}
                            style={{ width: `${operationalSnapshot.emailPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="w-[calc(50%-0.25rem)] min-w-30 shrink-0 rounded-lg border border-[#111111]/12 bg-linear-to-br from-[#111111]/5 to-[#111111]/10 p-2 shadow-sm backdrop-blur-sm sm:w-29">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <div className="rounded-md bg-[#111111] p-1 shadow-sm">
                            <Tags className="h-3 w-3 text-white" />
                          </div>
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#111111]" />
                          <span className="truncate text-[11px] font-semibold leading-tight text-[#111111]">Modules</span>
                        </div>
                        <p className="text-[10px] font-medium text-[#111111]">
                          {operationalSnapshot.moduleOn}
                          <span className="text-[#111111]/55"> / 4</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[#111111]/55">Loans · Shares · Savings · MM</p>
                        <div className="mt-1.5 h-0.5 w-full rounded-full bg-[#111111]/12">
                          <div className="h-0.5 rounded-full bg-[#f08c2b]" style={{ width: `${operationalSnapshot.modulePct}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                <aside className="lg:col-span-3">
                  <div className="lg:sticky lg:top-4">
                    <div className="overflow-hidden rounded-2xl border border-[#111111]/10 bg-linear-to-b from-[#f08c2b]/[0.07] via-white to-white shadow-md">
                      <div className="h-1 bg-linear-to-r from-[#f08c2b] via-[#f08c2b]/70 to-[#111111]/25" />
                      <div className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                              <div className="shrink-0 rounded-xl bg-[#111111] p-2 shadow-sm">
                                <LayoutGrid className="h-4 w-4 text-white" aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c06107]">Workspace</p>
                                <p className="text-sm font-semibold leading-tight text-[#111111]">Navigate settings</p>
                              </div>
                            </div>
                            <p className="mt-2 pl-11 text-xs leading-snug text-muted-foreground">
                              Open a section, then use the pencil icon on the panel to edit and save.
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className="shrink-0 border border-[#111111]/10 bg-white/80 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#111111]"
                          >
                            {filteredWorkspaceItems.length}
                          </Badge>
                        </div>

                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={workspaceSearch}
                            onChange={(e) => setWorkspaceSearch(e.target.value)}
                            placeholder="Search sections…"
                            className="h-10 rounded-xl border-[#111111]/12 bg-white/90 pl-9 pr-3 text-sm shadow-sm backdrop-blur-sm transition-shadow focus-visible:ring-[#f08c2b]/30"
                            aria-label="Search settings sections"
                          />
                        </div>

                        <div
                          className="flex rounded-xl border border-[#111111]/10 bg-[#111111]/4 p-1"
                          role="tablist"
                          aria-label="Filter settings by category"
                        >
                          {(["All", "Core", "Profile"] as const).map((category) => {
                            const selected = workspaceCategory === category
                            return (
                              <button
                                key={category}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setWorkspaceCategory(category)}
                                className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold transition-all ${
                                  selected
                                    ? "bg-white text-[#111111] shadow-sm ring-1 ring-[#111111]/10"
                                    : "text-[#111111]/55 hover:bg-white/60 hover:text-[#111111]"
                                }`}
                              >
                                {category}
                              </button>
                            )
                          })}
                        </div>

                        <nav
                          className="max-h-[min(70vh,32rem)] space-y-5 overflow-y-auto overscroll-contain pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#111111]/20"
                          aria-label="Settings sections"
                        >
                          {filteredWorkspaceItems.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[#111111]/20 bg-white/60 px-3 py-8 text-center text-sm text-muted-foreground">
                              No sections match your search or filter.
                            </div>
                          ) : (
                            <>
                              {(workspaceCategory === "All" || workspaceCategory === "Core") && groupedWorkspaceNav.core.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Core configuration</p>
                                  <div className="space-y-1">
                                    {groupedWorkspaceNav.core.map((item) => {
                                      const Icon = item.icon
                                      const active = activeTab === item.key
                                      return (
                                        <button
                                          key={item.key}
                                          type="button"
                                          onClick={() => setActiveTab(item.key)}
                                          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                                            active
                                              ? "border-[#111111] bg-[#111111] text-white shadow-md ring-1 ring-[#f08c2b]/35"
                                              : "border-transparent bg-white/50 text-[#111111]/85 hover:border-[#111111]/10 hover:bg-white hover:shadow-sm"
                                          }`}
                                        >
                                          <span
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                              active ? "bg-white/15 text-white" : "bg-[#111111]/8 text-[#111111]"
                                            }`}
                                          >
                                            <Icon className="h-4 w-4" aria-hidden />
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">{item.title}</span>
                                            <span className={`mt-0.5 block truncate text-[11px] leading-snug ${active ? "text-white/75" : "text-muted-foreground"}`}>
                                              {item.subtitle}
                                            </span>
                                          </span>
                                          <ChevronRight
                                            className={`h-4 w-4 shrink-0 transition-transform ${active ? "text-white/80 translate-x-0" : "text-[#111111]/25 group-hover:translate-x-0.5 group-hover:text-[#f08c2b]"}`}
                                            aria-hidden
                                          />
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {(workspaceCategory === "All" || workspaceCategory === "Profile") && groupedWorkspaceNav.profile.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Organization</p>
                                  <div className="space-y-1">
                                    {groupedWorkspaceNav.profile.map((item) => {
                                      const Icon = item.icon
                                      const active = activeTab === item.key
                                      return (
                                        <button
                                          key={item.key}
                                          type="button"
                                          onClick={() => setActiveTab(item.key)}
                                          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                                            active
                                              ? "border-[#111111] bg-[#111111] text-white shadow-md ring-1 ring-[#f08c2b]/35"
                                              : "border-transparent bg-white/50 text-[#111111]/85 hover:border-[#111111]/10 hover:bg-white hover:shadow-sm"
                                          }`}
                                        >
                                          <span
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                              active ? "bg-white/15 text-white" : "bg-[#111111]/8 text-[#111111]"
                                            }`}
                                          >
                                            <Icon className="h-4 w-4" aria-hidden />
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">{item.title}</span>
                                            <span className={`mt-0.5 block truncate text-[11px] leading-snug ${active ? "text-white/75" : "text-muted-foreground"}`}>
                                              {item.subtitle}
                                            </span>
                                          </span>
                                          <ChevronRight
                                            className={`h-4 w-4 shrink-0 transition-transform ${active ? "text-white/80" : "text-[#111111]/25 group-hover:translate-x-0.5 group-hover:text-[#f08c2b]"}`}
                                            aria-hidden
                                          />
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </nav>

                        <div className="flex gap-2.5 rounded-xl border border-[#111111]/10 bg-[#111111]/4 p-3 text-xs leading-relaxed text-muted-foreground">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#f08c2b]" aria-hidden />
                          <span>Edits apply only after you save from the section panel (pencil icon).</span>
                        </div>
                      </div>
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
                    {activeTab === "general" && (
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

                    {activeTab === "general" && <Separator />}

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
                      <div className="space-y-2" />
                    </div>
                    )}

                    {activeTab === "general" && (
                      <div className="rounded-lg border border-[#111111]/10 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                          <SettingsIcon className="h-4 w-4 text-[#f08c2b]" />
                          Activation Dashboard
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { id: "moduleLoans", label: "Loans", hint: "Loan origination and repayment features", active: !!config.modules.loans, icon: Zap, type: "module" as const, key: "loans" as const },
                            { id: "moduleMobileMoney", label: "Mobile Money", hint: "Airtel/MTN payment collection and disbursement", active: !!config.modules.mobile_money, icon: Smartphone, type: "module" as const, key: "mobile_money" as const },
                            { id: "moduleSavings", label: "Savings", hint: "Savings accounts and savings compliance rules", active: !!config.modules.savings, icon: BellRing, type: "module" as const, key: "savings" as const },
                            { id: "moduleShares", label: "Shares", hint: "Member shares and share capital controls", active: !!config.modules.shares, icon: DollarSign, type: "module" as const, key: "shares" as const },
                            { id: "moduleAutoInvoices", label: "Auto Invoices", hint: "Automated invoice generation for due payments", active: !!config.autoInvoices, icon: CreditCard, type: "flag" as const, key: "autoInvoices" as const },
                          ].map((item) => {
                            const Icon = item.icon
                            const disabled = !canEditInstitutionWorkspace("general") || (item.key === "shares" && !isSaccoOrMfi)
                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl border p-4 transition-all ${
                                  item.active
                                    ? "border-[#f08c2b]/40 bg-[#f08c2b]/5"
                                    : "border-[#111111]/10 bg-white"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`mt-0.5 rounded-lg p-2 ${
                                        item.active ? "bg-[#f08c2b] text-white" : "bg-[#111111]/10 text-[#111111]"
                                      }`}
                                    >
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-[#111111]">{item.label}</p>
                                      <p className="text-xs text-muted-foreground mt-1">{item.hint}</p>
                                      <p className={`text-xs mt-2 font-medium ${item.active ? "text-emerald-700" : "text-rose-700"}`}>
                                        {item.active ? "Active" : "Inactive"}
                                      </p>
                                    </div>
                                  </div>
                                  <label htmlFor={item.id} className="relative inline-flex cursor-pointer">
                                    <input
                                      id={item.id}
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={item.active}
                                      disabled={disabled}
                                      onChange={(e) => {
                                        if (item.type === "module") setModule(item.key, e.target.checked)
                                        else setConfigField("autoInvoices", e.target.checked)
                                      }}
                                    />
                                    <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#f08c2b]" />
                                    <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                                  </label>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {!isSaccoOrMfi && (
                          <div className="text-xs text-muted-foreground rounded-lg border border-dashed border-[#111111]/20 px-3 py-2">
                            Shares is only configurable for SACCO and MFI institutions.
                          </div>
                        )}
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
                          <Label htmlFor="savingsOverduePeriod">Savings Overdue Period (days)</Label>
                          <Input
                            id="savingsOverduePeriod"
                            type="number"
                            min={1}
                            value={Number(config.savingsOverduePeriod ?? 30)}
                            onChange={(e) => setConfigField("savingsOverduePeriod", Number.parseInt(e.target.value || "30"))}
                            disabled={!canEditInstitutionWorkspace("loan")}
                            className={memberInputClass}
                          />
                        </div>
                        <div className="rounded-md border border-[#111111]/10 bg-[#111111]/5 px-3 py-2 md:col-span-2">
                          <p className="text-xs text-muted-foreground">
                            Auto invoices are now managed in <span className="font-medium text-[#111111]">General - Activation Dashboard</span>.
                          </p>
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
                          <Label htmlFor="loanLatePenaltyPeriodUnit">Loan Penalty Period Unit</Label>
                          <Select
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            value={config.loanLatePenaltyPeriodUnit || "day"}
                            onValueChange={(value) => setConfigField("loanLatePenaltyPeriodUnit", value)}
                          >
                            <SelectTrigger className={memberSelectClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="day">Day</SelectItem>
                              <SelectItem value="week">Week</SelectItem>
                              <SelectItem value="month">Month</SelectItem>
                            </SelectContent>
                          </Select>
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
                        <div className="space-y-2">
                          <Label htmlFor="membershipLatePenaltyPeriodUnit">Membership Penalty Period Unit</Label>
                          <Select
                            disabled={!canEditInstitutionWorkspace("penalties")}
                            value={config.membershipLatePenaltyPeriodUnit || "day"}
                            onValueChange={(value) => setConfigField("membershipLatePenaltyPeriodUnit", value)}
                          >
                            <SelectTrigger className={memberSelectClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="day">Day</SelectItem>
                              <SelectItem value="week">Week</SelectItem>
                              <SelectItem value="month">Month</SelectItem>
                            </SelectContent>
                          </Select>
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

                    {(activeTab === "shares" && isSaccoOrMfi && !config.modules.shares) && (
                      <div className="rounded-lg border border-dashed border-[#111111]/20 bg-[#111111]/5 p-4 text-sm text-muted-foreground">
                        Shares module is currently disabled. Enable it in <strong>General - Module Access</strong> to configure share limits and values.
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
                            <Label htmlFor="maxShares">Maximum Number of Shares</Label>
                            <Input
                              id="maxShares"
                              type="number"
                              min={0}
                              value={Number(config.maximumShares ?? 0)}
                              onChange={(e) => setConfigField("maximumShares", Number.parseInt(e.target.value || "0"))}
                              disabled={!canEditInstitutionWorkspace("shares")}
                              className={memberInputClass}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
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
                          <div className="space-y-2">
                            <Label htmlFor="sharesHint">Shares Config Hint</Label>
                            <div id="sharesHint" className="h-10 px-3 rounded-md border border-[#111111]/10 bg-[#111111]/5 text-sm flex items-center text-muted-foreground">
                              Max shares can be left as 0 if you do not cap purchases.
                            </div>
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

                    {activeTab === "general" && (
                      <div className="rounded-lg border border-[#111111]/10 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                          <Zap className="h-4 w-4 text-[#f08c2b]" />
                          Mobile Money Contacts
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="mtnMobileMoneyContact">MTN Mobile Money Contact</Label>
                            <Input
                              id="mtnMobileMoneyContact"
                              value={config.mtnMobileMoneyContact || ""}
                              onChange={(e) => setConfigField("mtnMobileMoneyContact", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              className={memberInputClass}
                              placeholder="e.g. +2567XXXXXXXX"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="airtelMobileMoneyContact">Airtel Money Contact</Label>
                            <Input
                              id="airtelMobileMoneyContact"
                              value={config.airtelMobileMoneyContact || ""}
                              onChange={(e) => setConfigField("airtelMobileMoneyContact", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              className={memberInputClass}
                              placeholder="e.g. +2567XXXXXXXX"
                            />
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

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input id="website" value={org?.website || ""} onChange={(e) => setOrgField("website", e.target.value)} disabled={!isOrgEditMode} placeholder="https://example.com" className={memberInputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="logo">Logo Link</Label>
                        <Input id="logo" value={org?.logo || ""} onChange={(e) => setOrgField("logo", e.target.value)} disabled={!isOrgEditMode} placeholder="https://example.com/logo.png" className={memberInputClass} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2" />
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
