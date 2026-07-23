"use client"

import { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  History,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Wallet,
  Activity,
  Info,
  Calendar,
  FileText,
} from "lucide-react"

import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { cn } from "@/lib/utils"

// DataTable component import
import { DataTable } from "@/components/datatables"

// Recharts components for breakdown
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ChartTooltip, Legend } from "recharts"

type ClientTransaction = {
  id: string
  date: string
  type: string
  amount: number
  balance: number
  mode: string
  description?: string
}

function formatTxDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function ClientTransactionsPage() {
  const { formatMoney } = useClientSession()
  const [isLoading, setIsLoading] = useState(true)
  const [transactions, setTransactions] = useState<ClientTransaction[]>([])
  const [filter, setFilter] = useState("all")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/client/transactions", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load transactions")
        if (cancelled) return
        setTransactions(data.transactions || [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load transactions")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const normalizeType = (t: string) => {
    const s = String(t || "").toLowerCase()
    if (s.includes("deposit")) return "deposit"
    if (s.includes("withdraw")) return "withdrawal"
    if (s.includes("repay") || s.includes("payment")) return "payment"
    return "other"
  }

  // Filter & Sort
  const filtered = useMemo(() => {
    return transactions
      .filter((t) => filter === "all" || normalizeType(t.type) === filter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, filter])

  // Aggregate stats
  const depositsTotal = useMemo(() => {
    return transactions
      .filter((t) => normalizeType(t.type) === "deposit")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
  }, [transactions])

  const withdrawalsTotal = useMemo(() => {
    return transactions
      .filter((t) => normalizeType(t.type) === "withdrawal")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
  }, [transactions])

  const paymentsTotal = useMemo(() => {
    return transactions
      .filter((t) => normalizeType(t.type) === "payment")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
  }, [transactions])

  // Custom DataTable Columns configuration
  const activityColumns = [
    {
      key: "date",
      header: "Date & Time",
      render: (row: ClientTransaction) => (
        <span className="text-xs text-muted-foreground font-medium">
          {formatTxDate(row.date)}
        </span>
      ),
    },
    {
      key: "type",
      header: "Transaction Type",
      render: (row: ClientTransaction) => {
        const type = normalizeType(row.type)
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                type === "deposit"
                  ? "bg-emerald-500"
                  : type === "withdrawal"
                  ? "bg-rose-500"
                  : "bg-[#f08c2b]"
              )}
            />
            <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
              {row.type}
            </span>
          </div>
        )
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: (row: ClientTransaction) => {
        const type = normalizeType(row.type)
        const isDeposit = type === "deposit"
        const isWithdraw = type === "withdrawal"
        return (
          <span
            className={cn(
              "font-bold font-mono text-sm",
              isDeposit
                ? "text-emerald-600"
                : isWithdraw
                ? "text-rose-500"
                : "text-foreground"
            )}
          >
            {isDeposit ? "+" : isWithdraw ? "-" : ""} {formatMoney(row.amount)}
          </span>
        )
      },
    },
    {
      key: "mode",
      header: "Payment Mode",
      render: (row: ClientTransaction) => (
        <span className="text-xs font-semibold text-muted-foreground">
          {row.mode}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Running Balance",
      render: (row: ClientTransaction) => (
        <span className="font-semibold text-muted-foreground font-mono text-xs">
          {formatMoney(row.balance)}
        </span>
      ),
    },
  ]

  // Recharts Breakdown Pie Chart configs
  const breakdownData = useMemo(() => {
    return [
      { name: "Deposits", value: depositsTotal || 1 },
      { name: "Withdrawals", value: withdrawalsTotal || 1 },
      { name: "Payments", value: paymentsTotal || 1 },
    ]
  }, [depositsTotal, withdrawalsTotal, paymentsTotal])

  const BREAKDOWN_COLORS = ["#10b981", "#ef4444", "#f08c2b"]

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center">
        <Info className="h-10 w-10 text-rose-500" />
        <div>
          <p className="text-sm font-semibold text-foreground">Failed to load transactions</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Transaction History"
        description="Review all deposits, withdrawals, interest payouts, and loan settlements."
        backHref="/client-portal"
        action={
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
                <SelectItem value="payment">Payments</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled className="relative">
              <History className="w-4 h-4 mr-2" /> Export
              <Badge className="absolute -top-2 -right-2 text-[9px] px-1 bg-[#f08c2b]" variant="secondary">
                SOON
              </Badge>
            </Button>
          </div>
        }
      />

      {/* Dynamic Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ClientPortalSummaryCard
          variant="savings"
          label="Total Deposits"
          value={formatMoney(depositsTotal)}
          sub="Lifetime savings contributions"
          icon={ArrowDownRight}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Total Withdrawals"
          value={formatMoney(withdrawalsTotal)}
          sub="Lifetime cashouts paid"
          icon={ArrowUpRight}
          index={1}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Repayments & Fees"
          value={formatMoney(paymentsTotal)}
          sub="Cooperative settlements"
          icon={CreditCard}
          index={2}
        />
      </div>

      {/* Grid Columns */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1 & 2: Transactions Ledger */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
              <CardTitle className="text-base font-semibold">Ledger Entries</CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                {filtered.length} {filtered.length === 1 ? "entry" : "entries"} listed
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={activityColumns}
                rows={filtered}
                loading={false}
                emptyMessage="No ledger transactions found matching the selected type filter."
              />
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Sidebar Charts & Info */}
        <div className="space-y-6 lg:col-span-1">
          {/* Breakdown Pie Chart */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Activity Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="h-48 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      cornerRadius={8}
                      dataKey="value"
                    >
                      {breakdownData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={BREAKDOWN_COLORS[idx % BREAKDOWN_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{ background: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                      formatter={(val) => [`UGX ${Number(val).toLocaleString()}`, "Valuation"]}
                    />
                    <Legend verticalAlign="bottom" height={24} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Reference guidelines Card */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Reconciliation Terms</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-foreground">Mobile Money (MTN/Airtel)</span>
                <p className="text-muted-foreground leading-relaxed">
                  Cleared automatically within **15 minutes**. Transactions require reference number match.
                </p>
              </div>
              <div className="space-y-1.5 text-xs border-t border-border/40 pt-3">
                <span className="font-bold text-foreground">Bank Transfers</span>
                <p className="text-muted-foreground leading-relaxed">
                  Cleared in **1-2 working days**. Requires direct deposit receipt upload to payments@senteloans.com.
                </p>
              </div>
              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10px] leading-relaxed text-muted-foreground">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Discrepancies in running balances should be reported to the audit committee within **30 days**.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
