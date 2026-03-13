"use client"

import type React from "react"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { getSession } from "@/lib/session"
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
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.id as string
  const [user, setUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSavings, setLoadingSavings] = useState(false)
  const [primarySavingsId, setPrimarySavingsId] = useState<string | null>(null)
  const [savingsBalance, setSavingsBalance] = useState<number>(0)
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

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
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
            supabase_user_id?: string | null
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
          supabaseUserId: member.supabase_user_id || null,
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
        if (!cancelled) setSavingsBalance(total)
      } catch (_e) {
        if (!cancelled) setSavingsBalance(0)
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

  // Fetch pending KYC docs for this client
  useEffect(() => {
    let cancelled = false
    async function loadKyc() {
      if (!userId) return
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
  }, [userId])

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
      // Refresh client to reflect supabase_user_id linkage
      try {
        const res2 = await fetch(`/api/institution/members/${encodeURIComponent(user.id)}`, { cache: "no-store" })
        if (res2.ok) {
          const payload = await res2.json()
          const c = payload?.member
          if (c) setUser((prev: any) => ({ ...prev, supabaseUserId: c.supabase_user_id || prev?.supabaseUserId || null }))
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
    if (!userId) return
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
    if (!userId) return
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
        <div className="text-center">
          <p>Loading...</p>
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
              <Link href="/users">
                <Button className="mt-4">Back to {clientTerm}s</Button>
              </Link>
            </div>
      </>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
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
  const showShares = Boolean(hasSharesFeature || (user?.numberOfShares && user.numberOfShares > 0))
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
            <div>
              <Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to {clientTerm}s
              </Link>
            </div>

            {/* Profile Header */}
            <div className="relative overflow-hidden rounded-xl border bg-card">
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
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t">
                  <Link href={`/users/${user.id}/loans`}>
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
                  <Link href={`/users/${user.id}/edit`}>
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
            </div>

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

            {/* Onboarding Checklist */}
            <div className="space-y-4">
              <div className="border-b pb-4">
                <h2 className="text-xl font-semibold">Onboarding Checklist</h2>
              </div>

              {(() => {
                const kycComplete = Boolean(user.passportPhoto && user.nationalIdFront && user.nationalIdBack)
                const payoutComplete = Boolean(
                  (user.mobileMoneyProvider && user.mobileMoneyNumber) ||
                    (user.bankName && user.bankAccountNumber && user.bankAccountName && user.bankBranch)
                )
                const notesNokComplete = Boolean(user.notes && user.nextOfKinName && user.nextOfKinPhone)
                const items = [
                  {
                    key: "kyc",
                    label: "Upload KYC documents (Passport photo, National ID front & back)",
                    done: kycComplete,
                    href: `/users/${user.id}/edit#kyc`,
                  },
                  {
                    key: "payout",
                    label: "Add payout account (Mobile Money or Bank Account)",
                    done: payoutComplete,
                    href: `/users/${user.id}/edit#payout`,
                  },
                  {
                    key: "notes",
                    label: "Add notes and next of kin details",
                    done: notesNokComplete,
                    href: `/users/${user.id}/edit#notes`,
                  },
                ] as const

                const allDone = items.every((i) => i.done)
                if (allDone) return null

                return (
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <ul className="space-y-3">
                      {items.map((i) => (
                        <li key={i.key} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {i.done ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-sm">{i.label}</span>
                          </div>
                          {!i.done && (
                            <Link href={i.href}>
                              <Button size="sm" variant="outline">Complete</Button>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
            </div>

            {/* Account Summary */}
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-xl font-semibold">Account Summary</h2>
                <p className="text-sm text-muted-foreground">
                  Quick overview of {clientTerm.toLowerCase()}'s financial activity
                </p>
              </div>

              <div className="overflow-x-auto pb-1 scrollbar-hide">
                <div className="grid grid-cols-4 gap-4 min-w-[64rem]">
                  {showShares && (
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div className="flex items-center">
                        <TrendingUp className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">Share Value</span>
                      </div>
                      <span className="text-sm font-medium">{formatCurrency(user.totalShareValue || 0)}</span>
                    </div>
                  )}
                  {hasSavings && (
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div className="flex items-center">
                        <PiggyBank className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">Savings Balance</span>
                      </div>
                      <span className="text-sm font-medium">{formatCurrency(savingsBalance)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center">
                      <PiggyBank className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">Monthly Savings</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(user.monthlySavings || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center">
                      <CreditCard className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">Active Loans</span>
                    </div>
                    <span className="text-sm font-medium">{activeLoansCount}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">Outstanding Balance</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(outstandingBalance)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Membership Fee Section */}
            {membershipFee > 0 && (
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-xl font-semibold">Membership Fee</h2>
                  <p className="text-sm text-muted-foreground">
                    Fee payment status for this {clientTerm.toLowerCase()}
                  </p>
                </div>

                {(() => {
                  const remaining = membershipFee - membershipFeePaid
                  const percentage = membershipFee > 0 ? (membershipFeePaid / membershipFee) * 100 : 0
                  const isFullyPaid = membershipFeePaid >= membershipFee

                  return (
                    <div className="p-4 border border-border rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-muted-foreground">Paid</span>
                          <p className="text-xl font-bold">{formatCurrency(membershipFeePaid)}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-muted-foreground">Total Fee</span>
                          <p className="text-xl font-bold">{formatCurrency(membershipFee)}</p>
                        </div>
                      </div>

                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${isFullyPaid ? "bg-green-500" : "bg-orange-500"}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${isFullyPaid ? "text-green-600" : "text-orange-600"}`}>
                          {Math.round(percentage)}% Complete
                        </span>
                        {!isFullyPaid && (
                          <span className="text-sm text-muted-foreground">
                            Remaining: {formatCurrency(remaining)}
                          </span>
                        )}
                        {isFullyPaid && (
                          <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
                            Fully Paid
                          </Badge>
                        )}
                      </div>

                      {!isFullyPaid && (
                        <div className="pt-2">
                          <Link href={`/users/${user.id}/edit#membership-fee`}>
                            <Button variant="outline" size="sm">
                              <DollarSign className="h-4 w-4 mr-2" />
                              Record Payment
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <User className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Personal Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Full Name</Label>
                    <p className="text-sm font-medium">{user.fullName}</p>
                  </div>
                  <div>
                    <Label>National ID</Label>
                    <p className="text-sm font-medium">{user.nationalId}</p>
                  </div>
                  <div>
                    <Label>Date of Birth</Label>
                    <p className="text-sm font-medium">{formatDate(user.dateOfBirth)}</p>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <p className="text-sm font-medium">{user.gender}</p>
                  </div>
                  <div>
                    <Label>Marital Status</Label>
                    <p className="text-sm font-medium">{user.maritalStatus}</p>
                  </div>
                  <div>
                    <Label>{clientTerm} Type</Label>
                    <p className="text-sm font-medium">{user.clientType}</p>
                  </div>
                  <div>
                    <Label>{clientTerm} Number</Label>
                    <p className="text-sm font-medium">{user.clientNumber}</p>
                  </div>
                  <div>
                    <Label>Join Date</Label>
                    <p className="text-sm font-medium">{formatDate(user.joinDate)}</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Phone className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Contact Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Phone Number</Label>
                    <p className="text-sm font-medium">{user.phoneNumber}</p>
                  </div>
                  {user.email && (
                    <div>
                      <Label>Email Address</Label>
                      <p className="text-sm font-medium">{user.email}</p>
                    </div>
                  )}
                  <div>
                    <Label>Location</Label>
                    <p className="text-sm font-medium">
                      {user.village}, {user.district}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {user.notes && (
                <div className="space-y-6 md:col-span-2">
                  <div className="border-b pb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h2 className="text-xl font-semibold">Notes</h2>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{user.notes}</p>
                  </div>
                </div>
              )}

              {/* Employment Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Employment Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Occupation</Label>
                    <p className="text-sm font-medium">{user.occupation}</p>
                  </div>
                  <div>
                    <Label>Monthly Income</Label>
                    <p className="text-sm font-medium">{formatCurrency(user.monthlyIncome)}</p>
                  </div>
                </div>
              </div>

              {/* Shares section will be rendered later just before Linked Payout Accounts */}

              {/* Next of Kin Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Next of Kin Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Full Name</Label>
                    <p className="text-sm font-medium">{user.nextOfKinName}</p>
                  </div>
                  <div>
                    <Label>Relationship</Label>
                    <p className="text-sm font-medium">{user.nextOfKinRelationship}</p>
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <p className="text-sm font-medium">{user.nextOfKinPhone}</p>
                  </div>
                </div>
              </div>

              {/* Shares Information (moved here before Linked Payout Accounts) */}
              {showShares && (
                <div className="space-y-6 md:col-span-2">
                  <div className="border-b pb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h2 className="text-xl font-semibold">Share Information</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">Member shares overview</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm text-muted-foreground">Number of Shares</div>
                      <div className="text-base font-semibold mt-1">{user.numberOfShares || 0}</div>
                    </div>
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm text-muted-foreground">Value per Share</div>
                      <div className="text-base font-semibold mt-1">{formatCurrency(user.shareValue || 0)}</div>
                    </div>
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm text-muted-foreground">Total Share Value</div>
                      <div className="text-base font-semibold mt-1 text-primary">{formatCurrency(user.totalShareValue || 0)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Payout Accounts */}
              <div className="space-y-6 md:col-span-2">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Linked Payout Accounts</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">Accounts used for disbursements and collections.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {(user.mobileMoneyProvider || user.mobileMoneyNumber) && (
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm font-medium mb-2">Mobile Money</div>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <Label>Provider</Label>
                          <p className="font-medium">{user.mobileMoneyProvider || "-"}</p>
                        </div>
                        <div>
                          <Label>Number</Label>
                          <p className="font-medium">{user.mobileMoneyNumber || "-"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(user.bankName || user.bankAccountNumber || user.bankAccountName || user.bankBranch) && (
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm font-medium mb-2">Bank Account</div>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <Label>Bank</Label>
                          <p className="font-medium">{user.bankName || "-"}</p>
                        </div>
                        <div>
                          <Label>Account Number</Label>
                          <p className="font-medium">{user.bankAccountNumber || "-"}</p>
                        </div>
                        <div>
                          <Label>Account Name</Label>
                          <p className="font-medium">{user.bankAccountName || "-"}</p>
                        </div>
                        <div>
                          <Label>Branch</Label>
                          <p className="font-medium">{user.bankBranch || "-"}</p>
                        </div>
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
              </div>
            </div>

            {/* Documents */}
            <div className="space-y-6">
              <div className="border-b pb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-xl font-semibold">Documents</h2>
                </div>
                <p className="text-sm text-muted-foreground">{clientTerm} identification documents</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <Label>Passport Photo</Label>
                  <div className="mt-2 border border-border rounded-lg p-4">
                    <Image
                      src={user.passportPhoto || "/placeholder.svg?height=150&width=120&query=passport photo"}
                      alt="Passport Photo"
                      width={120}
                      height={150}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <Label>National ID (Front)</Label>
                  <div className="mt-2 border border-border rounded-lg p-4">
                    <Image
                      src={user.nationalIdFront || "/placeholder.svg?height=120&width=200&query=national ID front"}
                      alt="National ID Front"
                      width={200}
                      height={120}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <Label>National ID (Back)</Label>
                  <div className="mt-2 border border-border rounded-lg p-4">
                    <Image
                      src={user.nationalIdBack || "/placeholder.svg?height=120&width=200&query=national ID back"}
                      alt="National ID Back"
                      width={200}
                      height={120}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* KYC Documents Review */}
            {kycPending.length > 0 && (
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">KYC Documents Review</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">Pending documents submitted for verification</p>
                </div>

                <div className="space-y-4">
                  {kycLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : (
                    kycPending.map((item: any) => (
                      <div key={item.pendingId} className="border border-border rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                <Clock className="h-3 w-3 mr-1" />
                                {item.docType.replaceAll("_", " ")}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Submitted {new Date(item.submittedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                              >
                                View Document →
                              </a>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveKyc(item.pendingId)}
                              disabled={actionBusy}
                            >
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

                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    <p className="text-sm font-medium mb-2">Rejection Reason (if rejecting)</p>
                    <Input
                      placeholder="Enter reason for rejection..."
                      value={rejectReason}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      This reason will be shown to the client so they can resubmit with corrections.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Collateral Documents */}
            {session?.institution?.type === "money-lender" && (
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Collateral Documents</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload collateral documents required for secured loans
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="text-center">
                      <Label>Car Logbook</Label>
                      <p className="text-xs text-muted-foreground mb-2">Required for car logbook loans</p>
                      <div className="mt-2 border border-dashed border-border rounded-lg p-6">
                        {user.carLogbook ? (
                          <Image
                            src={user.carLogbook || "/placeholder.svg"}
                            alt="Car Logbook"
                            width={200}
                            height={120}
                            className="mx-auto rounded-md object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <Button variant="outline" size="sm">
                              Upload Logbook
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-center">
                      <Label>Land Title</Label>
                      <p className="text-xs text-muted-foreground mb-2">Required for land-based loans</p>
                      <div className="mt-2 border border-dashed border-border rounded-lg p-6">
                        {user.landTitle ? (
                          <Image
                            src={user.landTitle || "/placeholder.svg"}
                            alt="Land Title"
                            width={200}
                            height={120}
                            className="mx-auto rounded-md object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <Button variant="outline" size="sm">
                              Upload Land Title
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-center">
                      <Label>Bank Statement</Label>
                      <p className="text-xs text-muted-foreground mb-2">Required for business loans</p>
                      <div className="mt-2 border border-dashed border-border rounded-lg p-6">
                        {user.bankStatement ? (
                          <Image
                            src={user.bankStatement || "/placeholder.svg"}
                            alt="Bank Statement"
                            width={200}
                            height={120}
                            className="mx-auto rounded-md object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <Button variant="outline" size="sm">
                              Upload Bank Statement
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-center">
                      <Label>Employment Letter</Label>
                      <p className="text-xs text-muted-foreground mb-2">Required for salary loans</p>
                      <div className="mt-2 border border-dashed border-border rounded-lg p-6">
                        {user.employmentLetter ? (
                          <Image
                            src={user.employmentLetter || "/placeholder.svg"}
                            alt="Employment Letter"
                            width={200}
                            height={120}
                            className="mx-auto rounded-md object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <Button variant="outline" size="sm">
                              Upload Employment Letter
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Collateral Requirements by Loan Type:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>
                      • <strong>Car Logbook Loans:</strong> Original vehicle logbook required
                    </li>
                    <li>
                      • <strong>Land Title Loans:</strong> Land title deed or certificate of occupancy
                    </li>
                    <li>
                      • <strong>Business Loans:</strong> 6-month bank statement showing business transactions
                    </li>
                    <li>
                      • <strong>Salary Loans:</strong> Employment letter confirming salary and tenure
                    </li>
                  </ul>
                </div>
              </div>
            )}
      </div>
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
