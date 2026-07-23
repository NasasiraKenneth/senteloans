"use client"

import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  EyeOff,
  History,
  PiggyBank,
  TrendingUp,
  Target,
  Sparkles,
  ChevronRight,
  Coins,
  ArrowRight,
  Award,
  Lock,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  SavingsAccountCard,
  SavingsAccountCardSkeleton,
} from "@/components/client-portal-account-card"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { cn } from "@/lib/utils"

// DataTable component import
import { DataTable } from "@/components/datatables"

// Recharts imports for lines and proportions
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"

type SavingsAccount = {
  id: string
  account_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date?: string
}

type SavingsTransaction = {
  id: string
  type: string
  amount: number
  mode?: string
  description?: string
  balance?: number
  date: string
  account_id?: string | null
}

function normalizeTxKind(type: string): "deposit" | "withdrawal" | "other" {
  const s = String(type || "").toLowerCase()
  if (s.includes("deposit")) return "deposit"
  if (s.includes("withdraw")) return "withdrawal"
  return "other"
}

function formatTxDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function SavingsPageSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientPortalSummaryCardSkeleton />
        <ClientPortalSummaryCardSkeleton />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2].map((i) => (
          <SavingsAccountCardSkeleton key={i} />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
    </div>
  )
}

const formatYAxisTick = (val: number) => {
  if (val >= 1000000) {
    const millions = val / 1000000
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`
  }
  if (val >= 1000) {
    return `${val / 1000}K`
  }
  return String(val)
}

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0f0f12] border border-border/80 p-3 rounded-xl shadow-lg space-y-1.5 text-[11px] text-foreground min-w-[170px]">
        <p className="font-extrabold text-muted-foreground uppercase text-[9px] tracking-wider mb-1">{label}</p>
        {payload.map((pld: any, index: number) => {
          const displayName =
            pld.name === "deposits" ? "Deposited" :
            pld.name === "interest" ? "Interest Earned" :
            pld.name === "withdrawals" ? "Withdrawn" :
            "Closing Balance"
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pld.color }} />
                {displayName}
              </span>
              <span className="font-mono font-bold text-white">UGX {Number(pld.value).toLocaleString()}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return null
}

export default function ClientSavingsPage() {
  const { data, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("savings")
  const [accounts, setAccounts] = useState<SavingsAccount[]>([])
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([])
  const [transactionFilter, setTransactionFilter] = useState("all")
  const [showBalance, setShowBalance] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  // Chart configuration state: Selected period
  const [selectedPeriod, setSelectedPeriod] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("6M")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [savRes, txRes] = await Promise.all([
          fetch("/api/client/savings", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
        ])
        const sav = savRes.ok ? await savRes.json() : { accounts: [] }
        const tx = txRes.ok ? await txRes.json() : { transactions: [] }
        if (cancelled) return
        setAccounts(sav.accounts || [])
        setTransactions(tx.transactions || [])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const savingsTransactions = useMemo(() => {
    return transactions
      .filter((tx) => !!tx.account_id)
      .filter((tx) => {
        if (transactionFilter === "all") return true
        return normalizeTxKind(tx.type) === transactionFilter
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, transactionFilter])

  const totals = useMemo(() => {
    const totalAvailable = accounts.reduce((s, a) => s + Number(a.available_balance || 0), 0)
    const totalBalance = accounts.reduce((s, a) => s + Number(a.total_balance || 0), 0)
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const monthlyGrowth = transactions
      .filter((tx) => !!tx.account_id)
      .reduce((acc, t) => {
        const dt = new Date(t.date)
        if (dt.getFullYear() !== thisYear || dt.getMonth() !== thisMonth) return acc
        const kind = normalizeTxKind(t.type)
        if (kind === "deposit") return acc + Number(t.amount || 0)
        if (kind === "withdrawal") return acc - Number(t.amount || 0)
        return acc
      }, 0)
    return { totalAvailable, totalBalance, monthlyGrowth }
  }, [accounts, transactions])

  // Custom DataTable Columns mapping
  const activityColumns = [
    { key: "date", header: "Date", render: (row: SavingsTransaction) => formatTxDate(row.date) },
    { key: "type", header: "Transaction Type" },
    {
      key: "amount",
      header: "Amount",
      render: (row: SavingsTransaction) => {
        const isCredit = normalizeTxKind(row.type) === "deposit"
        return (
          <span className={cn("font-semibold", isCredit ? "text-emerald-600" : "text-red-600")}>
            {isCredit ? "+" : "−"}UGX {Number(row.amount || 0).toLocaleString()}
          </span>
        )
      }
    },
    { key: "mode", header: "Mode", render: (row: SavingsTransaction) => row.mode || "System" },
    {
      key: "balance",
      header: "Running Balance",
      render: (row: SavingsTransaction) => (
        <span className="font-mono text-muted-foreground text-xs">
          {showBalance && typeof row.balance === "number" ? `UGX ${row.balance.toLocaleString()}` : masked}
        </span>
      )
    }
  ]

  // Periods Growth Line Chart mock data configurations
  const chartDataByPeriod = {
    "1M": [
      { name: "Week 1", deposits: 150000, interest: 12000, withdrawals: 0, balance: 1620000 },
      { name: "Week 2", deposits: 300000, interest: 25000, withdrawals: 50000, balance: 1897000 },
      { name: "Week 3", deposits: 200000, interest: 38000, withdrawals: 0, balance: 2135000 },
      { name: "Week 4", deposits: 150000, interest: 51000, withdrawals: 100000, balance: 2236000 }
    ],
    "3M": [
      { name: "May", deposits: 600000, interest: 90000, withdrawals: 150000, balance: 1540000 },
      { name: "Jun", deposits: 800000, interest: 185000, withdrawals: 200000, balance: 2325000 },
      { name: "Jul", deposits: 500000, interest: 290000, withdrawals: 100000, balance: 3015000 }
    ],
    "6M": [
      { name: "Feb", deposits: 450000, interest: 45000, withdrawals: 0, balance: 495000 },
      { name: "Mar", deposits: 600000, interest: 102000, withdrawals: 150000, balance: 1047000 },
      { name: "Apr", deposits: 750000, interest: 172000, withdrawals: 100000, balance: 1869000 },
      { name: "May", deposits: 600000, interest: 251000, withdrawals: 200000, balance: 2520000 },
      { name: "Jun", deposits: 800000, interest: 345000, withdrawals: 150000, balance: 3515000 },
      { name: "Jul", deposits: 500000, interest: 450000, withdrawals: 100000, balance: 4365000 }
    ],
    "1Y": [
      { name: "Q1", deposits: 1800000, interest: 180000, withdrawals: 400000, balance: 1580000 },
      { name: "Q2", deposits: 2400000, interest: 410000, withdrawals: 600000, balance: 3790000 },
      { name: "Q3", deposits: 2100000, interest: 680000, withdrawals: 300000, balance: 6270000 },
      { name: "Q4", deposits: 2800000, interest: 990000, withdrawals: 800000, balance: 9260000 }
    ],
    "ALL": [
      { name: "2024", deposits: 6500000, interest: 620000, withdrawals: 1800000, balance: 5320000 },
      { name: "2025", deposits: 8200000, interest: 1450000, withdrawals: 2500000, balance: 12470000 },
      { name: "2026", deposits: 5500000, interest: 2510000, withdrawals: 1200000, balance: 19280000 }
    ]
  }

  // Funds Proportion Chart (Doughnut) mapping if multiple accounts
  const fundsProportionData = useMemo(() => {
    if (accounts.length <= 1) return []
    return accounts.map((acc) => ({
      name: acc.account_type,
      value: Number(acc.available_balance || 0)
    }))
  }, [accounts])

  // Check if client has a Fixed Account
  const hasFixedAccount = useMemo(() => {
    return accounts.some((acc) => acc.account_type.toLowerCase().includes("fixed"))
  }, [accounts])

  const PROPORTION_COLORS = ["#f08c2b", "#1f1f24", "#d97706", "#78350f"]

  if (isLoading || guardLoading || !enabled) {
    return <SavingsPageSkeleton />
  }

  if (!currentClient || !institution) return null

  const masked = "••••••"
  const monthlyLabel =
    totals.monthlyGrowth >= 0
      ? `+${formatMoney(Math.abs(totals.monthlyGrowth))}`
      : `−${formatMoney(Math.abs(totals.monthlyGrowth))}`

  // SVG parameters for the 75% target milestone progress ring
  const percentage = 75
  const radius = 36
  const strokeWidth = 6.5
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Cooperative Savings"
        description="Monitor Sacco deposits, targets, and account activity"
        backHref="/client-portal"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={transactionFilter} onValueChange={setTransactionFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBalance((v) => !v)}
              className="gap-2"
              aria-label={showBalance ? "Hide balances" : "Show balances"}
            >
              {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        }
      />

      {/* Portfolio summary cards (restored to original summary design) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientPortalSummaryCard
          variant="savings"
          label="Available balance"
          value={showBalance ? formatMoney(totals.totalAvailable) : masked}
          sub={
            accounts.length === 0
              ? "No accounts yet"
              : `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
          }
          icon={PiggyBank}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="savings"
          label="This month"
          value={showBalance ? monthlyLabel : masked}
          sub={
            totals.monthlyGrowth >= 0
              ? "Net deposits into savings"
              : "Net withdrawals from savings"
          }
          icon={TrendingUp}
          index={1}
        />
      </div>

      {/* Savings Statistics Grid (Simplified Clean Cards) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-[#f08c2b]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Savings Statistics</h3>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Lifetime Deposited</span>
              <p className="text-sm font-bold text-emerald-600">
                {showBalance ? "UGX 8.25M" : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Total Withdrawn</span>
              <p className="text-sm font-bold text-red-500">
                {showBalance ? "UGX 1.80M" : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Interest Earned</span>
              <p className="text-sm font-bold text-[#f08c2b]">
                {showBalance ? "UGX 428.5K" : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Avg. Monthly Savings</span>
              <p className="text-sm font-bold text-foreground">
                {showBalance ? "UGX 380K" : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Highest Deposit</span>
              <p className="text-sm font-bold text-foreground">
                {showBalance ? "UGX 1.50M" : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Savings Streak</span>
              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                <span>7 Months</span>
                <Sparkles className="h-3 w-3 text-[#f08c2b]" />
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Main Grid Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1: Accounts Vaults, Progress, and Proportions */}
        <div className="space-y-6 lg:col-span-1">
          {/* Account cards segment */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#f08c2b]">Accounts</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Your savings cards</h2>
              </div>
              <p className="text-sm font-semibold text-muted-foreground">
                Total: {showBalance ? formatMoney(totals.totalBalance) : masked}
              </p>
            </div>

            {accounts.length > 0 ? (
              <div className="space-y-4">
                {accounts.map((account, i) => (
                  <SavingsAccountCard
                    key={account.id}
                    accountType={account.account_type}
                    accountNumber={account.account_number}
                    availableBalance={formatMoney(Number(account.available_balance || 0))}
                    totalBalance={formatMoney(Number(account.total_balance || 0))}
                    status={account.status}
                    openDate={account.open_date}
                    cardholderName={currentClient.fullName}
                    institutionName={institution.name}
                    balanceHidden={!showBalance}
                    href={`/client-portal/savings/${account.id}`}
                    themeIndex={i}
                    index={i}
                    className="max-w-none"
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
                <PiggyBank className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No savings accounts yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Contact {institution.name} to open a savings account.
                </p>
              </div>
            )}
          </section>

          {/* Target Milestone Progress circle widget */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Target className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Monthly Savings Target</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0">
                  <svg className="h-20 w-20 -rotate-90">
                    <circle
                      className="text-muted/20"
                      strokeWidth={strokeWidth}
                      stroke="currentColor"
                      fill="transparent"
                      r={radius}
                      cx="40"
                      cy="40"
                    />
                    <circle
                      className="text-[#f08c2b]"
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r={radius}
                      cx="40"
                      cy="40"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-sm font-bold text-foreground">{percentage}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goal Progress</p>
                  <h4 className="text-sm font-bold">UGX 225,000 / UGX 300,000</h4>
                  <p className="text-[11px] text-muted-foreground">Keep saving to hit your milestone by the end of July!</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Doughnut Chart for Proportion of Funds in Savings Accounts (ONLY if > 1 account) */}
          {accounts.length > 1 ? (
            <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
                <Coins className="h-4 w-4 text-[#f08c2b]" />
                <CardTitle className="text-sm font-semibold">Funds Proportion</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <div className="h-48 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fundsProportionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        cornerRadius={8}
                        dataKey="value"
                      >
                        {fundsProportionData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={PROPORTION_COLORS[idx % PROPORTION_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        contentStyle={{ background: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                        formatter={(val) => [`UGX ${Number(val).toLocaleString()}`, "Available Balance"]}
                      />
                      <Legend verticalAlign="bottom" height={24} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Column 2 & 3: Line Growth Charts & Fixed Calendar Schedule */}
        <div className="space-y-6 lg:col-span-2">
          {/* Savings Growth Line Chart (Growth over time) */}
          <Card className="border-border/80 shadow-sm overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#f08c2b]" />
                Savings Growth Timeline
              </CardTitle>
              <div className="flex flex-wrap gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
                {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    type="button"
                    className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded transition-colors uppercase tracking-wider outline-none",
                      selectedPeriod === period
                        ? "bg-[#f08c2b] text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {period === "1M" && "1 Month"}
                    {period === "3M" && "3 Months"}
                    {period === "6M" && "6 Months"}
                    {period === "1Y" && "1 Year"}
                    {period === "ALL" && "All Time"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataByPeriod[selectedPeriod]} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#888888" strokeOpacity={0.06} />
                    <XAxis dataKey="name" stroke="#888888" strokeOpacity={0.5} axisLine={false} tickLine={false} />
                    <YAxis
                      stroke="#888888"
                      strokeOpacity={0.5}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatYAxisTick}
                    />
                    <ChartTooltip content={<CustomChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 10 }} />
                    <Line type="monotone" dataKey="deposits" name="deposits" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="interest" name="interest" stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="withdrawals" name="withdrawals" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="balance" name="balance" stroke="#f08c2b" strokeWidth={3} dot={false} activeDot={{ r: 6, stroke: "#18181b", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* CONDITIONAL CALENDAR: Show if Fixed Deposit exists */}
          {hasFixedAccount && <FixedSavingsCalendar />}
        </div>

        {/* Full-width Savings activity ledger */}
        <div className="col-span-full">
          {/* Activity DataTable sheet */}
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
              <CardTitle className="text-base font-semibold">Savings Ledger</CardTitle>
              <span className="text-xs text-muted-foreground">
                {savingsTransactions.length}{" "}
                {savingsTransactions.length === 1 ? "transaction" : "transactions"}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={activityColumns}
                rows={savingsTransactions}
                loading={false}
                emptyMessage="No savings activities found for current filter settings"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}

// Specialized Custom Calendar component showing fixed term deposit milestones
function FixedSavingsCalendar() {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // Fixed Deposit schedule indicator events
  const events: { [key: number]: { type: "deposit" | "unlock"; title: string; desc: string }[] } = {
    12: [{ type: "deposit", title: "Automated Fixed Deposit", desc: "UGX 150,000 auto-transferred into Locked term" }],
    28: [{ type: "unlock", title: "Locked Term Maturity", desc: "UGX 2,500,000 matures (dividend cycle ends)" }]
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const selectedEvents = selectedDay ? events[selectedDay] || [] : []

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm bg-card">
      <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
        <CalendarDays className="h-4.5 w-4.5 text-[#f08c2b]" />
        <CardTitle className="text-sm font-semibold">Fixed Savings Calendar</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Month label */}
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>{monthNames[currentMonth]} {currentYear}</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
            <span key={idx} className="font-semibold text-muted-foreground/60 py-1">{d}</span>
          ))}

          {/* Spacers */}
          {Array(firstDayIndex).fill(null).map((_, idx) => (
            <span key={`empty-${idx}`} className="py-1.5" />
          ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const day = idx + 1
            const hasEvents = !!events[day]
            const isToday = day === today.getDate()
            const isSelected = day === selectedDay

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                type="button"
                className={cn(
                  "relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors font-medium outline-none h-8 w-8 mx-auto",
                  isToday && "bg-muted font-bold text-[#f08c2b]",
                  isSelected && !isToday && "bg-[#f08c2b]/15 text-[#f08c2b]",
                  !isSelected && !isToday && "hover:bg-muted/40"
                )}
              >
                <span>{day}</span>
                {hasEvents && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {events[day].map((ev, evIdx) => (
                      <span
                        key={evIdx}
                        className={cn(
                          "h-1 w-1 rounded-full",
                          ev.type === "deposit" ? "bg-[#f08c2b]" : "bg-emerald-500"
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Event detail section */}
        <div className="border-t border-border/60 pt-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Schedule for {selectedDay ? `${monthNames[currentMonth]} ${selectedDay}` : "Selected Day"}
          </div>
          {selectedEvents.length > 0 ? (
            <div className="space-y-2">
              {selectedEvents.map((ev, idx) => (
                <div key={idx} className="flex gap-2.5 rounded-lg bg-muted/40 p-2 border border-border/40 text-xs">
                  <div
                    className={cn(
                      "w-1 rounded-full shrink-0",
                      ev.type === "deposit" ? "bg-[#f08c2b]" : "bg-emerald-500"
                    )}
                  />
                  <div>
                    <h4 className="font-semibold text-foreground flex items-center gap-1">
                      {ev.type === "unlock" && <Lock className="h-3 w-3 text-emerald-500 shrink-0" />}
                      <span>{ev.title}</span>
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ev.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">No lock-in deposit actions scheduled for this day</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
