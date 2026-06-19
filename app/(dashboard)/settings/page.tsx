"use client"

import { useMemo, useRef, useState, useEffect, type ChangeEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import StyledSelect from "@/components/newUI/styled_select"
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
  Image as ImageIcon,
  Upload,
  LayoutGrid,
  Info,
  ChevronRight,
  X,
  Shield,
} from "lucide-react"

import { getSession, updateInstitutionConfig } from "@/lib/session"
import { DEFAULT_CURRENCY_IN_WORDS } from "@/lib/invoices/utils"
import { useToast } from "@/components/ui/toast"
import { useStaffSession } from "@/components/staff-session-provider"
import { upload } from "@vercel/blob/client"

interface InstitutionConfig {
  modules: { loans: boolean; shares: boolean; savings: boolean; mobile_money: boolean }
  currency: string
  currencyInWords?: string
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

/** Current staff branch (`branches`): name, address, phone, email, established_date */
interface BranchProfile {
  id: string
  name: string
  address: string
  phone_number: string
  email: string
  established_date: string
  branch_code: string
  status: string
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

type RolePermissionsRow = { id: string; name: string; description: string | null }
type RolePermissionCatalogRow = { id: string; name: string; module: string }
type RolePermissionsPayload = {
  branch: { id: string; name: string }
  roles: RolePermissionsRow[]
  permissions: RolePermissionCatalogRow[]
  rolePermissionIds: Record<string, string[]>
  actorIsSuperAdmin?: boolean
}

type SettingsPermissions = {
  editInstitutionSettings: boolean
  editInstitutionInfo: boolean
  editBranchInfo: boolean
  editRolePermissions: boolean
}

const CURRENCY_IN_WORDS_PRESETS: Record<string, string> = {
  UGX: "Ugandan shillings only",
  USD: "US dollars only",
  KES: "Kenyan shillings only",
  TZS: "Tanzanian shillings only",
}

export default function SettingsPage() {
  const { toast } = useToast()
  const { refresh: refreshStaffSession } = useStaffSession()
  const [session, setSession] = useState<any>(null)
  const [institution, setInstitution] = useState<{ id: string; name: string; type: string } | null>(null)
  const [config, setConfig] = useState<InstitutionConfig | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])

  const [isSavingInstitution, setIsSavingInstitution] = useState(false)
  const [isSavingOrg, setIsSavingOrg] = useState(false)
  const [org, setOrg] = useState<InstitutionOrg | null>(null)
  const [branchProfile, setBranchProfile] = useState<BranchProfile | null>(null)
  const [branchProfileDraftBackup, setBranchProfileDraftBackup] = useState<BranchProfile | null>(null)
  /** Branch snapshot when opening the dedicated Organization Profile tab editor */
  const [branchProfileOrgTabBackup, setBranchProfileOrgTabBackup] = useState<BranchProfile | null>(null)
  const [isOrgEditMode, setIsOrgEditMode] = useState(false)
  const [orgDraftBackup, setOrgDraftBackup] = useState<InstitutionOrg | null>(null)
  const [activeTab, setActiveTab] = useState<
    "general" | "loan" | "penalties" | "shares" | "organization" | "admin" | "permissions"
  >("general")
  const [rolePermPayload, setRolePermPayload] = useState<RolePermissionsPayload | null>(null)
  const [rolePermLoading, setRolePermLoading] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [draftRolePermissionIds, setDraftRolePermissionIds] = useState<string[]>([])
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false)
  const [settingsPermissions, setSettingsPermissions] = useState<SettingsPermissions>({
    editInstitutionSettings: false,
    editInstitutionInfo: false,
    editBranchInfo: false,
    editRolePermissions: false,
  })
  const selectedRoleIdRef = useRef("")
  const [workspaceSearch, setWorkspaceSearch] = useState("")
  const [workspaceCategory, setWorkspaceCategory] = useState<"All" | "Core" | "Profile">("All")
  const [institutionEditWorkspace, setInstitutionEditWorkspace] = useState<InstitutionSettingsWorkspace | null>(null)
  const [institutionConfigDraftBackup, setInstitutionConfigDraftBackup] = useState<InstitutionConfig | null>(null)
  const generalLogoInputRef = useRef<HTMLInputElement | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  type EmailSettingsForm = {
    provider: string
    fromEmail: string
    replyToEmail: string
    domain: string
    apiKey: string
    smtpHost: string
    smtpPort: string
    smtpUsername: string
    smtpPassword: string
    isActive: boolean
    hasApiKey: boolean
    apiKeyMasked: string | null
    hasSmtpPassword: boolean
  }
  const [emailSettings, setEmailSettings] = useState<EmailSettingsForm>({
    provider: "mailgun",
    fromEmail: "",
    replyToEmail: "",
    domain: "",
    apiKey: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUsername: "",
    smtpPassword: "",
    isActive: false,
    hasApiKey: false,
    apiKeyMasked: null,
    hasSmtpPassword: false,
  })
  const [isSavingEmailSettings, setIsSavingEmailSettings] = useState(false)
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false)
  const memberInputClass =
    "h-10 rounded-md border-gray-300 text-sm transition-all duration-200 hover:border-gray-400 focus-visible:ring-[1.5px] focus-visible:ring-[#f08c2b] focus-visible:border-transparent"
  const memberSelectClass =
    "h-10 rounded-md border-gray-300 text-sm transition-all duration-200 hover:border-gray-400 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent"

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    ;(async () => {
      try {
        const [instRes, orgRes, staffRes, branchRes, settingsPermRes, emailSettingsRes] = await Promise.all([
          fetch("/api/institution/settings", { cache: "no-store" }),
          fetch("/api/institution/organization", { cache: "no-store" }),
          fetch("/api/institution/staff?limit=200", { cache: "no-store" }),
          fetch("/api/institution/branch", { cache: "no-store" }),
          fetch("/api/institution/settings/permissions", { cache: "no-store" }),
          fetch("/api/institution/email-settings", { cache: "no-store" }),
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
        if (branchRes.ok) {
          const b = await branchRes.json()
          if (b?.id) {
            setBranchProfile({
              id: String(b.id),
              name: String(b.name || ""),
              address: String(b.address || ""),
              phone_number: String(b.phone_number || ""),
              email: String(b.email || ""),
              established_date: typeof b.established_date === "string" ? b.established_date : "",
              branch_code: String(b.branch_code || ""),
              status: String(b.status || ""),
            })
          }
        }
        if (settingsPermRes.ok) {
          const permsData = await settingsPermRes.json().catch(() => ({}))
          setSettingsPermissions({
            editInstitutionSettings: !!permsData?.permissions?.editInstitutionSettings,
            editInstitutionInfo: !!permsData?.permissions?.editInstitutionInfo,
            editBranchInfo: !!permsData?.permissions?.editBranchInfo,
            editRolePermissions: !!permsData?.permissions?.editRolePermissions,
          })
        }
        if (emailSettingsRes.ok) {
          const emailData = await emailSettingsRes.json().catch(() => ({}))
          const s = emailData?.settings
          if (s) {
            setEmailSettings({
              provider: String(s.provider || "mailgun"),
              fromEmail: String(s.fromEmail || ""),
              replyToEmail: String(s.replyToEmail || ""),
              domain: String(s.domain || ""),
              apiKey: "",
              smtpHost: String(s.smtpHost || ""),
              smtpPort: s.smtpPort != null ? String(s.smtpPort) : "587",
              smtpUsername: String(s.smtpUsername || ""),
              smtpPassword: "",
              isActive: Boolean(s.isActive),
              hasApiKey: Boolean(s.hasApiKey),
              apiKeyMasked: s.apiKeyMasked ? String(s.apiKeyMasked) : null,
              hasSmtpPassword: Boolean(s.hasSmtpPassword),
            })
          }
        }
      } catch (_) {
        // swallow
      }
    })()
  }, [])

  useEffect(() => {
    selectedRoleIdRef.current = selectedRoleId
  }, [selectedRoleId])

  useEffect(() => {
    if (activeTab !== "permissions") return

    let cancelled = false
    ;(async () => {
      setRolePermLoading(true)
      try {
        const res = await fetch("/api/institution/role-permissions", { cache: "no-store" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) {
            toast({
              title: "Unable to load roles",
              description: typeof body?.error === "string" ? body.error : "Request failed",
              variant: "destructive",
            })
          }
          return
        }
        const data = (await res.json()) as RolePermissionsPayload
        if (cancelled) return
        setRolePermPayload(data)
        const roles = data.roles || []
        const preferred = selectedRoleIdRef.current
        const nextId = roles.some((r) => r.id === preferred) ? preferred : roles[0]?.id || ""
        setSelectedRoleId(nextId)
        setDraftRolePermissionIds([...(data.rolePermissionIds[nextId] || [])])
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Request failed"
          toast({ title: "Unable to load roles", description: message, variant: "destructive" })
        }
      } finally {
        if (!cancelled) setRolePermLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTab, toast])

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
    const currencyInWords = String(config.currencyInWords || "").trim()
    if (!currencyInWords) {
      toast({
        title: "Validation",
        description: `Currency in words is required (e.g. "${DEFAULT_CURRENCY_IN_WORDS}").`,
        variant: "warning",
      })
      return false
    }
    if (currencyInWords.length > 250) {
      toast({ title: "Validation", description: "Currency in words must be 250 characters or fewer.", variant: "warning" })
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
        const body = await a.json().catch(() => ({} as Record<string, unknown>))
        const error = String(body?.error || "")
        if (error === "currency_inwords_invalid") {
          throw new Error("Currency in words is required and must be 250 characters or fewer.")
        }
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

  const handleSaveEmailSettings = async () => {
    if (!emailSettings.fromEmail.trim() && emailSettings.isActive) {
      toast({ title: "Validation", description: "From email is required when email delivery is active.", variant: "warning" })
      return
    }
    if (emailSettings.provider === "mailgun" && !emailSettings.domain.trim() && emailSettings.isActive) {
      toast({ title: "Validation", description: "Mailgun domain is required when email delivery is active.", variant: "warning" })
      return
    }
    if (
      emailSettings.provider === "mailgun" &&
      !emailSettings.hasApiKey &&
      !emailSettings.apiKey.trim() &&
      emailSettings.isActive
    ) {
      toast({ title: "Validation", description: "API key is required when email delivery is active.", variant: "warning" })
      return
    }
    if (emailSettings.provider === "smtp" && !emailSettings.smtpHost.trim() && emailSettings.isActive) {
      toast({ title: "Validation", description: "SMTP host is required when email delivery is active.", variant: "warning" })
      return
    }
    if (emailSettings.provider === "smtp" && !emailSettings.smtpPort.trim() && emailSettings.isActive) {
      toast({ title: "Validation", description: "SMTP port is required when email delivery is active.", variant: "warning" })
      return
    }

    setIsSavingEmailSettings(true)
    try {
      const res = await fetch("/api/institution/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: emailSettings.provider,
          fromEmail: emailSettings.fromEmail.trim() || null,
          replyToEmail: emailSettings.replyToEmail.trim() || null,
          domain: emailSettings.domain.trim() || null,
          apiKey: emailSettings.apiKey.trim() || null,
          smtpHost: emailSettings.smtpHost.trim() || null,
          smtpPort: emailSettings.smtpPort.trim() ? Number(emailSettings.smtpPort) : null,
          smtpUsername: emailSettings.smtpUsername.trim() || null,
          smtpPassword: emailSettings.smtpPassword.trim() || null,
          isActive: emailSettings.isActive,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(data?.error || "Failed to save email settings"))
      }
      const s = data?.settings
      if (s) {
        setEmailSettings((prev) => ({
          ...prev,
          provider: String(s.provider || prev.provider),
          fromEmail: String(s.fromEmail || ""),
          replyToEmail: String(s.replyToEmail || ""),
          domain: String(s.domain || ""),
          apiKey: "",
          smtpHost: String(s.smtpHost || ""),
          smtpPort: s.smtpPort != null ? String(s.smtpPort) : prev.smtpPort,
          smtpUsername: String(s.smtpUsername || ""),
          smtpPassword: "",
          isActive: Boolean(s.isActive),
          hasApiKey: Boolean(s.hasApiKey),
          apiKeyMasked: s.apiKeyMasked ? String(s.apiKeyMasked) : null,
          hasSmtpPassword: Boolean(s.hasSmtpPassword),
        }))
      }
      toast({ title: "Saved", description: "Email delivery settings updated.", variant: "success" })
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save email settings",
        variant: "destructive",
      })
    } finally {
      setIsSavingEmailSettings(false)
    }
  }

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true)
    try {
      const res = await fetch("/api/institution/email-settings/test", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(data?.error || "Failed to queue test email"))
      }
      toast({
        title: "Test email queued",
        description: `A test message was queued for ${String(data?.to || "your staff email")}. Ensure workers are running.`,
        variant: "success",
      })
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to send test email",
        variant: "destructive",
      })
    } finally {
      setIsSendingTestEmail(false)
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
  const tabMeta: Record<
    "general" | "loan" | "penalties" | "shares" | "organization" | "admin" | "permissions",
    { title: string; subtitle: string }
  > = {
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
    permissions: {
      title: "Roles & Permissions",
      subtitle: "Choose a branch role and assign capabilities for your location.",
    },
  }
  const isSaccoOrMfi = institution?.type === "SACCO" || institution?.type === "MFI"
  const canEditInstitutionConfig = settingsPermissions.editInstitutionSettings
  const canEditOrganizationProfile = settingsPermissions.editInstitutionInfo && settingsPermissions.editBranchInfo
  const canEditTab = (tab: "general" | "loan" | "penalties" | "shares" | "organization" | "permissions"): boolean => {
    if (tab === "organization") return canEditOrganizationProfile
    if (tab === "permissions") return settingsPermissions.editRolePermissions
    return canEditInstitutionConfig
  }
  const workspaceItems: Array<{
    key: "general" | "loan" | "penalties" | "shares" | "organization" | "admin" | "permissions"
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
    { key: "organization", title: "Organization Profile", subtitle: "Legal and contact details", category: "Profile", icon: Building2, visible: false },
    { key: "admin", title: "Institution Admins", subtitle: "Admins and staff directory", category: "Profile", icon: User },
    {
      key: "permissions",
      title: "Roles & Permissions",
      subtitle: "Branch access, roles, and permission catalog",
      category: "Core",
      icon: Shield,
      visible: settingsPermissions.editRolePermissions,
    },
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
    const mmOn = config.modules.mobile_money
    const mmStatus = mmOn ? "Active" : "Inactive"
    const mmDetail = mmOn ? "Mobile Money module enabled" : "Turn on Mobile Money in General settings."
    const mmPct = mmOn ? 100 : 12

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

  const rolePermissionsByModule = useMemo(() => {
    if (!rolePermPayload?.permissions?.length) return [] as Array<[string, RolePermissionCatalogRow[]]>
    const map = new Map<string, RolePermissionCatalogRow[]>()
    for (const p of rolePermPayload.permissions) {
      const mod = (p.module || "other").trim() || "other"
      if (!map.has(mod)) map.set(mod, [])
      map.get(mod)!.push(p)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rolePermPayload])

  const rolePermDirty = useMemo(() => {
    if (!rolePermPayload || !selectedRoleId) return false
    const saved = [...(rolePermPayload.rolePermissionIds[selectedRoleId] || [])].sort()
    const draft = [...draftRolePermissionIds].sort()
    if (saved.length !== draft.length) return true
    return saved.some((id, i) => id !== draft[i])
  }, [rolePermPayload, selectedRoleId, draftRolePermissionIds])

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

  const handleGeneralLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "warning" })
      return
    }
    if (!institution?.id) {
      toast({ title: "Missing institution", description: "Cannot upload logo without institution context.", variant: "destructive" })
      return
    }
    try {
      setIsLogoUploading(true)
      const name = `institution-logos/${institution.id}/logo-${Date.now()}-${file.name}`
      const blobResult = await upload(name, file, {
        handleUploadUrl: "/api/vercel_blob/upload",
        access: "public",
        contentType: file.type,
      })
      if (!blobResult?.url) throw new Error("Upload completed but no URL was returned")
      setOrgField("logo", blobResult.url)
      toast({ title: "Logo uploaded", description: "Logo uploaded to Blob. Save General to persist in database.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Failed to upload logo", variant: "destructive" })
    } finally {
      setIsLogoUploading(false)
      event.target.value = ""
    }
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

  const formatPermissionLabel = (name: string) =>
    name.replaceAll("_", " ").replace(/\b\w/g, (c) => String(c).toUpperCase())

  const selectedRoleForPerms = rolePermPayload?.roles?.find((r) => r.id === selectedRoleId)
  const isAdminBranchRole = selectedRoleForPerms?.name === "Admin"
  const actorIsSuperForPerms = !!rolePermPayload?.actorIsSuperAdmin

  const isPermissionLockedForRole = (perm: RolePermissionCatalogRow) =>
    perm.name === "edit_role_permissions" && isAdminBranchRole && !actorIsSuperForPerms

  const handleToggleRolePermission = (perm: RolePermissionCatalogRow) => {
    if (isPermissionLockedForRole(perm)) return
    const pid = perm.id
    setDraftRolePermissionIds((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]))
  }

  const handleRolePermissionRoleChange = (id: string) => {
    setSelectedRoleId(id)
    setDraftRolePermissionIds([...(rolePermPayload?.rolePermissionIds[id] || [])])
  }

  const handleSaveRolePermissions = async () => {
    if (!settingsPermissions.editRolePermissions) {
      toast({ title: "Access denied", description: "You do not have permission to edit role permissions.", variant: "warning" })
      return
    }
    if (!selectedRoleId || rolePermLoading || isSavingRolePermissions) return
    setIsSavingRolePermissions(true)
    try {
      const res = await fetch("/api/institution/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRoleId, permissionIds: draftRolePermissionIds }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Save failed")
      const nextIds = Array.isArray(body.permissionIds) ? (body.permissionIds as string[]) : draftRolePermissionIds
      setRolePermPayload((prev) =>
        prev ? { ...prev, rolePermissionIds: { ...prev.rolePermissionIds, [selectedRoleId]: nextIds } } : prev,
      )
      setDraftRolePermissionIds(nextIds)
      toast({ title: "Saved", description: "Role permissions updated for this branch.", variant: "success" })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Save failed"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setIsSavingRolePermissions(false)
    }
  }

  const getActiveInstitutionWorkspace = (): InstitutionSettingsWorkspace | null => {
    if (activeTab === "general" || activeTab === "loan" || activeTab === "penalties" || activeTab === "shares") return activeTab
    return null
  }

  const canEditInstitutionWorkspace = (workspace: InstitutionSettingsWorkspace): boolean =>
    institutionEditWorkspace === workspace && canEditTab(workspace)

  const handleStartInstitutionEdit = () => {
    if (!config) return
    const workspace = getActiveInstitutionWorkspace()
    if (!workspace) return
    if (!canEditTab(workspace)) {
      toast({ title: "Access denied", description: "You do not have permission to edit this settings section.", variant: "warning" })
      return
    }
    setInstitutionConfigDraftBackup(cloneConfig(config))
    if (branchProfile) setBranchProfileDraftBackup(JSON.parse(JSON.stringify(branchProfile)) as BranchProfile)
    setInstitutionEditWorkspace(workspace)
  }

  const handleCancelInstitutionEdit = () => {
    if (institutionConfigDraftBackup) setConfig(cloneConfig(institutionConfigDraftBackup))
    if (branchProfileDraftBackup) {
      setBranchProfile(JSON.parse(JSON.stringify(branchProfileDraftBackup)) as BranchProfile)
      setBranchProfileDraftBackup(null)
    }
    setInstitutionEditWorkspace(null)
  }

  const handleSaveInstitutionEdit = async () => {
    let ok = await handleSaveInstitution()
    if (ok && activeTab === "general") {
      if (settingsPermissions.editInstitutionInfo && org) ok = await handleSaveOrg()
      if (ok && settingsPermissions.editBranchInfo && branchProfile) ok = await handleSaveBranch()
    }
    if (ok) {
      setInstitutionEditWorkspace(null)
      setBranchProfileDraftBackup(null)
    }
  }

  const cloneOrg = (value: InstitutionOrg): InstitutionOrg => JSON.parse(JSON.stringify(value))

  const setBranchField = (field: keyof BranchProfile, value: string) => {
    setBranchProfile((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSaveBranch = async (): Promise<boolean> => {
    if (!branchProfile) return true
    if (!branchProfile.name.trim()) {
      toast({ title: "Validation", description: "Branch name is required.", variant: "warning" })
      return false
    }
    if (branchProfile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branchProfile.email.trim())) {
      toast({ title: "Validation", description: "Enter a valid branch email address.", variant: "warning" })
      return false
    }
    try {
      const res = await fetch("/api/institution/branch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: branchProfile.name.trim(),
          address: branchProfile.address.trim(),
          phone_number: branchProfile.phone_number.trim(),
          email: branchProfile.email.trim(),
          established_date: branchProfile.established_date.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save branch profile")
      setBranchProfile({
        id: String(data.id),
        name: String(data.name || ""),
        address: String(data.address || ""),
        phone_number: String(data.phone_number || ""),
        email: String(data.email || ""),
        established_date: typeof data.established_date === "string" ? data.established_date : "",
        branch_code: String(data.branch_code || ""),
        status: String(data.status || ""),
      })
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save branch profile"
      toast({ title: "Error", description: message, variant: "destructive" })
      return false
    }
  }

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
      void refreshStaffSession()
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
    if (!canEditOrganizationProfile) {
      toast({ title: "Access denied", description: "You do not have permission to edit organization profile.", variant: "warning" })
      return
    }
    setOrgDraftBackup(cloneOrg(org))
    if (branchProfile) setBranchProfileOrgTabBackup(JSON.parse(JSON.stringify(branchProfile)) as BranchProfile)
    setIsOrgEditMode(true)
  }

  const handleCancelOrgEdit = () => {
    if (orgDraftBackup) setOrg(cloneOrg(orgDraftBackup))
    if (branchProfileOrgTabBackup) {
      setBranchProfile(JSON.parse(JSON.stringify(branchProfileOrgTabBackup)) as BranchProfile)
      setBranchProfileOrgTabBackup(null)
    }
    setIsOrgEditMode(false)
  }

  const handleSaveOrgEdit = async () => {
    if (!canEditOrganizationProfile) {
      toast({ title: "Access denied", description: "You do not have permission to edit organization profile.", variant: "warning" })
      return
    }
    let ok = await handleSaveOrg()
    if (ok && branchProfile) ok = await handleSaveBranch()
    if (ok) {
      setIsOrgEditMode(false)
      setBranchProfileOrgTabBackup(null)
    }
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
                            disabled={!canEditTab(activeTab as "general" | "loan" | "penalties" | "shares")}
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
                    {activeTab === "general" && institution && (
                      <div className="rounded-lg border border-[#111111]/10 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                          <Building2 className="h-4 w-4 text-[#f08c2b]" />
                          Organization Profile
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{terminology.name} Name</Label>
                            <Input value={institution.name} readOnly className={memberInputClass} />
                          </div>
                          <div className="space-y-2">
                            <Label>Institution Type</Label>
                            <Input value={institution.type} readOnly className={memberInputClass} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="currency">Preferred Currency</Label>
                            <Select
                              disabled={!canEditInstitutionWorkspace("general")}
                              value={config.currency}
                              onValueChange={(value) => {
                                setConfig((prev) => {
                                  if (!prev) return prev
                                  const preset = CURRENCY_IN_WORDS_PRESETS[value]
                                  const currentInWords = String(prev.currencyInWords || "").trim()
                                  const previousPreset = CURRENCY_IN_WORDS_PRESETS[prev.currency]
                                  const shouldApplyPreset =
                                    !currentInWords ||
                                    currentInWords === previousPreset ||
                                    currentInWords === DEFAULT_CURRENCY_IN_WORDS
                                  return {
                                    ...prev,
                                    currency: value,
                                    ...(preset && shouldApplyPreset ? { currencyInWords: preset } : {}),
                                  }
                                })
                              }}
                            >
                              <SelectTrigger id="currency" className={memberSelectClass}>
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
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="currencyInWords">Currency in Words</Label>
                            <Input
                              id="currencyInWords"
                              value={config.currencyInWords || ""}
                              onChange={(e) => setConfigField("currencyInWords", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              placeholder={DEFAULT_CURRENCY_IN_WORDS}
                              maxLength={250}
                              className={memberInputClass}
                            />
                            <p className="text-xs text-muted-foreground">
                              Suffix used on invoices after the amount, e.g. &quot;Five thousand {config.currencyInWords || DEFAULT_CURRENCY_IN_WORDS}&quot;.
                            </p>
                          </div>
                          <div className="md:col-span-2 pt-1">
                            <Separator className="my-3" />
                          </div>
                          <div className="md:col-span-2 space-y-3 rounded-lg border border-[#111111]/10 bg-[#111111]/[0.02] p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                              <Mail className="h-4 w-4 text-[#f08c2b]" />
                              Email delivery
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Sends member emails (welcome, fees, shares, opening balances). Requires Redis workers (`npm run workers`).
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="emailProvider">Provider</Label>
                                <Select
                                  value={emailSettings.provider}
                                  onValueChange={(v) => setEmailSettings((p) => ({ ...p, provider: v }))}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                >
                                  <SelectTrigger id="emailProvider" className={memberSelectClass}>
                                    <SelectValue placeholder="Select provider" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mailgun">Mailgun</SelectItem>
                                    <SelectItem value="smtp">SMTP</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="emailFrom">From email</Label>
                                <Input
                                  id="emailFrom"
                                  type="email"
                                  value={emailSettings.fromEmail}
                                  onChange={(e) => setEmailSettings((p) => ({ ...p, fromEmail: e.target.value }))}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  placeholder="noreply@yourdomain.com"
                                  className={memberInputClass}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="emailReplyTo">Reply-to email</Label>
                                <Input
                                  id="emailReplyTo"
                                  type="email"
                                  value={emailSettings.replyToEmail}
                                  onChange={(e) => setEmailSettings((p) => ({ ...p, replyToEmail: e.target.value }))}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  placeholder="support@yourdomain.com"
                                  className={memberInputClass}
                                />
                              </div>
                              {emailSettings.provider === "mailgun" ? (
                                <>
                                  <div className="space-y-2">
                                    <Label htmlFor="emailDomain">Mailgun domain</Label>
                                    <Input
                                      id="emailDomain"
                                      value={emailSettings.domain}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, domain: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder="mg.yourdomain.com"
                                      className={memberInputClass}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="emailApiKey">API key</Label>
                                    <Input
                                      id="emailApiKey"
                                      type="password"
                                      value={emailSettings.apiKey}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, apiKey: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder={emailSettings.hasApiKey ? `Saved (${emailSettings.apiKeyMasked || "••••"}) — leave blank to keep` : "key-xxxxxxxx"}
                                      className={memberInputClass}
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-2">
                                    <Label htmlFor="smtpHost">SMTP host</Label>
                                    <Input
                                      id="smtpHost"
                                      value={emailSettings.smtpHost}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, smtpHost: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder="smtp.example.com"
                                      className={memberInputClass}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="smtpPort">SMTP port</Label>
                                    <Input
                                      id="smtpPort"
                                      type="number"
                                      value={emailSettings.smtpPort}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, smtpPort: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder="587"
                                      className={memberInputClass}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="smtpUsername">SMTP username</Label>
                                    <Input
                                      id="smtpUsername"
                                      value={emailSettings.smtpUsername}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, smtpUsername: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder="optional"
                                      className={memberInputClass}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="smtpPassword">SMTP password</Label>
                                    <Input
                                      id="smtpPassword"
                                      type="password"
                                      value={emailSettings.smtpPassword}
                                      onChange={(e) => setEmailSettings((p) => ({ ...p, smtpPassword: e.target.value }))}
                                      disabled={!canEditInstitutionWorkspace("general")}
                                      placeholder={emailSettings.hasSmtpPassword ? "Saved — leave blank to keep" : "optional"}
                                      className={memberInputClass}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={emailSettings.isActive}
                                disabled={!canEditInstitutionWorkspace("general")}
                                onChange={(e) => setEmailSettings((p) => ({ ...p, isActive: e.target.checked }))}
                              />
                              Enable email delivery for this branch
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canEditInstitutionWorkspace("general") || isSavingEmailSettings}
                                onClick={() => void handleSaveEmailSettings()}
                              >
                                {isSavingEmailSettings ? "Saving..." : "Save email settings"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={!canEditInstitutionWorkspace("general") || isSendingTestEmail}
                                onClick={() => void handleSendTestEmail()}
                              >
                                {isSendingTestEmail ? "Queuing..." : "Send test email"}
                              </Button>
                            </div>
                          </div>
                          {org && (
                          <>
                          <div className="md:col-span-2 pt-1">
                            <Separator className="my-3" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="generalRegNo">Registration Number</Label>
                            <Input
                              id="generalRegNo"
                              value={org.registration_number || ""}
                              onChange={(e) => setOrgField("registration_number", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="generalLicenseNo">License Number</Label>
                            <Input
                              id="generalLicenseNo"
                              value={org.license_number || ""}
                              onChange={(e) => setOrgField("license_number", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="generalWebsite">Website</Label>
                            <Input
                              id="generalWebsite"
                              value={org.website || ""}
                              onChange={(e) => setOrgField("website", e.target.value)}
                              disabled={!canEditInstitutionWorkspace("general")}
                              placeholder="https://example.com"
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Logo</Label>
                            <div className="rounded-xl border border-[#111111]/10 bg-[#111111]/3 p-3">
                              <div className="flex items-center gap-3">
                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#111111]/10 bg-white flex items-center justify-center">
                                  {org.logo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={org.logo} alt="Organization logo preview" className="h-full w-full object-cover" />
                                  ) : (
                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[#111111]">Organization logo</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {isLogoUploading
                                      ? "Uploading image to Vercel Blob..."
                                      : org.logo
                                        ? "Image selected and ready to save."
                                        : "No logo selected."}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => generalLogoInputRef.current?.click()}
                                      disabled={!canEditInstitutionWorkspace("general") || isLogoUploading}
                                      className="h-8"
                                    >
                                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                                      {isLogoUploading ? "Uploading..." : org.logo ? "Change image" : "Choose image"}
                                    </Button>
                                    {org.logo && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setOrgField("logo", "")}
                                        disabled={!canEditInstitutionWorkspace("general") || isLogoUploading}
                                        className="h-8 text-rose-700 hover:text-rose-800"
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </div>
                                  <input
                                    ref={generalLogoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleGeneralLogoFileChange}
                                    disabled={!canEditInstitutionWorkspace("general") || isLogoUploading}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          </>
                          )}
                          {branchProfile && (
                            <>
                              <div className="md:col-span-2 pt-1">
                                <Separator className="my-3" />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="branchName">Branch name</Label>
                                <Input
                                  id="branchName"
                                  value={branchProfile.name}
                                  onChange={(e) => setBranchField("name", e.target.value)}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  className={memberInputClass}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="branchEstablished">Established date</Label>
                                <Input
                                  id="branchEstablished"
                                  type="date"
                                  value={branchProfile.established_date}
                                  onChange={(e) => setBranchField("established_date", e.target.value)}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  className={memberInputClass}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="branchCode">Branch code</Label>
                                <Input id="branchCode" value={branchProfile.branch_code} readOnly className={memberInputClass} />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="branchAddress">Address</Label>
                                <Textarea
                                  id="branchAddress"
                                  rows={3}
                                  value={branchProfile.address}
                                  onChange={(e) => setBranchField("address", e.target.value)}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  className={`${memberInputClass} min-h-[88px] resize-y`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="branchPhone">Phone</Label>
                                <Input
                                  id="branchPhone"
                                  value={branchProfile.phone_number}
                                  onChange={(e) => setBranchField("phone_number", e.target.value)}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  className={memberInputClass}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="branchEmail">Email</Label>
                                <Input
                                  id="branchEmail"
                                  type="email"
                                  value={branchProfile.email}
                                  onChange={(e) => setBranchField("email", e.target.value)}
                                  disabled={!canEditInstitutionWorkspace("general")}
                                  className={memberInputClass}
                                />
                              </div>
                            </>
                          )}
                        </div>
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
                        <CardDescription>Institution legal details and your branch contact (name, address, phone, email, established date).</CardDescription>
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
                            disabled={!canEditOrganizationProfile}
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

                    <Separator />

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

                    {branchProfile && (
                      <>
                        <Separator />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="orgTabBranchName">Branch name</Label>
                            <Input
                              id="orgTabBranchName"
                              value={branchProfile.name}
                              onChange={(e) => setBranchField("name", e.target.value)}
                              disabled={!isOrgEditMode}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="orgTabBranchEstablished">Established date</Label>
                            <Input
                              id="orgTabBranchEstablished"
                              type="date"
                              value={branchProfile.established_date}
                              onChange={(e) => setBranchField("established_date", e.target.value)}
                              disabled={!isOrgEditMode}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="orgTabBranchCode">Branch code</Label>
                            <Input id="orgTabBranchCode" value={branchProfile.branch_code} readOnly className={memberInputClass} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="orgTabBranchAddress">Address</Label>
                            <Textarea
                              id="orgTabBranchAddress"
                              rows={3}
                              value={branchProfile.address}
                              onChange={(e) => setBranchField("address", e.target.value)}
                              disabled={!isOrgEditMode}
                              className={`${memberInputClass} min-h-[88px] resize-y`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="orgTabBranchPhone">Phone</Label>
                            <Input
                              id="orgTabBranchPhone"
                              value={branchProfile.phone_number}
                              onChange={(e) => setBranchField("phone_number", e.target.value)}
                              disabled={!isOrgEditMode}
                              className={memberInputClass}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="orgTabBranchEmail">Email</Label>
                            <Input
                              id="orgTabBranchEmail"
                              type="email"
                              value={branchProfile.email}
                              onChange={(e) => setBranchField("email", e.target.value)}
                              disabled={!isOrgEditMode}
                              className={memberInputClass}
                            />
                          </div>
                        </div>
                      </>
                    )}

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

                {activeTab === "permissions" && (
                <Card className="border-[#1f1f1f]/10 shadow-md rounded-2xl">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-[#f08c2b]" />
                          Roles & Permissions
                        </CardTitle>
                        <CardDescription>
                          {rolePermPayload?.branch?.name
                            ? `Applies to branch “${rolePermPayload.branch.name}” only.`
                            : "Applies to your branch only."}{" "}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        className="bg-[#f08c2b] hover:bg-[#c06107] text-white shrink-0"
                        disabled={!settingsPermissions.editRolePermissions || !rolePermDirty || rolePermLoading || isSavingRolePermissions || !selectedRoleId}
                        onClick={() => void handleSaveRolePermissions()}
                      >
                        {isSavingRolePermissions ? "Saving…" : "Save role"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {rolePermLoading && (
                      <p className="text-sm text-muted-foreground">Loading roles and permissions…</p>
                    )}
                    {!rolePermLoading && rolePermPayload && rolePermPayload.roles.length === 0 && (
                      <p className="text-sm text-muted-foreground">No editable roles were returned for your institution.</p>
                    )}
                    {!rolePermLoading && rolePermPayload && rolePermPayload.roles.length > 0 && (
                      <>
                        <div className="space-y-2 max-w-md">
                          <Label>Role</Label>
                          <StyledSelect
                            value={selectedRoleId}
                            onChange={handleRolePermissionRoleChange}
                            placeholder="Select a role"
                            options={rolePermPayload.roles.map((r) => ({ value: r.id, label: r.name }))}
                            searchable
                          />
                          {selectedRoleForPerms?.description && (
                            <p className="text-xs text-muted-foreground">{selectedRoleForPerms.description}</p>
                          )}
                        </div>
                        {isAdminBranchRole && !actorIsSuperForPerms && (
                          <p className="text-xs text-muted-foreground rounded-lg border border-[#111111]/10 bg-[#111111]/4 px-3 py-2">
                            The Admin role always keeps “Edit role permissions” enabled so branch settings stay manageable.
                          </p>
                        )}
                        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-1">
                          {rolePermissionsByModule.map(([module, perms]) => (
                            <div key={module} className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#f08c2b]">{module}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {perms.map((p) => {
                                  const locked = isPermissionLockedForRole(p)
                                  const checked = draftRolePermissionIds.includes(p.id)
                                  const disabled = locked || rolePermLoading
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      role="checkbox"
                                      aria-checked={checked}
                                      aria-disabled={disabled}
                                      disabled={disabled}
                                      onClick={() => handleToggleRolePermission(p)}
                                      className={`flex w-full items-start gap-3 rounded-lg border border-[#111111]/10 bg-white px-3 py-2.5 text-left text-sm transition-colors ${
                                        disabled
                                          ? "cursor-not-allowed opacity-80"
                                          : "cursor-pointer hover:border-[#f08c2b]/40 focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-[#f08c2b] focus-visible:ring-offset-1"
                                      }`}
                                    >
                                      <span
                                        className={`relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                                          checked
                                            ? "border-[#f08c2b] bg-[#f08c2b]"
                                            : "border-gray-400 bg-white" + (disabled ? "" : " hover:border-gray-600")
                                        }`}
                                      >
                                        {checked && (
                                          <svg
                                            className="h-3 w-3 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                            aria-hidden
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="font-medium text-[#111111]">{formatPermissionLabel(p.name)}</span>
                                        <span className="block text-[11px] text-muted-foreground truncate" title={p.name}>
                                          {p.name}
                                        </span>
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
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
