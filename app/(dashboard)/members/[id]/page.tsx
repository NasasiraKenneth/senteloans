"use client"

import type React from "react"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useStaffSession } from "@/components/staff-session-provider"
import {
  ArrowLeft,
  User,
  Phone,
  Briefcase,
  DollarSign,
  Edit,
  CreditCard,
  PiggyBank,
  Users,
  FileText,
  TrendingUp,
  CheckCircle2,
  Circle,
  Shield,
  ShieldCheck,
  AlertCircle,
  Clock,
  Calculator,
  Plus,
  BookOpen,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import AddMembershipFeeModal from "../components/membershipFee/add"
import AddSharesModal from "../components/shares/add"
import SharesCalculatorModal from "../components/shares/calculator"
import AddOpeningBalanceModal from "../components/openningBalance/add"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"

const tabPanelMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
}

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const } },
}

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.id as string
  const { session } = useStaffSession()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSavings, setLoadingSavings] = useState(false)
  const [primarySavingsId, setPrimarySavingsId] = useState<string | null>(null)
  const [savingsBalance, setSavingsBalance] = useState<number>(0)
  const [savingsAccounts, setSavingsAccounts] = useState<any[]>([])
  const [activeLoansCount, setActiveLoansCount] = useState<number>(0)
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [enableLoading, setEnableLoading] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [kycPending, setKycPending] = useState<any[]>([])
  const [kycLoading, setKycLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [actionBusy, setActionBusy] = useState(false)
  const [membershipFee, setMembershipFee] = useState(0)
  const [membershipFeePaid, setMembershipFeePaid] = useState(0)
  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "financial" | "documents">("overview")
  const [showSharesCalculator, setShowSharesCalculator] = useState(false)
  const [showMembershipFeeModal, setShowMembershipFeeModal] = useState(false)
  const [showSharesModal, setShowSharesModal] = useState(false)
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false)
  const [canEditShares, setCanEditShares] = useState(false)
  const [canEditMembershipFee, setCanEditMembershipFee] = useState(false)
  const [canEditOpeningSavings, setCanEditOpeningSavings] = useState(false)
  const [canEditOpeningLoans, setCanEditOpeningLoans] = useState(false)
  const [canEditKyc, setCanEditKyc] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/institution/members/${userId}`, { cache: "no-store" })
        if (!res.ok) {
          const { error } = await res.json()
          throw new Error(error || "Failed to load client")
        }
        const responseData = (await res.json()) as {
          member: {
            id: string
            member_number: string
            full_name: string
            auth_id?: string | null
            date_of_birth: string
            gender: string
            marital_status: string
            member_type: string
            phone_number: string
            email: string | null
            national_id: string | null
            district: string | null
            village: string | null
            occupation: string | null
            monthly_income: number | null
            monthly_savings: number | null
            next_of_kin_name: string | null
            next_of_kin_relationship: string | null
            next_of_kin_phone: string | null
            passport_photo: string | null
            national_id_front: string | null
            national_id_back: string | null
            kyc_status: string
            status: string
            join_date: string
            number_of_shares: number | null
            share_value: number | null
            total_share_value: number | null
            membership_fee_paid: number
            // payout fields on clients table
            mobile_money_provider?: string | null
            mobile_money_number?: string | null
            bank_name?: string | null
            bank_account_number?: string | null
            bank_account_name?: string | null
            bank_branch?: string | null
          }
          membershipFee: number
        }
        const member = responseData.member
        if (typeof responseData.membershipFee === "number") setMembershipFee(responseData.membershipFee)
        if (typeof member.membership_fee_paid === "number") setMembershipFeePaid(member.membership_fee_paid)
        if (cancelled) return
        // Map API client to UI schema without changing UI
        const mapped = {
          id: member.id,
          clientNumber: member.member_number,
          fullName: member.full_name,
          supabaseUserId: member.auth_id || null,
          dateOfBirth: member.date_of_birth,
          gender: member.gender,
          maritalStatus: member.marital_status,
          clientType: member.member_type,
          phoneNumber: member.phone_number,
          email: member.email || "",
          nationalId: member.national_id || "",
          district: member.district || "",
          village: member.village || "",
          occupation: member.occupation || "",
          monthlyIncome: member.monthly_income || 0,
          monthlySavings: member.monthly_savings || 0,
          notes: (member as any).notes || "",
          nextOfKinName: member.next_of_kin_name || "",
          nextOfKinRelationship: member.next_of_kin_relationship || "",
          nextOfKinPhone: member.next_of_kin_phone || "",
          passportPhoto: member.passport_photo || "",
          nationalIdFront: member.national_id_front || "",
          nationalIdBack: member.national_id_back || "",
          kycStatus: member.kyc_status,
          status: member.status,
          joinDate: member.join_date,
          numberOfShares: member.number_of_shares || 0,
          shareValue: member.share_value || 0,
          totalShareValue: member.total_share_value || 0,
          // payout fields
          mobileMoneyProvider: member.mobile_money_provider || "",
          mobileMoneyNumber: member.mobile_money_number || "",
          bankName: member.bank_name || "",
          bankAccountNumber: member.bank_account_number || "",
          bankAccountName: member.bank_account_name || "",
          bankBranch: member.bank_branch || "",
          // Mock-only fields retained as fallbacks for UI:
          carLogbook: null,
          landTitle: null,
          bankStatement: null,
          employmentLetter: null,
        }
        setUser(mapped)
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
  }, [userId])

  // Load the current staff member's action permissions so we only surface
  // buttons (Buy Shares, Record Fee) they're actually allowed to use.
  useEffect(() => {
    let cancelled = false
    async function loadPermissions() {
      try {
        const res = await fetch(`/api/institution/members/permissions`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          permissions?: {
            editShares?: boolean
            editMembershipFee?: boolean
            editOpeningSavings?: boolean
            editOpeningLoans?: boolean
            editKyc?: boolean
          }
        }
        if (cancelled) return
        setCanEditShares(Boolean(data.permissions?.editShares))
        setCanEditMembershipFee(Boolean(data.permissions?.editMembershipFee))
        setCanEditOpeningSavings(Boolean(data.permissions?.editOpeningSavings))
        setCanEditOpeningLoans(Boolean(data.permissions?.editOpeningLoans))
        setCanEditKyc(Boolean(data.permissions?.editKyc))
      } catch {
        // Best-effort; buttons stay hidden if this fails.
      }
    }
    void loadPermissions()
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch client's primary savings account id to power the "View Savings" link
  useEffect(() => {
    let cancelled = false
    async function loadSavings() {
      if (!user?.id) return
      setLoadingSavings(true)
      try {
        const res = await fetch(`/api/institution/savings?client_id=${encodeURIComponent(user.id)}&limit=1`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load savings")
        const first = (data.items || [])[0]
        if (!cancelled) setPrimarySavingsId(first?.id || null)
      } catch (_e) {
        if (!cancelled) setPrimarySavingsId(null)
      } finally {
        if (!cancelled) setLoadingSavings(false)
      }
    }
    loadSavings()
    return () => { cancelled = true }
  }, [user?.id])

  // Fetch total savings balance for this client
  useEffect(() => {
    let cancelled = false
    async function loadSavingsBalance() {
      if (!user?.id) return
      try {
        const res = await fetch(`/api/institution/savings?client_id=${encodeURIComponent(user.id)}&limit=100`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load savings")
        const accounts = data.items || []
        const total = accounts.reduce((sum: number, acc: any) => sum + (parseFloat(acc.available_balance) || 0), 0)
        if (!cancelled) {
          setSavingsBalance(total)
          setSavingsAccounts(accounts)
        }
      } catch (_e) {
        if (!cancelled) {
          setSavingsBalance(0)
          setSavingsAccounts([])
        }
      }
    }
    loadSavingsBalance()
    return () => { cancelled = true }
  }, [user?.id])

  // Fetch active loans count and total outstanding balance for this client
  useEffect(() => {
    let cancelled = false
    async function loadLoansData() {
      if (!user?.id) return
      try {
        const res = await fetch(`/api/institution/loans?client_id=${encodeURIComponent(user.id)}&limit=100`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load loans")
        const loans = data.items || []
        // Count active loans (Active, Disbursed, Under Review, Approved statuses)
        const activeStatuses = ["Active", "Disbursed", "Under Review", "Approved"]
        const activeLoans = loans.filter((loan: any) => activeStatuses.includes(loan.status))
        const totalOutstanding = activeLoans.reduce((sum: number, loan: any) => sum + (parseFloat(loan.outstanding_balance) || 0), 0)
        if (!cancelled) {
          setActiveLoansCount(activeLoans.length)
          setOutstandingBalance(totalOutstanding)
        }
      } catch (_e) {
        if (!cancelled) {
          setActiveLoansCount(0)
          setOutstandingBalance(0)
        }
      }
    }
    loadLoansData()
    return () => { cancelled = true }
  }, [user?.id])

  // Fetch pending KYC docs for reviewers with edit_kyc permission
  useEffect(() => {
    let cancelled = false
    async function loadKyc() {
      if (!userId || !canEditKyc) {
        if (!cancelled) {
          setKycPending([])
          setKycLoading(false)
        }
        return
      }
      setKycLoading(true)
      try {
        const res = await fetch(`/api/institution/members/${encodeURIComponent(userId)}/kyc/pending`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load KYC docs")
        if (!cancelled) setKycPending(data?.pending || [])
      } catch (_e) {
        if (!cancelled) setKycPending([])
      } finally {
        if (!cancelled) setKycLoading(false)
      }
    }
    loadKyc()
    return () => { cancelled = true }
  }, [userId, canEditKyc])

  function generatePassword(len = 16) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&" // avoid ambiguous chars
    const arr = new Uint32Array(len)
    crypto.getRandomValues(arr)
    return Array.from(arr, (n) => chars[n % chars.length]).join("")
  }

  async function handleEnableClientLogin() {
    setEnableError(null)
    setGeneratedPassword(null)
    setCopied(false)
    if (!user?.email) {
      setEnableError("Client email is required. Please add an email on the profile first.")
      return
    }
    // Confirm if this is a password reset (already enabled)
    if (user?.supabaseUserId) {
      const ok = window.confirm("This will reset the client's password and invalidate the old one. Continue?")
      if (!ok) return
    }
    try {
      setEnableLoading(true)
      const password = generatePassword(16)
      const res = await fetch(`/api/institution/members/${encodeURIComponent(user.id)}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(user.email).trim().toLowerCase(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to enable client login")
      setGeneratedPassword(password)
      // Refresh client to reflect auth_id linkage
      try {
        const res2 = await fetch(`/api/institution/members/${encodeURIComponent(user.id)}`, { cache: "no-store" })
        if (res2.ok) {
          const payload = await res2.json()
          const c = payload?.member
          if (c) setUser((prev: any) => ({ ...prev, supabaseUserId: c.auth_id || prev?.supabaseUserId || null }))
        }
      } catch { /* ignore */ }
    } catch (e: any) {
      setEnableError(e?.message || "Failed to enable client login")
    } finally {
      setEnableLoading(false)
    }
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  async function handleApproveKyc(pendingId: string) {
    if (!userId || !canEditKyc) return
    try {
      setActionBusy(true)
      const res = await fetch(`/api/institution/members/${userId}/kyc/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Approve failed")
      // Reload pending list and client data
      setKycPending((prev) => prev.filter((item) => item.pendingId !== pendingId))
      const clientRes = await fetch(`/api/institution/members/${userId}`, { cache: "no-store" })
      if (clientRes.ok) {
        const payload = await clientRes.json()
        const c = payload?.member
        if (c) {
          setUser((prev: any) => ({
            ...prev,
            passportPhoto: c.passport_photo || prev?.passportPhoto,
            nationalIdFront: c.national_id_front || prev?.nationalIdFront,
            nationalIdBack: c.national_id_back || prev?.nationalIdBack,
            kycStatus: c.kyc_status || prev?.kycStatus,
          }))
        }
      }
    } catch (e: any) {
      alert(e?.message || "Failed to approve")
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRejectKyc(pendingId: string) {
    if (!userId || !canEditKyc) return
    const reason = rejectReason.trim()
    if (!reason) {
      alert("Rejection reason is required")
      return
    }
    try {
      setActionBusy(true)
      const res = await fetch(`/api/institution/members/${userId}/kyc/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Reject failed")
      setKycPending((prev) => prev.filter((item) => item.pendingId !== pendingId))
      setRejectReason("")
    } catch (e: any) {
      alert(e?.message || "Failed to reject")
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex min-h-[70vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading Member...</p>
          </div>
        </div>
      </>
    )
  }

  if (!user) {
    const clientTerm = session?.institution?.config?.clientTerminology || "User"
    return (
      <>
            <div className="text-center">
              {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
              <h1 className="text-2xl font-bold">{clientTerm} Not Found</h1>
              <p className="text-muted-foreground">The requested {clientTerm.toLowerCase()} could not be found.</p>
              <Link href="/members">
                <Button className="mt-4">Back to {clientTerm}s</Button>
              </Link>
            </div>
      </>
    )
  }

  const currency = session?.institution?.config?.currency || "UGX"
  const formatCurrency = (amount: number) => fmtCurrency(amount, currency)

  const refreshMembershipFee = async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/institution/members/${user.id}/membership-fee`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      if (typeof data.membershipFee === "number") setMembershipFee(data.membershipFee)
      if (typeof data.membershipFeePaid === "number") setMembershipFeePaid(data.membershipFeePaid)
    } catch {
      // ignore; UI keeps current values
    }
  }

  const refreshShares = async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/institution/members/${user.id}/shares`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      const rows: any[] = Array.isArray(data.shares) ? data.shares : []
      const totalShares = rows.reduce((sum, r) => sum + Number(r.number_of_shares || 0), 0)
      const totalValue = rows.reduce((sum, r) => sum + Number(r.total_value || 0), 0)
      setUser((prev: any) => (prev ? { ...prev, numberOfShares: totalShares, totalShareValue: totalValue } : prev))
    } catch {
      // ignore; UI keeps current values
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-UG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const clientTerm = session?.institution?.config?.clientTerminology || "User"
  const hasSharesFeature = session?.institution?.config?.modules?.shares
  // Show the shares section when the module is on or the member already holds
  // shares, but only allow *buying* when the module is enabled AND the staff
  // member has the edit_shares permission.
  const showShares = Boolean(hasSharesFeature || (user?.numberOfShares && user.numberOfShares > 0))
  const canBuyShares = Boolean(hasSharesFeature && canEditShares)
  const canRecordOpeningBalance = canEditOpeningSavings || canEditOpeningLoans
  const hasSavings = session?.institution?.config?.modules?.savings

  const initials = user.fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
            {/* Back navigation */}
            <div className="flex items-center justify-between gap-3">
              <Link href="/members" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Members
              </Link>
              {canRecordOpeningBalance && (
                <Button variant="outline" size="sm" onClick={() => setShowOpeningBalanceModal(true)}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Record Opening Balance
                </Button>
              )}
            </div>

            {/* Profile Header */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative overflow-hidden rounded-xl border bg-card"
            >
              <div className="h-24 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
              <div className="px-6 pb-6">
                <div className="flex flex-col sm:flex-row gap-5 -mt-10">
                  {/* Avatar */}
                  {user.passportPhoto ? (
                    <div className="relative h-20 w-20 shrink-0 rounded-full border-4 border-card overflow-hidden bg-muted shadow-sm">
                      <Image src={user.passportPhoto} alt={user.fullName} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="h-20 w-20 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
                      <span className="text-xl font-bold text-primary">{initials}</span>
                    </div>
                  )}

                  {/* Name + Meta */}
                  <div className="flex-1 min-w-0 pt-2 sm:pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <h1 className="text-2xl font-bold tracking-tight truncate">{user.fullName}</h1>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          user.status === "Active" ? "bg-green-100 text-green-700 border border-green-200"
                          : user.status === "Suspended" ? "bg-red-100 text-red-700 border border-red-200"
                          : "bg-gray-100 text-gray-700 border border-gray-200"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            user.status === "Active" ? "bg-green-500"
                            : user.status === "Suspended" ? "bg-red-500"
                            : "bg-gray-400"
                          }`} />
                          {user.status}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          user.kycStatus === "Verified" ? "bg-green-100 text-green-700 border border-green-200"
                          : user.kycStatus === "Pending" ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                          : user.kycStatus === "Rejected" ? "bg-red-100 text-red-700 border border-red-200"
                          : "bg-gray-100 text-gray-700 border border-gray-200"
                        }`}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          KYC: {user.kycStatus}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                      <span className="font-mono">{user.clientNumber}</span>
                      <span className="hidden sm:inline text-border">|</span>
                      <span>{user.phoneNumber}</span>
                      {user.email && (
                        <>
                          <span className="hidden sm:inline text-border">|</span>
                          <span className="truncate max-w-[200px]">{user.email}</span>
                        </>
                      )}
                      <span className="hidden sm:inline text-border">|</span>
                      <span>Joined {formatDate(user.joinDate)}</span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 sm:self-start sm:pt-4">
                    {membershipFee > 0 && canEditMembershipFee && (
                      <Button variant="outline" size="sm" onClick={() => setShowMembershipFeeModal(true)}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        Record Fee
                      </Button>
                    )}
                    {canBuyShares && (
                      <Button size="sm" onClick={() => setShowSharesModal(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Buy Shares
                      </Button>
                    )}
                    {showShares && (
                      <Button variant="outline" size="sm" onClick={() => setShowSharesCalculator(true)}>
                        <Calculator className="mr-2 h-4 w-4" />
                        Calculator
                      </Button>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t">
                  <Link href={`/members/${user.id}/loans`}>
                    <Button variant="outline" size="sm">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Loans
                    </Button>
                  </Link>
                  {hasSavings && (
                    primarySavingsId ? (
                      <Link href={`/savings/${primarySavingsId}`}>
                        <Button variant="outline" size="sm">
                          <PiggyBank className="h-4 w-4 mr-2" />
                          Savings
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="outline" size="sm" disabled title={loadingSavings ? "Loading..." : "No savings account found"}>
                        <PiggyBank className="h-4 w-4 mr-2" />
                        Savings
                      </Button>
                    )
                  )}
                  <Link href={`/members/${user.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  </Link>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant={user?.supabaseUserId ? "outline" : "default"}
                    onClick={handleEnableClientLogin}
                    disabled={enableLoading || !user.email}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    {user?.supabaseUserId
                      ? (enableLoading ? "Resetting..." : "Reset Password")
                      : (enableLoading ? "Enabling..." : "Enable Login")}
                  </Button>
                </div>
              </div>
            </motion.div>

            {(enableError || generatedPassword) && (
              <div className="md:col-span-2">
                <div className={["p-4 rounded-md border", enableError ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"].join(" ")}>
                  {enableError ? (
                    <div>
                      <div className="text-sm font-semibold text-red-700">Failed to enable client login</div>
                      <div className="text-sm text-red-700/90 mt-1">{enableError}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold text-green-800">Client login credentials generated</div>
                      <div className="text-sm text-green-900 mt-1">
                        Share the temporary password securely with the client. They can log in via <code>/client-login</code> using:
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Email</label>
                          <div className="text-sm font-medium break-all">{user.email}</div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Temporary Password</label>
                          <div className="flex items-center gap-2">
                            <code className="text-sm px-2 py-1 bg-white/70 border rounded">{generatedPassword}</code>
                            <Button variant="outline" size="sm" onClick={copyPassword}>{copied ? "Copied" : "Copy"}</Button>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">Advise the client to change their password after logging in.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab navigation (underlined active tab) */}
            <div className="border-b">
              <nav className="-mb-px flex gap-6 overflow-x-auto scrollbar-hide">
                {([
                  { key: "overview", label: "Overview", icon: TrendingUp },
                  { key: "personal", label: "Personal", icon: User },
                  { key: "financial", label: "Financial", icon: DollarSign },
                  { key: "documents", label: "Documents", icon: FileText, badge: canEditKyc ? (kycPending.length || undefined) : undefined },
                ] as Array<{ key: typeof activeTab; label: string; icon: typeof TrendingUp; badge?: number }>).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "relative inline-flex items-center gap-2 whitespace-nowrap px-1 py-3 text-sm font-medium transition-colors duration-200",
                      activeTab === t.key
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                    {t.badge ? (
                      <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                        {t.badge}
                      </span>
                    ) : null}
                    {activeTab === t.key && (
                      <motion.span
                        layoutId="memberTabUnderline"
                        className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            <AnimatePresence mode="wait">
            {/* Overview tab */}
            {activeTab === "overview" && (
            <motion.div key="overview" className="space-y-6" {...tabPanelMotion}>
            {/* Onboarding Checklist */}
            {(() => {
              const kycComplete = Boolean(user.passportPhoto && user.nationalIdFront && user.nationalIdBack)
              const payoutComplete = Boolean(
                (user.mobileMoneyProvider && user.mobileMoneyNumber) ||
                  (user.bankName && user.bankAccountNumber && user.bankAccountName && user.bankBranch)
              )
              const notesNokComplete = Boolean(user.notes && user.nextOfKinName && user.nextOfKinPhone)
              const items = [
                { key: "kyc", label: "Upload KYC documents", hint: "Passport photo, National ID front & back", done: kycComplete, href: `/members/${user.id}/edit#kyc` },
                { key: "payout", label: "Add payout account", hint: "Mobile Money or Bank Account", done: payoutComplete, href: `/members/${user.id}/edit#payout` },
                { key: "notes", label: "Add notes & next of kin", hint: "Notes and next-of-kin contact", done: notesNokComplete, href: `/members/${user.id}/edit#notes` },
              ]
              const doneCount = items.filter((i) => i.done).length
              const allDone = doneCount === items.length
              if (allDone) return null

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Onboarding Checklist</h2>
                      <p className="text-sm text-muted-foreground">Complete these steps to finish setup</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {doneCount} of {items.length} done
                    </span>
                  </div>

                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    className="divide-y divide-border overflow-hidden rounded-xl border border-border"
                  >
                    {items.map((i) => (
                      <motion.div key={i.key} variants={staggerItem} className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3">
                          {i.done ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                          )}
                          <div>
                            <p className={cn("text-sm font-medium", i.done && "text-muted-foreground line-through")}>{i.label}</p>
                            <p className="text-xs text-muted-foreground">{i.hint}</p>
                          </div>
                        </div>
                        {!i.done && (
                          <Link href={i.href}>
                            <Button size="sm" variant="outline">Complete</Button>
                          </Link>
                        )}
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )
            })()}

            {/* Account Summary */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Account Summary</h2>
                <p className="text-sm text-muted-foreground">
                  Quick overview of {clientTerm.toLowerCase()}&apos;s financial activity
                </p>
              </div>

              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {([
                  ...(showShares
                    ? [{ key: "shares", label: "Share Value", value: formatCurrency(user.totalShareValue || 0), sub: `${user.numberOfShares || 0} ${(user.numberOfShares || 0) === 1 ? "share" : "shares"}`, icon: TrendingUp, accent: "text-violet-600", chip: "bg-violet-100" }]
                    : []),
                  ...(hasSavings
                    ? [{ key: "savings", label: "Savings Balance", value: formatCurrency(savingsBalance), icon: PiggyBank, accent: "text-emerald-600", chip: "bg-emerald-100" }]
                    : []),
                  { key: "monthly", label: "Monthly Savings", value: formatCurrency(user.monthlySavings || 0), icon: PiggyBank, accent: "text-sky-600", chip: "bg-sky-100" },
                  { key: "loans", label: "Active Loans", value: String(activeLoansCount), icon: CreditCard, accent: "text-blue-600", chip: "bg-blue-100" },
                  { key: "outstanding", label: "Outstanding Balance", value: formatCurrency(outstandingBalance), icon: DollarSign, accent: "text-amber-600", chip: "bg-amber-100" },
                ] as Array<{ key: string; label: string; value: string; sub?: string; icon: typeof TrendingUp; accent: string; chip: string }>).map((s) => (
                  <motion.div
                    key={s.key}
                    variants={staggerItem}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", s.chip)}>
                        <s.icon className={cn("h-5 w-5", s.accent)} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                        <p className="mt-0.5 truncate text-lg font-bold tracking-tight">{s.value}</p>
                        {s.sub ? <p className="truncate text-xs text-muted-foreground">{s.sub}</p> : null}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Membership Fee Section */}
            {membershipFee > 0 && (() => {
              const remaining = Math.max(membershipFee - membershipFeePaid, 0)
              const percentage = membershipFee > 0 ? Math.min((membershipFeePaid / membershipFee) * 100, 100) : 0
              const isFullyPaid = membershipFeePaid >= membershipFee

              return (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Membership Fee</h2>
                    <p className="text-sm text-muted-foreground">
                      Fee payment status for this {clientTerm.toLowerCase()}
                    </p>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid</span>
                        <p className={cn("text-2xl font-bold tracking-tight", isFullyPaid ? "text-emerald-600" : "text-foreground")}>
                          {formatCurrency(membershipFeePaid)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Fee</span>
                        <p className="text-lg font-semibold tracking-tight text-muted-foreground">{formatCurrency(membershipFee)}</p>
                      </div>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn("h-full rounded-full", isFullyPaid ? "bg-emerald-500" : "bg-amber-500")}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm font-semibold", isFullyPaid ? "text-emerald-600" : "text-amber-600")}>
                        {Math.round(percentage)}% Complete
                      </span>
                      {isFullyPaid ? (
                        <Badge variant="default" className="border-emerald-200 bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Fully Paid
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Remaining: {formatCurrency(remaining)}</span>
                      )}
                    </div>

                    {!isFullyPaid && (
                      <div className="pt-1">
                        <Button variant="outline" size="sm" onClick={() => setShowMembershipFeeModal(true)}>
                          <DollarSign className="mr-2 h-4 w-4" />
                          Record Fee
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            </motion.div>
            )}

            {/* Personal tab */}
            {activeTab === "personal" && (
            <motion.div key="personal" {...tabPanelMotion}>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid gap-4 md:grid-cols-2"
              >
                {/* Personal Information */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-base font-semibold">Personal Information</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Full Name" value={user.fullName} />
                    <Field label="National ID" value={user.nationalId} />
                    <Field label="Date of Birth" value={user.dateOfBirth ? formatDate(user.dateOfBirth) : ""} />
                    <Field label="Gender" value={user.gender} />
                    <Field label="Marital Status" value={user.maritalStatus} />
                    <Field label={`${clientTerm} Type`} value={user.clientType} />
                    <Field label={`${clientTerm} Number`} value={user.clientNumber} />
                    <Field label="Join Date" value={user.joinDate ? formatDate(user.joinDate) : ""} />
                  </div>
                </motion.div>

                {/* Contact Information */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-base font-semibold">Contact Information</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Phone Number" value={user.phoneNumber} />
                    <Field label="Email Address" value={user.email} />
                    <Field label="Location" value={[user.village, user.district].filter(Boolean).join(", ")} />
                  </div>
                </motion.div>

                {/* Employment Information */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Briefcase className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-base font-semibold">Employment Information</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Occupation" value={user.occupation} />
                    <Field label="Monthly Income" value={formatCurrency(user.monthlyIncome)} />
                  </div>
                </motion.div>

                {/* Next of Kin Information */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-base font-semibold">Next of Kin</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Full Name" value={user.nextOfKinName} />
                    <Field label="Relationship" value={user.nextOfKinRelationship} />
                    <Field label="Phone Number" value={user.nextOfKinPhone} />
                  </div>
                </motion.div>

                {/* Notes */}
                {user.notes && (
                  <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5 md:col-span-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <h2 className="text-base font-semibold">Notes</h2>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{user.notes}</p>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
            )}

            {/* Financial tab */}
            {activeTab === "financial" && (
            <motion.div key="financial" {...tabPanelMotion}>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid gap-4 md:grid-cols-2"
              >
                {/* Savings */}
                {hasSavings && (
                  <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                          <PiggyBank className="h-4 w-4 text-emerald-600" />
                        </div>
                        <h2 className="text-base font-semibold">Savings</h2>
                      </div>
                      <Link href={`/members/${user.id}/savings`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Balance</p>
                        <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600">{formatCurrency(savingsBalance)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly Savings</p>
                        <p className="mt-1 text-xl font-bold tracking-tight">{formatCurrency(user.monthlySavings || 0)}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Loans */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      </div>
                      <h2 className="text-base font-semibold">Loans</h2>
                    </div>
                    <Link href={`/members/${user.id}/loans`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Loans</p>
                      <p className="mt-1 text-xl font-bold tracking-tight">{activeLoansCount}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding Balance</p>
                      <p className="mt-1 text-xl font-bold tracking-tight text-amber-600">{formatCurrency(outstandingBalance)}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Shares */}
                {showShares && (
                  <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5 md:col-span-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
                        <TrendingUp className="h-4 w-4 text-violet-600" />
                      </div>
                      <h2 className="text-base font-semibold">Shares</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Number of Shares</p>
                        <p className="mt-1 text-xl font-bold tracking-tight">{user.numberOfShares || 0}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Value per Share</p>
                        <p className="mt-1 text-xl font-bold tracking-tight">{formatCurrency(user.shareValue || 0)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Share Value</p>
                        <p className="mt-1 text-xl font-bold tracking-tight text-violet-600">{formatCurrency(user.totalShareValue || 0)}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Accounts */}
                {hasSavings && (
                  <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                          <PiggyBank className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold">Accounts</h2>
                          <p className="text-xs text-muted-foreground">
                            Savings accounts held by this {clientTerm.toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <Link href={`/members/${user.id}/savings`}>
                        <Button variant="ghost" size="sm">View all</Button>
                      </Link>
                    </div>

                    {savingsAccounts.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {savingsAccounts.map((acc: any) => (
                          <div key={acc.id} className="rounded-lg border border-border bg-muted/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{acc.account_type || "Savings"}</p>
                                <p className="truncate text-xs text-muted-foreground">{acc.account_number || "—"}</p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0",
                                  acc.status === "Active"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-border bg-muted text-muted-foreground"
                                )}
                              >
                                {acc.status || "—"}
                              </Badge>
                            </div>
                            <div className="mt-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
                              <p className="mt-0.5 text-lg font-bold tracking-tight text-emerald-600">
                                {formatCurrency(parseFloat(acc.available_balance) || 0)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No accounts found for this {clientTerm.toLowerCase()}.
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Linked Payout Accounts */}
                <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5 md:col-span-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                      <CreditCard className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Linked Payout Accounts</h2>
                      <p className="text-xs text-muted-foreground">Accounts used for disbursements and collections</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(user.mobileMoneyProvider || user.mobileMoneyNumber) && (
                      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                        <p className="text-sm font-medium">Mobile Money</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Field label="Provider" value={user.mobileMoneyProvider} />
                          <Field label="Number" value={user.mobileMoneyNumber} />
                        </div>
                      </div>
                    )}

                    {(user.bankName || user.bankAccountNumber || user.bankAccountName || user.bankBranch) && (
                      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                        <p className="text-sm font-medium">Bank Account</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Field label="Bank" value={user.bankName} />
                          <Field label="Account Number" value={user.bankAccountNumber} />
                          <Field label="Account Name" value={user.bankAccountName} />
                          <Field label="Branch" value={user.bankBranch} />
                        </div>
                      </div>
                    )}

                    {!user.mobileMoneyProvider &&
                      !user.mobileMoneyNumber &&
                      !user.bankName &&
                      !user.bankAccountNumber &&
                      !user.bankAccountName &&
                      !user.bankBranch && (
                        <p className="text-sm text-muted-foreground">No payout accounts linked.</p>
                      )}
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
            )}

            {/* Documents tab */}
            {activeTab === "documents" && (
            <motion.div key="documents" {...tabPanelMotion}>
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
              {/* Identification Documents */}
              <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Identification Documents</h2>
                      <p className="text-xs text-muted-foreground">{clientTerm} identification documents</p>
                    </div>
                  </div>
                  {canEditKyc && (
                    <Link href={`/members/${user.id}/edit#kyc`}>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Verify Documents
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DocImage label="Passport Photo" src={user.passportPhoto} width={300} height={375} wide />
                  <DocImage label="National ID (Front)" src={user.nationalIdFront} width={400} height={240} wide />
                  <DocImage label="National ID (Back)" src={user.nationalIdBack} width={400} height={240} wide />
                </div>
              </motion.div>

            {/* KYC Documents Review */}
            {canEditKyc && kycPending.length > 0 && (
              <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                      <Shield className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">KYC Documents Review</h2>
                      <p className="text-xs text-muted-foreground">Pending documents submitted for verification</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
                    {kycPending.length} pending
                  </Badge>
                </div>

                <div className="space-y-3">
                  {kycLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : (
                    kycPending.map((item: any) => (
                      <div key={item.pendingId} className="rounded-lg border border-border bg-muted/30 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="bg-card">
                                <Clock className="mr-1 h-3 w-3" />
                                {item.docType.replaceAll("_", " ")}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Submitted {new Date(item.submittedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block text-sm font-medium text-primary hover:underline"
                            >
                              View Document →
                            </a>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button size="sm" onClick={() => handleApproveKyc(item.pendingId)} disabled={actionBusy}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRejectKyc(item.pendingId)}
                              disabled={actionBusy}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="rounded-lg border border-dashed border-border p-4">
                    <p className="mb-2 text-sm font-medium">Rejection Reason (if rejecting)</p>
                    <Input
                      placeholder="Enter reason for rejection..."
                      value={rejectReason}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                      className="w-full"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      This reason will be shown to the {clientTerm.toLowerCase()} so they can resubmit with corrections.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Collateral Documents */}
            {session?.institution?.type === "money-lender" && (
              <motion.div variants={staggerItem} className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">Collateral Documents</h2>
                    <p className="text-xs text-muted-foreground">
                      Documents required for secured loans
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {([
                    { label: "Car Logbook", hint: "Required for car logbook loans", src: user.carLogbook, action: "Upload Logbook" },
                    { label: "Land Title", hint: "Required for land-based loans", src: user.landTitle, action: "Upload Land Title" },
                    { label: "Bank Statement", hint: "Required for business loans", src: user.bankStatement, action: "Upload Bank Statement" },
                    { label: "Employment Letter", hint: "Required for salary loans", src: user.employmentLetter, action: "Upload Employment Letter" },
                  ] as Array<{ label: string; hint: string; src?: string | null; action: string }>).map((doc) => {
                    const present = Boolean(doc.src)
                    return (
                      <div key={doc.label} className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                          <span className="truncate text-xs font-medium">{doc.label}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0",
                              present
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-border bg-muted text-muted-foreground"
                            )}
                          >
                            {present ? "Uploaded" : "Missing"}
                          </Badge>
                        </div>
                        <div className="space-y-3 p-4">
                          <p className="text-xs text-muted-foreground">{doc.hint}</p>
                          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border p-4">
                            {present ? (
                              <a href={doc.src as string} target="_blank" rel="noopener noreferrer" className="group block">
                                <Image
                                  src={doc.src as string}
                                  alt={doc.label}
                                  width={200}
                                  height={120}
                                  className="mx-auto rounded-md object-cover transition group-hover:opacity-90"
                                />
                              </a>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                                <FileText className="h-8 w-8" />
                                <Button variant="outline" size="sm">
                                  {doc.action}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h4 className="mb-2 text-sm font-semibold">Collateral Requirements by Loan Type</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• <strong className="font-medium text-foreground">Car Logbook Loans:</strong> Original vehicle logbook required</li>
                    <li>• <strong className="font-medium text-foreground">Land Title Loans:</strong> Land title deed or certificate of occupancy</li>
                    <li>• <strong className="font-medium text-foreground">Business Loans:</strong> 6-month bank statement showing business transactions</li>
                    <li>• <strong className="font-medium text-foreground">Salary Loans:</strong> Employment letter confirming salary and tenure</li>
                  </ul>
                </div>
              </motion.div>
            )}
              </motion.div>
            </motion.div>
            )}
            </AnimatePresence>
      </div>

      <AddMembershipFeeModal
        isOpen={showMembershipFeeModal}
        onClose={() => setShowMembershipFeeModal(false)}
        memberId={user.id}
        currency={currency}
        onSuccess={refreshMembershipFee}
      />

      <AddSharesModal
        isOpen={showSharesModal}
        onClose={() => setShowSharesModal(false)}
        memberId={user.id}
        currency={currency}
        shareValue={user.shareValue || 0}
        currentShares={user.numberOfShares || 0}
        currentTotalValue={user.totalShareValue || 0}
        onSuccess={refreshShares}
      />

      <SharesCalculatorModal
        isOpen={showSharesCalculator}
        onClose={() => setShowSharesCalculator(false)}
        shareValue={user.shareValue || 0}
        currency={currency}
        onBuyShares={() => {
          setShowSharesCalculator(false)
          setShowSharesModal(true)
        }}
      />

      <AddOpeningBalanceModal
        isOpen={showOpeningBalanceModal}
        onClose={() => setShowOpeningBalanceModal(false)}
        memberId={user.id}
        currency={currency}
        canEditSavings={canEditOpeningSavings}
        canEditLoans={canEditOpeningLoans}
      />
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}

function Field({ label, value }: { label: React.ReactNode; value?: React.ReactNode }) {
  const isEmpty = value === null || value === undefined || value === ""
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p className={cn("mt-0.5 break-words text-sm font-medium", isEmpty && "font-normal text-muted-foreground")}>
        {isEmpty ? "—" : value}
      </p>
    </div>
  )
}

function DocImage({
  label,
  src,
  width,
  height,
  wide = false,
}: {
  label: string
  src?: string | null
  width: number
  height: number
  wide?: boolean
}) {
  const present = Boolean(src)
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="truncate text-xs font-medium">{label}</span>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0",
            present
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          {present ? "Uploaded" : "Missing"}
        </Badge>
      </div>
      <div className={cn("flex items-center justify-center p-3", !present && "min-h-[160px]")}>
        {present ? (
          <a
            href={src as string}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("group block", wide && "w-full")}
          >
            <Image
              src={src as string}
              alt={label}
              width={width}
              height={height}
              className={cn(
                "rounded-md object-cover transition group-hover:opacity-90",
                wide ? "h-auto w-full" : "mx-auto max-h-44 w-auto"
              )}
            />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <FileText className="h-8 w-8" />
            <span className="text-xs">Not uploaded</span>
          </div>
        )}
      </div>
    </div>
  )
}
