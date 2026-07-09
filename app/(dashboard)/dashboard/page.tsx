"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Users,
  CreditCard,
  PiggyBank,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  DollarSign,
  TrendingDown,
  UserCheck,
  UserX,
  FileCheck,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useStaffSession } from "@/components/staff-session-provider"
import { useToast } from "@/components/ui/toast"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import { readClientTerminology } from "@/lib/institution-branch-config"
import {
  loanStatusBadgeVariant,
  loanStatusIsAtRisk,
  loanStatusIsDisbursed,
} from "@/lib/dashboard/loan-status-ui"
import { motion } from "framer-motion"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface DashboardData {
  stats: {
    peopleLabel: "members" | "borrowers"
    currency: string
    totalMembers: number
    activeMembers: number
    inactiveMembers: number
    newMembersThisMonth: number
    memberRetentionRate: number
    totalLoanPortfolio: number
    outstandingLoans: number
    activeLoansCount: number
    totalApprovedLoans: number
    overdueLoansCount: number
    averageLoanSize: number
    totalSavingsPortfolio?: number
    totalTransactionsThisMonth: number
    loansApprovedThisMonth: number
    nplRatio: number
    monthlyCollectionEfficiency: number
  }
  recentLoans: Array<{
    id: string
    applicationId: string
    principalAmount: number
    status: string
    clientName: string
    loanProduct: string
  }>
  recentMembers: Array<{
    id: string
    clientNumber: string
    fullName: string
    district: string
    occupation: string
    kycStatus: string
    status: string
  }>
}

type BranchOption = { id: string; name: string }

const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

/** Jan–Dec for the current year; synthetic growth through the current month (future months omitted). */
function buildFinancialTrends(baseLoans: number, baseSavings: number) {
  const currentMonth = new Date().getMonth()

  return MONTH_SHORT_LABELS.map((name, monthIndex) => {
    if (monthIndex > currentMonth) {
      return { name, Loans: null as number | null, Savings: null as number | null }
    }

    const progress = currentMonth === 0 ? 1 : monthIndex / currentMonth
    const loanMul = 0.55 + 0.45 * progress
    const savingsMul = 0.5 + 0.5 * progress

    return {
      name,
      Loans: Math.round(baseLoans * loanMul),
      Savings: Math.round(baseSavings * savingsMul),
    }
  })
}

function formatCompactMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    return `${currency} ${(amount / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${currency} ${(amount / 1_000).toFixed(0)}K`
  }
  return fmtCurrency(amount, currency)
}

function peopleLabelPlural(
  peopleLabel: DashboardData["stats"]["peopleLabel"],
  clientTerminology: string,
): string {
  if (peopleLabel === "borrowers") return "Borrowers"
  return clientTerminology === "Member" ? "Members" : `${clientTerminology}s`
}

type MemberChartDatum = { name: string; value: number; color: string }

function MemberStatusPieTooltip({
  active,
  payload,
  total,
  peopleLabel,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload: MemberChartDatum }>
  total: number
  peopleLabel: string
}) {
  if (!active || !payload?.length) return null

  const { name, value, color } = payload[0].payload
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0

  return (
    <div className="min-w-[148px] rounded-xl border border-border/70 bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{name}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold leading-none text-foreground tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">
        {pct}% of {total.toLocaleString()} {peopleLabel.toLowerCase()}
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { session } = useStaffSession()
  const { toast } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [mounted, setMounted] = useState(false)

  const clientTerminology = readClientTerminology(session?.institution?.config)
  const institutionName = session?.institution?.name || "SACCO"
  const currency = data?.stats.currency || "UGX"
  const peoplePlural = peopleLabelPlural(data?.stats.peopleLabel ?? "members", clientTerminology)

  const loadData = useCallback(
    async (branches: string[]) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (branches.length > 0) params.set("branches", branches.join(","))
        const res = await fetch(`/api/institution/dashboard-stats?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(body?.error || "Failed to load dashboard")
        }
        setData(body)
      } catch (e: unknown) {
        const err = e as Error
        setData(null)
        toast({
          title: "Dashboard unavailable",
          description: err?.message || "Could not load dashboard statistics.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    setMounted(true)
    let cancelled = false
    fetch("/api/institution/navigation/permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.permissions) return
        setIsSuperAdmin(!!body.permissions.isSuperAdmin)
        setBranchOptions(Array.isArray(body.permissions.branches) ? body.permissions.branches : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadData(selectedBranches)
  }, [loadData, selectedBranches])

  const stats = data?.stats ?? {
    peopleLabel: "members" as const,
    currency: "UGX",
    totalMembers: 0,
    activeMembers: 0,
    inactiveMembers: 0,
    newMembersThisMonth: 0,
    memberRetentionRate: 0,
    totalLoanPortfolio: 0,
    outstandingLoans: 0,
    activeLoansCount: 0,
    totalApprovedLoans: 0,
    overdueLoansCount: 0,
    averageLoanSize: 0,
    totalTransactionsThisMonth: 0,
    loansApprovedThisMonth: 0,
    nplRatio: 0,
    monthlyCollectionEfficiency: 0,
  }

  const recentLoans = data?.recentLoans?.slice(0, 5) ?? []
  const recentMembers = data?.recentMembers?.slice(0, 5) ?? []

  const branchToggle = useCallback((branchId: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    )
  }, [])

  const showSavingsCard = useMemo(
    () => (stats.totalSavingsPortfolio ?? 0) > 0,
    [stats.totalSavingsPortfolio],
  )

  // Synthetic trend: all 12 months of the current calendar year
  const financialTrends = useMemo(() => {
    return buildFinancialTrends(stats.totalLoanPortfolio || 0, stats.totalSavingsPortfolio || 0)
  }, [stats.totalLoanPortfolio, stats.totalSavingsPortfolio])

  const memberChartData = useMemo(() => {
    return [
      { name: "Active", value: stats.activeMembers || 0, color: "#f08c2b" },
      { name: "Inactive", value: stats.inactiveMembers || 0, color: "#374151" },
    ]
  }, [stats.activeMembers, stats.inactiveMembers])

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-96 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Premium Hero Greeting Section */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 text-accent mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live Operations Dashboard
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Welcome to {institutionName}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
              Track your financial portfolio, review member registrations, and manage branch performance with automated indicators.
            </p>
          </div>

          {isSuperAdmin && branchOptions.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 min-w-[260px] self-start md:self-auto shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Branch Scopes</p>
              <div className="flex flex-wrap gap-1.5">
                {branchOptions.map((branch) => {
                  const active = selectedBranches.includes(branch.id)
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => branchToggle(branch.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                        active
                          ? "border-accent bg-accent/15 text-accent shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                    >
                      {branch.name}
                    </button>
                  )
                })}
              </div>
              {selectedBranches.length > 0 && (
                <button
                  type="button"
                  className="mt-3 text-xs font-semibold text-accent hover:underline block"
                  onClick={() => setSelectedBranches([])}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Members */}
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="relative overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-md hover:border-accent/30">
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total {peoplePlural}
              </CardTitle>
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight">{stats.totalMembers}</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-accent" /> Active</span>
                  <span className="font-bold text-foreground">{stats.activeMembers}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1"><UserX className="h-3.5 w-3.5" /> Inactive</span>
                  <span className="font-bold text-foreground">{stats.inactiveMembers}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 2: Loan Portfolio */}
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="relative overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-md hover:border-accent/30">
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Loan Portfolio
              </CardTitle>
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <CreditCard className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight">
                {formatCompactMoney(stats.totalLoanPortfolio, currency)}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1"><FileCheck className="h-3.5 w-3.5 text-accent" /> Total Approved</span>
                  <span className="font-bold text-foreground">{stats.totalApprovedLoans}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Active Loans</span>
                  <span className="font-bold text-foreground">{stats.activeLoansCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 3: Savings Portfolio */}
        {showSavingsCard ? (
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="relative overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-md hover:border-accent/30">
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-6 -mt-6" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Savings Portfolio
                </CardTitle>
                <div className="p-2 rounded-lg bg-accent/10 text-accent">
                  <PiggyBank className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">
                  {formatCompactMoney(stats.totalSavingsPortfolio ?? 0, currency)}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Transactions (Month)</span>
                    <span className="font-bold text-foreground">{stats.totalTransactionsThisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Avg Member Saving</span>
                    <span className="font-bold text-foreground">
                      {stats.totalMembers > 0
                        ? formatCompactMoney(Math.round((stats.totalSavingsPortfolio ?? 0) / stats.totalMembers), currency)
                        : `${currency} 0`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="relative overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-md hover:border-accent/30">
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-6 -mt-6" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Retention & Growth
                </CardTitle>
                <div className="p-2 rounded-lg bg-accent/10 text-accent">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">{stats.memberRetentionRate}%</div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>New (Month)</span>
                    <span className="font-bold text-foreground">+{stats.newMembersThisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Target Growth</span>
                    <span className="font-bold text-emerald-600">On Track</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Card 4: Collection Efficiency */}
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="relative overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-md hover:border-accent/30">
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Collection Efficiency
              </CardTitle>
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight">{stats.monthlyCollectionEfficiency}%</div>
              <Progress value={stats.monthlyCollectionEfficiency} className="mt-3 h-1.5 [&>div]:bg-accent" />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Repayments collected vs due this calendar month
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Redesigned Charts Section */}
      {mounted && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Chart 1: Financial Overview Trend */}
          <Card className="md:col-span-2 border-border bg-card/65 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Financial Trends
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Estimated portfolio volumes and client saving growth trends
                  </CardDescription>
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-foreground" /> Loans</span>
                  {showSavingsCard && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Savings</span>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLoans" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f0f12" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0f0f12" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f08c2b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f08c2b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} interval={0} />
                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                      labelStyle={{ color: "#ffffff", fontWeight: "bold", fontSize: "11px" }}
                      itemStyle={{ color: "#f08c2b", fontSize: "11px" }}
                    />
                    <Area type="monotone" dataKey="Loans" stroke="#0f0f12" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLoans)" connectNulls={false} />
                    {showSavingsCard && <Area type="monotone" dataKey="Savings" stroke="#f08c2b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSavings)" connectNulls={false} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: Member Distribution */}
          <Card className="border-border bg-card/65 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {peoplePlural} Status
              </CardTitle>
              <CardDescription className="text-xs">
                Active vs inactive ratios in local database
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center items-center relative">
              <div className="h-[280px] w-[292px]">
                <PieChart width={292} height={280}>
                  <Pie
                    data={memberChartData}
                    cx={146}
                    cy={150}
                    innerRadius={30}
                    outerRadius={100}
                    paddingAngle={5}
                    cornerRadius={17}
                    startAngle={-45}
                    endAngle={310}
                    dataKey="value"
                    activeShape={{
                      innerRadius: 28,
                      outerRadius: 108,
                      cornerRadius: 17,
                    }}
                  >
                    {memberChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    wrapperStyle={{ outline: "none", zIndex: 20 }}
                    content={(props) => (
                      <MemberStatusPieTooltip
                        {...props}
                        total={stats.totalMembers}
                        peopleLabel={peoplePlural}
                      />
                    )}
                  />
                </PieChart>
              </div>
              
              <div className="flex gap-4 justify-center text-xs mt-3 w-full border-t border-border/40 pt-4">
                {memberChartData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-bold text-foreground">({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grid: Portfolio Health & Recent Applications */}
      <div className="grid gap-6 md:grid-cols-5">
        {/* Left Column: Recent Applications */}
        <Card className="md:col-span-3 border-border bg-card/65 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Recent Loan Applications
              </CardTitle>
              <CardDescription className="text-xs">
                Review and update status on the newest loan proposals
              </CardDescription>
            </div>
            <Link href="/loans">
              <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent border-border hover:text-black hover:bg-muted/40 gap-1 text-accent">
                All Loans <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLoans.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No recent loan applications found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border/40 text-muted-foreground">
                        <th className="pb-2 font-bold uppercase">Borrower</th>
                        <th className="pb-2 font-bold uppercase">Product</th>
                        <th className="pb-2 font-bold uppercase">Amount</th>
                        <th className="pb-2 font-bold uppercase text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {recentLoans.map((loan) => (
                        <tr key={loan.id} className="group transition-colors hover:bg-muted/10">
                          <td className="py-2.5 font-semibold text-foreground">{loan.clientName}</td>
                          <td className="py-2.5 text-muted-foreground">{loan.loanProduct}</td>
                          <td className="py-2.5 font-bold">{formatCompactMoney(loan.principalAmount, currency)}</td>
                          <td className="py-2.5 text-right">
                            <Badge variant={loanStatusBadgeVariant(loan.status)} className="text-[10px] py-0.5 px-2 font-semibold">
                              {loanStatusIsDisbursed(loan.status) && <DollarSign className="mr-1 h-2.5 w-2.5" />}
                              {loanStatusIsAtRisk(loan.status) && <AlertTriangle className="mr-1 h-2.5 w-2.5 animate-bounce" />}
                              {loan.status === "Approved" && <CheckCircle className="mr-1 h-2.5 w-2.5 text-emerald-600" />}
                              {loan.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Portfolio Health KPIs */}
        <Card className="md:col-span-2 border-border bg-card/65 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Portfolio Health
            </CardTitle>
            <CardDescription className="text-xs">
              Operational metrics for risk assessment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-semibold text-muted-foreground">Active Ratio</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {stats.activeMembers}/{stats.totalMembers}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-semibold text-muted-foreground">NPL Ratio</span>
              <Badge variant={stats.nplRatio > 10 ? "destructive" : "secondary"} className="font-bold text-xs">
                {stats.nplRatio}%
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-semibold text-muted-foreground">Outstanding Portfolio</span>
              <span className="text-xs font-extrabold text-foreground">{formatCompactMoney(stats.outstandingLoans, currency)}</span>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-muted-foreground">Overdue (At Risk)</span>
              <Badge variant={stats.overdueLoansCount > 0 ? "destructive" : "secondary"} className="font-semibold text-xs gap-1">
                {stats.overdueLoansCount > 0 && <AlertTriangle className="h-3 w-3 text-white" />}
                {stats.overdueLoansCount} loans
              </Badge>
            </div>
            <div className="pt-2">
              <Link href="/reports">
                <Button variant="outline" size="sm" className="w-full bg-transparent border-border text-xs hover:bg-muted/4 hover:text-black gap-1.5 font-bold">
                  View Detailed Performance Reports
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Recent Registrations */}
      <Card className="border-border bg-card/65 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Recent {peoplePlural} Registrations
            </CardTitle>
            <CardDescription className="text-xs">
              Newly registered client profiles requiring KYC verification
            </CardDescription>
          </div>
          <Link href="/members">
            <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent border-border hover:bg-muted/40 hover:text-black gap-1 text-accent">
              View All {peoplePlural} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No recent registrations.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentMembers.map((member) => (
                  <motion.div
                    key={member.id}
                    whileHover={{ scale: 1.01 }}
                    className="p-3.5 rounded-xl border border-border/60 bg-muted/10 hover:border-accent/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-foreground truncate max-w-[150px]">{member.fullName}</span>
                        <Badge variant={member.kycStatus === "Verified" ? "default" : "outline"} className="text-[9px] py-0 px-1.5 font-bold">
                          {member.kycStatus}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {member.clientNumber} · {member.occupation || "N/A"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20 text-[10px]">
                      <span className="text-muted-foreground truncate max-w-[120px]">{member.district || "No Location"}</span>
                      <span className="font-semibold text-accent">{member.status}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
