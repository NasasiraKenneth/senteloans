"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import {
  TrendingUp,
  Target,
  Sparkles,
  Award,
  Layers,
  PieChart,
  UserCheck,
  Info,
  Download,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// DataTable component import
import { DataTable } from "@/components/datatables"
import { FilterField } from "@/components/datatables/TableFilter"

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
  transaction_id: string | null
  transaction_number: string
  payment_mode?: string
  description: string
  reference_number?: string | null
  units: number
  unitPrice: number
  shareValue: number
  totalValue: number
  date: string
  createdAt?: string
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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <ClientPortalSummaryCardSkeleton />
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
  const { toast } = useToast()

  const [totals, setTotals] = useState<{
    units: number
    totalValue: number
    lastShareValue: number | null
    totalPurchases?: number
  }>({ units: 0, totalValue: 0, lastShareValue: null, totalPurchases: 0 })

  const [cooperativeMetrics, setCooperativeMetrics] = useState<{
    saccoTotalShares: number
    saccoTotalValue: number
    holdingWeight: number
    pricePerShare: number
    minTarget: number
    votingThreshold: number
    membershipStatus: string
  }>({
    saccoTotalShares: 0,
    saccoTotalValue: 0,
    holdingWeight: 0,
    pricePerShare: 50000,
    minTarget: 500,
    votingThreshold: 200,
    membershipStatus: "Active Cooperator",
  })

  const [allPurchases, setAllPurchases] = useState<Array<{ units: number; shareValue: number; totalValue: number; date: string }>>([])
  const [history, setHistory] = useState<ShareTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState<"excel" | "pdf" | null>(null)
  const [downloadingTxId, setDownloadingTxId] = useState<string | null>(null)

  // Chart configuration state: Selected period
  const [selectedPeriod, setSelectedPeriod] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("6M")

  const buildQueryUrl = useCallback((params: Record<string, unknown>, endpoint: string, pageNumber: number, pageSize: number) => {
    const q = new URLSearchParams()
    q.set("page", String(pageNumber + 1))
    q.set("limit", String(pageSize))

    Object.entries(params).forEach(([k, v]) => {
      if (!v) return
      if (typeof v === "object" && "start" in (v as any) && "end" in (v as any)) {
        const range = v as { start?: string; end?: string }
        const start = range.start ? String(range.start).slice(0, 10) : ""
        const end = range.end ? String(range.end).slice(0, 10) : ""
        if (/^\d{4}-\d{2}-\d{2}$/.test(start)) q.set("date_from", start)
        if (/^\d{4}-\d{2}-\d{2}$/.test(end)) q.set("date_to", end)
        return
      }
      if (String(v).trim()) {
        q.set(k, String(v).trim())
      }
    })
    const qs = q.toString()
    return qs ? `${endpoint}?${qs}` : endpoint
  }, [])

  const loadSharesData = useCallback(async (params: Record<string, unknown> = {}, targetPage = page, targetLimit = rowsPerPage) => {
    setIsLoading(true)
    try {
      const url = buildQueryUrl(params, "/api/client/shares", targetPage, targetLimit)
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load member shares")
      const json = await res.json()

      setHistory(json.history || [])
      setTotal(json.total || 0)
      if (json.totals) setTotals(json.totals)
      if (json.cooperativeMetrics) setCooperativeMetrics(json.cooperativeMetrics)
      if (json.allPurchases) setAllPurchases(json.allPurchases)
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Load Error",
        description: (e as Error)?.message || "Failed to load shares data",
      })
    } finally {
      setIsLoading(false)
    }
  }, [buildQueryUrl, page, rowsPerPage, toast])

  useEffect(() => {
    void loadSharesData(activeQueryParams, page, rowsPerPage)
  }, [page, rowsPerPage])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized = params as Record<string, unknown>
    setActiveQueryParams(normalized)
    setPage(0)
    void loadSharesData(normalized, 0, rowsPerPage)
  }, [loadSharesData, rowsPerPage])

  const handlePageChange = useCallback((_: unknown, newPage: number) => {
    setPage(newPage)
  }, [])

  const handleRowsPerPageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10)
    setRowsPerPage(next)
    setPage(0)
  }, [])

  // Export handler for Excel and PDF
  const downloadExport = async (format: "excel" | "pdf") => {
    setIsExporting(format)
    try {
      const q = new URLSearchParams()
      q.set("format", format)
      Object.entries(activeQueryParams).forEach(([k, v]) => {
        if (!v) return
        if (typeof v === "object" && "start" in (v as any) && "end" in (v as any)) {
          const range = v as { start?: string; end?: string }
          const start = range.start ? String(range.start).slice(0, 10) : ""
          const end = range.end ? String(range.end).slice(0, 10) : ""
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) q.set("date_from", start)
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) q.set("date_to", end)
          return
        }
        if (String(v).trim()) {
          q.set(k, String(v).trim())
        }
      })

      const exportUrl = `/api/client/shares/export?${q.toString()}`
      const res = await fetch(exportUrl, { method: "GET", cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
      }

      const blob = await res.blob()
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename =
        match?.[1] ||
        `shares-statement-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`

      const urlBlob = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = urlBlob
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(urlBlob)

      toast({
        variant: "default",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully exported shares statement as ${format.toUpperCase()}.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: e?.message || "Failed to generate shares export.",
      })
    } finally {
      setIsExporting(null)
    }
  }

  // Individual transaction receipt download
  const handleDownloadTxReceipt = async (row: ShareTransaction) => {
    if (!row.transaction_id) {
      // Export single-row statement PDF
      await downloadExport("pdf")
      return
    }

    setDownloadingTxId(row.id)
    try {
      const res = await fetch(`/api/institution/transactions/${row.transaction_id}/pdf`, {
        cache: "no-store",
      })
      if (!res.ok) {
        throw new Error("Receipt PDF not found")
      }
      const blob = await res.blob()
      const urlBlob = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = urlBlob
      a.download = `receipt-${row.transaction_number || row.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(urlBlob)
      toast({
        variant: "default",
        title: "Receipt Downloaded",
        description: `Receipt for ${row.transaction_number} downloaded.`,
      })
    } catch {
      // Fallback to export
      await downloadExport("pdf")
    } finally {
      setDownloadingTxId(null)
    }
  }

  // Filter fields configuration for DataTable
  const filterFields: FilterField[] = useMemo(
    () => [
      {
        field: "search",
        label: "Search by Txn #, description...",
        type: "text",
      },
      {
        field: "date",
        label: "Date",
        type: "date-range",
      },
    ],
    []
  )

  // Custom DataTable Columns mapping for Shares ledger
  const sharesColumns = useMemo(
    () => [
      {
        key: "transaction_number",
        header: "Transaction #",
        render: (row: ShareTransaction) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-foreground">
              {row.transaction_number}
            </span>
            {row.payment_mode && (
              <span className="text-[11px] text-muted-foreground">{row.payment_mode}</span>
            )}
          </div>
        ),
      },
      {
        key: "units",
        header: "Units Acquired",
        render: (row: ShareTransaction) => (
          <div className="flex items-center gap-1">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              +{row.units.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">Shares</span>
          </div>
        ),
      },
      {
        key: "unitPrice",
        header: "Unit Price",
        render: (row: ShareTransaction) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatMoney(row.unitPrice || 0)}
          </span>
        ),
      },
      {
        key: "totalValue",
        header: "Total",
        render: (row: ShareTransaction) => (
          <span className="font-bold text-foreground">
            {formatMoney(row.totalValue || 0)}
          </span>
        ),
      },
      {
        key: "date",
        header: "Purchase Date",
        render: (row: ShareTransaction) => (
          <span className="text-xs text-muted-foreground">{formatTxDate(row.date)}</span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: ShareTransaction) => {
          const isBusy = downloadingTxId === row.id
          return (
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                disabled={isBusy}
                onClick={() => void handleDownloadTxReceipt(row)}
                title="Download Receipt / Statement"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
            </div>
          )
        },
      },
    ],
    [downloadingTxId, formatMoney]
  )

  // Dynamic Period timeline generation from actual purchases
  const chartDataByPeriod = useMemo(() => {
    if (!allPurchases || allPurchases.length === 0) {
      return {
        "1M": [{ name: "W1", units: 0, value: 0 }, { name: "W2", units: 0, value: 0 }, { name: "W3", units: 0, value: 0 }, { name: "W4", units: 0, value: 0 }],
        "3M": [{ name: "M1", units: 0, value: 0 }, { name: "M2", units: 0, value: 0 }, { name: "M3", units: 0, value: 0 }],
        "6M": [{ name: "M1", units: 0, value: 0 }, { name: "M2", units: 0, value: 0 }, { name: "M3", units: 0, value: 0 }, { name: "M4", units: 0, value: 0 }, { name: "M5", units: 0, value: 0 }, { name: "M6", units: 0, value: 0 }],
        "1Y": [{ name: "Q1", units: 0, value: 0 }, { name: "Q2", units: 0, value: 0 }, { name: "Q3", units: 0, value: 0 }, { name: "Q4", units: 0, value: 0 }],
        "ALL": [{ name: new Date().getFullYear().toString(), units: totals.units || 0, value: totals.totalValue || 0 }],
      }
    }

    const buildTimeline = (monthsBack: number, stepLabel: "month" | "week" | "quarter" | "year") => {
      const now = new Date()
      const points: Array<{ name: string; units: number; value: number }> = []

      if (stepLabel === "week") {
        for (let i = 3; i >= 0; i--) {
          const cutoff = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
          const cum = allPurchases.filter(p => new Date(p.date) <= cutoff)
          const units = cum.reduce((s, p) => s + p.units, 0)
          const value = cum.reduce((s, p) => s + p.totalValue, 0)
          points.push({ name: `W${4 - i}`, units, value })
        }
      } else if (stepLabel === "month") {
        for (let i = monthsBack - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
          const cum = allPurchases.filter(p => new Date(p.date) <= endOfMonth)
          const units = cum.reduce((s, p) => s + p.units, 0)
          const value = cum.reduce((s, p) => s + p.totalValue, 0)
          const monthName = d.toLocaleDateString(undefined, { month: "short" })
          points.push({ name: monthName, units, value })
        }
      } else if (stepLabel === "quarter") {
        for (let i = 3; i >= 0; i--) {
          const cutoff = new Date(now.getFullYear(), now.getMonth() - i * 3 + 1, 0)
          const cum = allPurchases.filter(p => new Date(p.date) <= cutoff)
          const units = cum.reduce((s, p) => s + p.units, 0)
          const value = cum.reduce((s, p) => s + p.totalValue, 0)
          points.push({ name: `Q${4 - i}`, units, value })
        }
      } else {
        const years = Array.from(new Set(allPurchases.map(p => new Date(p.date).getFullYear()))).sort()
        if (years.length === 0) years.push(now.getFullYear())
        for (const yr of years) {
          const endOfYear = new Date(yr, 11, 31)
          const cum = allPurchases.filter(p => new Date(p.date) <= endOfYear)
          const units = cum.reduce((s, p) => s + p.units, 0)
          const value = cum.reduce((s, p) => s + p.totalValue, 0)
          points.push({ name: String(yr), units, value })
        }
      }
      return points
    }

    return {
      "1M": buildTimeline(1, "week"),
      "3M": buildTimeline(3, "month"),
      "6M": buildTimeline(6, "month"),
      "1Y": buildTimeline(12, "quarter"),
      "ALL": buildTimeline(0, "year"),
    }
  }, [allPurchases, totals])

  if (guardLoading || !enabled) {
    return <SharesPageSkeleton />
  }

  if (!currentClient || !institution) return null

  // SVG parameters for the minimum capital goal progress ring
  const targetUnits = cooperativeMetrics.minTarget || 500
  const percentage = Math.min(100, Math.round(((totals.units || 0) / targetUnits) * 100))
  const radius = 36
  const strokeWidth = 6.5
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const isVotingEligible = (totals.units || 0) >= (cooperativeMetrics.votingThreshold || 200)

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
          sub="Ownership balance inside SACCO capital"
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
          value={formatMoney(Number(totals.totalValue || 0))}
          sub="Fully paid SACCO equity contribution"
          icon={Award}
          index={3}
        />
      </div>


      {/* Main Grid Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1: Progress Circle & SACCO Standing */}
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
                  <h4 className="text-sm font-bold">
                    {(totals.units || 0).toLocaleString()} / {targetUnits.toLocaleString()} Shares
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Own {targetUnits.toLocaleString()} minimum units to reach optimal member dividend tiers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SACCO Membership & Voting Rights Status widget */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <UserCheck className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Voting standing</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2.5">
                <span className="text-muted-foreground font-medium">Assembly Voting Rights</span>
                <Badge className={isVotingEligible ? "bg-emerald-500 text-white font-bold" : "bg-amber-500 text-white font-bold"}>
                  {isVotingEligible ? "ACTIVE" : "INCOMPLETE"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                SACCO bylaws require members to hold a minimum of **{cooperativeMetrics.votingThreshold} units** to participate in General Assembly resolutions and board elections.
              </p>
              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10.5px] leading-relaxed text-muted-foreground mt-2">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Minimum requirement met: **{isVotingEligible ? "Yes" : "No"}** ({(totals.units || 0).toLocaleString()}/{cooperativeMetrics.votingThreshold} units). {isVotingEligible ? "Your membership capital standing is fully compliant." : "Purchase additional shares to activate voting rights."}
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
          <DataTable
            title={`Purchase History (${history.length}${total > history.length ? ` of ${total}` : ""})`}
            columns={sharesColumns}
            rows={history}
            loading={isLoading}
            emptyMessage="No share capital purchases found"
            filterFields={filterFields}
            onQueryParamsChange={handleQueryParamsChange}
            pagination={{
              page,
              rowsPerPage,
              total,
              onPageChange: handlePageChange,
              onRowsPerPageChange: handleRowsPerPageChange,
              rowsPerPageOptions: [10, 25, 50],
            }}
            exportActions={{
              onExcel: () => void downloadExport("excel"),
              onPdf: () => void downloadExport("pdf"),
              excelDisabled: isLoading || total === 0 || isExporting !== null,
              pdfDisabled: isLoading || total === 0 || isExporting !== null,
              excelLoading: isExporting === "excel",
              pdfLoading: isExporting === "pdf",
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}
