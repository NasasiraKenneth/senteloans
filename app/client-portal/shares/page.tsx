"use client"

import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
  TrendingUp,
  Target,
  Sparkles,
  Coins,
  Award,
  History,
  Activity,
  Layers,
  PieChart,
  UserCheck,
  BadgePercent,
  TrendingDown,
  Info,
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
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { cn } from "@/lib/utils"

// DataTable component import
import { DataTable } from "@/components/datatables"

// Recharts imports for lines
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from "recharts"

type ShareTransaction = {
  id: string
  date: string
  description: string
  units: number
  unitPrice: number
  totalValue: number
}

function formatTxDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
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
            pld.name === "value" ? "Total Share Value" :
            pld.name === "units" ? "Share Units" :
            pld.name
          const formattedValue = pld.name === "units" 
            ? `${Number(pld.value).toLocaleString()} Units`
            : `UGX ${Number(pld.value).toLocaleString()}`
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pld.color }} />
                {displayName}
              </span>
              <span className="font-mono font-bold text-white">{formattedValue}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return null
}

function SharesPageSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <ClientPortalSummaryCardSkeleton />
        <ClientPortalSummaryCardSkeleton />
        <ClientPortalSummaryCardSkeleton />
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
    </div>
  )
}

export default function ClientSharesPage() {
  const { data, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("shares")
  const [totals, setTotals] = useState<any>({ units: 0, totalValue: 0, lastShareValue: null })
  const [history, setHistory] = useState<ShareTransaction[]>([])
  const [filter, setFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)

  // Chart configuration state: Selected period
  const [selectedPeriod, setSelectedPeriod] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("6M")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const sharesRes = await fetch("/api/client/shares", { cache: "no-store" })
        const shares = sharesRes.ok ? await sharesRes.json() : { totals: { units: 0, totalValue: 0, lastShareValue: null }, history: [] }
        if (cancelled) return
        setTotals(shares.totals || { units: 0, totalValue: 0, lastShareValue: null })
        setHistory(shares.history || [])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (filter === "all") return true
      if (filter === "recent") {
        const dt = new Date(h.date)
        const now = new Date()
        const thirty = 30 * 24 * 60 * 60 * 1000
        return now.getTime() - dt.getTime() <= thirty
      }
      return true
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [history, filter])

  // Custom DataTable Columns mapping for Shares ledger
  const sharesColumns = [
    { key: "date", header: "Date", render: (row: ShareTransaction) => formatTxDate(row.date) },
    { key: "description", header: "Description" },
    {
      key: "units",
      header: "Units Acquired",
      render: (row: ShareTransaction) => (
        <span className="font-semibold text-foreground">
          +{row.units.toLocaleString()} Units
        </span>
      )
    },
    {
      key: "unitPrice",
      header: "Unit Price",
      render: (row: ShareTransaction) => (
        <span className="font-mono text-muted-foreground text-xs">
          UGX {Number(row.unitPrice || 0).toLocaleString()}
        </span>
      )
    },
    {
      key: "totalValue",
      header: "Total Investment",
      render: (row: ShareTransaction) => (
        <span className="font-bold text-emerald-600">
          UGX {Number(row.totalValue || 0).toLocaleString()}
        </span>
      )
    }
  ]

  // Periods Growth Line Chart data configurations
  const chartDataByPeriod = {
    "1M": [
      { name: "Week 1", units: 300, value: 3000000 },
      { name: "Week 2", units: 300, value: 3000000 },
      { name: "Week 3", units: 350, value: 3500000 },
      { name: "Week 4", units: 350, value: 3500000 }
    ],
    "3M": [
      { name: "May", units: 250, value: 2500000 },
      { name: "Jun", units: 300, value: 3000000 },
      { name: "Jul", units: 350, value: 3500000 }
    ],
    "6M": [
      { name: "Feb", units: 150, value: 1500000 },
      { name: "Mar", units: 200, value: 2000000 },
      { name: "Apr", units: 228, value: 2280000 },
      { name: "May", units: 250, value: 2500000 },
      { name: "Jun", units: 300, value: 3000000 },
      { name: "Jul", units: 350, value: 3500000 }
    ],
    "1Y": [
      { name: "Q1", units: 200, value: 2000000 },
      { name: "Q2", units: 250, value: 2500000 },
      { name: "Q3", units: 300, value: 3000000 },
      { name: "Q4", units: 350, value: 3500000 }
    ],
    "ALL": [
      { name: "2024", units: 120, value: 1200000 },
      { name: "2025", units: 220, value: 2200000 },
      { name: "2026", units: 350, value: 3500000 }
    ]
  }

  if (isLoading || guardLoading || !enabled) {
    return <SharesPageSkeleton />
  }

  if (!currentClient || !institution) return null

  // SVG parameters for the 70% minimum capital goal progress ring
  const percentage = 70
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
        title="Cooperative Shares"
        description="Monitor share holdings, target milestones, dividends, and transaction ledger"
        backHref="/client-portal"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="recent">Last 30 Days</SelectItem>
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

      {/* Summary statistics cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ClientPortalSummaryCard
          variant="shares"
          label="Total share value"
          value={formatMoney(Number(totals.totalValue || 0))}
          sub="Current total valuation of holdings"
          icon={PieChart}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Total Units Held"
          value={`${Number(totals.units || 0).toLocaleString()} Shares`}
          sub="Ownership balance inside Sacco capital"
          icon={Layers}
          index={1}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Last Share Value"
          value={totals.lastShareValue != null ? formatMoney(Number(totals.lastShareValue)) : "—"}
          sub="Price paid during last purchase"
          icon={TrendingUp}
          index={2}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Paid-up Share Capital"
          value="UGX 2,000,000"
          sub="Fully paid Sacco equity contribution"
          icon={Award}
          index={3}
        />
      </div>

      {/* Shares Statistics Grid (6 Cards strip) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-[#f08c2b]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cooperative Weight & Yield</h3>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Lifetime Investment</span>
              <p className="text-sm font-bold text-emerald-600">
                UGX 3.50M
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Dividends Received</span>
              <p className="text-sm font-bold text-[#f08c2b]">
                UGX 280.0K
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Holding Weight</span>
              <p className="text-sm font-bold text-foreground">
                0.45%
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Price per Share</span>
              <p className="text-sm font-bold text-foreground">
                UGX 10,000
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Membership Status</span>
              <p className="text-sm font-bold text-foreground">
                Active Cooperator
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">Next Dividend Date</span>
              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                <span>Dec 31, 2026</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Main Grid Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1: Progress Circle & Sacco Standing */}
        <div className="space-y-6 lg:col-span-1">
          {/* Target Milestone Progress circle widget */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Target className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Minimum Share Target</CardTitle>
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
                  <h4 className="text-sm font-bold">350 / 500 Shares</h4>
                  <p className="text-[11px] text-muted-foreground">Own 500 minimum units to reach optimal member dividend dividends tiers.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sacco Membership & Voting Rights Status widget */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <UserCheck className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Voting standing</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2.5">
                <span className="text-muted-foreground font-medium">Assembly Voting Rights</span>
                <Badge className="bg-emerald-500 text-white font-bold">ACTIVE</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                SACCO bylaws require members to hold a minimum of **200 units** to participate in General Assembly resolutions and board elections.
              </p>
              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10.5px] leading-relaxed text-muted-foreground mt-2">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Minimum requirement met: **Yes** (350/200 units). Your membership capital standing is fully compliant.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Column 2 & 3: Share Timeline Chart */}
        <div className="space-y-6 lg:col-span-2">
          {/* Shares growth timeline */}
          <Card className="border-border/80 shadow-sm overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#f08c2b]" />
                Share Capital Timeline
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
                    <Line type="monotone" dataKey="units" name="units" stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="value" name="value" stroke="#f08c2b" strokeWidth={3} dot={false} activeDot={{ r: 6, stroke: "#18181b", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full-width Shares activity ledger */}
        <div className="col-span-full">
          {/* Purchase History DataTable */}
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
              <CardTitle className="text-base font-semibold">Purchase History</CardTitle>
              <span className="text-xs text-muted-foreground">
                {filteredHistory.length}{" "}
                {filteredHistory.length === 1 ? "purchase" : "purchases"}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={sharesColumns}
                rows={filteredHistory}
                loading={false}
                emptyMessage="No share capital purchases found"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
