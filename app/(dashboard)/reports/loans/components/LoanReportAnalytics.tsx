"use client"

import { useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  CreditCard,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { useStaffSession } from "@/components/staff-session-provider"
import { readInstitutionCurrency } from "@/lib/institution-branch-config"
import { Button } from "@/components/ui/button"
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type LoanReportSummary = {
  principal_booked: number
  principal_disbursed?: number
  outstanding: number
  total_amount_paid: number
  total_interest: number
  total_penalties_collected: number
  total_early_payments: number
  avg_late_pay_days: number
  with_balance: number
  overdue: number
  defaulted: number
  pipeline: number
}

export type LoanReportBreakdown = {
  by_status: Array<{ status: string; count: number; principal: number; outstanding: number }>
  by_product: Array<{ name: string; count: number; outstanding: number }>
  by_loan_type: Array<{ loan_type: string; count: number; principal: number }>
  by_month: Array<{ month: string; count: number; principal: number }>
  collections_by_month: Array<{ month: string; interest_collected: number; penalties_collected: number }>
}

const BRAND = {
  black: "#0f0f12",
  orange: "#f08c2b",
  orangeLight: "#fdba74",
  orangeDark: "#c2410c",
  slate: "#52525b",
  muted: "#a1a1aa",
}

const STATUS_COLORS: Record<string, string> = {
  Applied: "#71717a",
  "Under Review": "#a1a1aa",
  Reviewed: "#d4d4d8",
  Approved: BRAND.orange,
  "Partially Disbursed": BRAND.orangeDark,
  "Fully Disbursed": "#ea580c",
  Active: BRAND.orange,
  Closed: BRAND.black,
  Defaulted: "#dc2626",
  Rejected: "#991b1b",
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${Math.round(amount || 0).toLocaleString()}`
}

function formatCompact(amount: number, currency: string) {
  const n = Number(amount || 0)
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`
  return formatMoney(n, currency)
}

function collectionRate(summary: LoanReportSummary) {
  const due = Number(summary.total_amount_paid || 0) + Number(summary.outstanding || 0)
  if (due <= 0) return 0
  return Math.round((Number(summary.total_amount_paid || 0) / due) * 1000) / 10
}

function buildLast12Months(
  rows: Array<{ month: string; interest_collected: number; penalties_collected: number }>,
) {
  const map = new Map(rows.map((r) => [r.month, r]))
  const now = new Date()
  const months: Array<{
    month: string
    label: string
    interest: number
    penalties: number
  }> = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const row = map.get(key)
    months.push({
      month: key,
      label: d.toLocaleString("en", { month: "short" }),
      interest: row?.interest_collected ?? 0,
      penalties: row?.penalties_collected ?? 0,
    })
  }
  return months
}

function formatCollectionsAxisTick(v: number, yMax: number): string {
  let n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return "0"
  if (Math.abs(n - yMax) < 1 || n >= yMax * 0.995) {
    n = yMax
  }
  if (yMax <= 1000 && n >= 1000) return "1K"
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000
    return Number.isInteger(m) ? `${m}M` : `${parseFloat(m.toFixed(1))}M`
  }
  if (Math.abs(n) >= 1_000) {
    const k = n / 1_000
    const label = k >= 10 ? Math.round(k) : parseFloat(k.toFixed(1))
    return label > 0 ? `${label}K` : String(Math.round(n))
  }
  return String(Math.round(n))
}

function buildCollectionsYTicks(yMax: number): number[] {
  if (yMax <= 1000) return [0, 1000]
  if (yMax <= 10_000) return [0, yMax]
  const mid = Math.round(yMax / 2)
  return [0, mid, yMax]
}

/** Y-axis ceiling: at least 1K so the top tick reads "1K" instead of a flat "0K" line. */
function collectionsChartYMax(
  rows: Array<{ interest: number; penalties: number }>,
): number {
  const peak = rows.reduce((m, row) => Math.max(m, row.interest, row.penalties), 0)
  if (peak <= 0) return 1000
  if (peak < 1000) return 1000
  const padded = peak * 1.1
  if (padded >= 1_000_000) return Math.ceil(padded / 100_000) * 100_000
  if (padded >= 1_000) return Math.ceil(padded / 1_000) * 1_000
  return 1000
}

type PieTooltipProps = {
  active?: boolean
  payload?: unknown
  total: number
}

function StatusPieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const row = (payload[0] as { payload?: { fullName?: string; count?: number; fill?: string } })?.payload
  const count = Number(row?.count ?? 0)
  const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f12] px-3 py-2.5 shadow-xl">
      <p className="text-xs font-semibold text-white">{row?.fullName}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#f08c2b]">{count.toLocaleString()}</p>
      <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#f08c2b]" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-white/60">{pct}% of portfolio</p>
    </div>
  )
}

type LineTooltipProps = {
  active?: boolean
  payload?: unknown
  label?: unknown
  currency: string
}

function CollectionLineTooltip({ active, payload, label, currency }: LineTooltipProps) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const entries = payload as ReadonlyArray<{ value?: number | string; dataKey?: string | number; color?: string }>
  return (
    <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 shadow-xl">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{String(label ?? "")}</p>
      {entries.map((entry) => {
        const isInterest = String(entry.dataKey ?? "") === "interest"
        const color = isInterest ? BRAND.orange : BRAND.black
        return (
          <p key={String(entry.dataKey)} className="mt-1 text-sm font-bold tabular-nums" style={{ color }}>
            {isInterest ? "Interest" : "Penalties"}: {formatMoney(Number(entry.value ?? 0), currency)}
          </p>
        )
      })}
    </div>
  )
}

type LoanReportAnalyticsProps = {
  total: number
  summary: LoanReportSummary
  breakdown: LoanReportBreakdown
  /** Optional override; otherwise resolved from staff session / institution config */
  currency?: string
  loading?: boolean
}

export default function LoanReportAnalytics({
  total,
  summary,
  breakdown,
  currency: currencyProp,
  loading = false,
}: LoanReportAnalyticsProps) {
  const { session } = useStaffSession()
  const currency = currencyProp?.trim() || readInstitutionCurrency(session?.institution?.config)

  const statusChartData = useMemo(
    () =>
      breakdown.by_status.map((row) => ({
        name: row.status.length > 12 ? `${row.status.slice(0, 10)}…` : row.status,
        fullName: row.status,
        count: row.count,
        fill: STATUS_COLORS[row.status] || BRAND.slate,
      })),
    [breakdown.by_status],
  )

  const monthlyCollections = useMemo(
    () => buildLast12Months(breakdown.collections_by_month ?? []),
    [breakdown.collections_by_month],
  )

  const collectionsYMax = useMemo(
    () => collectionsChartYMax(monthlyCollections),
    [monthlyCollections],
  )

  const collectionsYTicks = useMemo(
    () => buildCollectionsYTicks(collectionsYMax),
    [collectionsYMax],
  )

  const rate = collectionRate(summary)
  const overdueRate = total > 0 ? Math.round((summary.overdue / total) * 1000) / 10 : 0

  const kpis = [
    {
      label: "Portfolio value",
      value: formatCompact(summary.principal_disbursed ?? summary.principal_booked, currency),
      sub: `${total.toLocaleString()} loans`,
      icon: Wallet,
      accent: true,
    },
    {
      label: "Outstanding",
      value: formatCompact(summary.outstanding, currency),
      sub: `${summary.with_balance} with balance`,
      icon: CreditCard,
    },
    {
      label: "Collected",
      value: formatCompact(summary.total_amount_paid, currency),
      sub: `${rate}% collection rate`,
      icon: CircleDollarSign,
    },
    {
      label: "At risk",
      value: summary.overdue.toLocaleString(),
      sub: `${summary.defaulted} defaulted`,
      icon: AlertTriangle,
      warn: summary.overdue > 0,
    },
  ]

  return (
    <div className="mb-8 space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            whileHover={{ y: -3 }}
          >
            <Card
              className={`relative overflow-hidden border-border/80 bg-card transition-all duration-300 hover:border-[#f08c2b]/40 hover:shadow-lg ${
                kpi.accent ? "ring-1 ring-[#f08c2b]/20" : ""
              }`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#f08c2b]/5 blur-2xl" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <div
                  className={`rounded-lg p-2 ${
                    kpi.warn ? "bg-red-500/10 text-red-500" : "bg-[#f08c2b]/10 text-[#f08c2b]"
                  }`}
                >
                  <kpi.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-extrabold tracking-tight tabular-nums ${loading ? "opacity-50" : ""}`}>
                  {kpi.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Row 1: charts + collection rate (matched height) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,300px)] lg:items-stretch">
        <Card className="flex h-[332px] flex-col overflow-hidden border-border/80 bg-card/80 backdrop-blur-sm">
          <CardContent className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Portfolio charts
              </p>
              <p className="text-[10px] text-muted-foreground">{total.toLocaleString()} loans</p>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
              {/* Status — pie + inline legend */}
              <div className="flex items-center gap-3">
                {statusChartData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No status data</p>
                ) : (
                  <>
                    <div className="h-[140px] w-[140px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={32}
                            outerRadius={58}
                            paddingAngle={2}
                            cornerRadius={5}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="count"
                            activeShape={{ innerRadius: 28, outerRadius: 64, cornerRadius: 6 }}
                          >
                            {statusChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip
                            cursor={false}
                            wrapperStyle={{ outline: "none", zIndex: 20 }}
                            content={(props) => (
                              <StatusPieTooltip
                                active={props.active}
                                payload={props.payload}
                                total={total}
                              />
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="hidden max-h-[140px] w-[108px] shrink-0 flex-col justify-center gap-1 overflow-y-auto sm:flex">
                      {statusChartData.map((row) => (
                        <div key={row.fullName} className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} />
                            <span className="truncate text-muted-foreground">{row.name}</span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Monthly collections */}
              <div className="flex min-h-0 min-w-0 flex-col border-t border-border/40 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Monthly collections
                    </p>
                    <p className="text-[10px] text-muted-foreground">Interest &amp; penalties · 12 mo</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-3 text-[10px]">
                    <span className="flex items-center gap-1.5 font-semibold text-[#f08c2b]">
                      <span className="h-1.5 w-3 shrink-0 rounded-full bg-[#f08c2b]" />
                      <span>Interest</span>
                      <span className="tabular-nums">{formatCompact(summary.total_interest, currency)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-[#0f0f12]">
                      <span className="h-1.5 w-3 shrink-0 rounded-full bg-[#0f0f12]" />
                      <span>Penalties</span>
                      <span className="tabular-nums">{formatCompact(summary.total_penalties_collected, currency)}</span>
                    </span>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyCollections} margin={{ top: 2, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: BRAND.slate }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: BRAND.slate }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatCollectionsAxisTick(Number(v), collectionsYMax)}
                        domain={[0, collectionsYMax]}
                        ticks={collectionsYTicks}
                        allowDecimals={false}
                        width={40}
                      />
                      <Tooltip
                        content={(props) => (
                          <CollectionLineTooltip
                            active={props.active}
                            payload={props.payload}
                            label={props.label}
                            currency={currency}
                          />
                        )}
                      />
                      <Line
                        type="monotone"
                        name="Interest"
                        dataKey="interest"
                        stroke={BRAND.orange}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: BRAND.orange, stroke: "#fff", strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        name="Penalties"
                        dataKey="penalties"
                        stroke={BRAND.black}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: BRAND.black, stroke: "#fff", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collection rate — same row height */}
        <Card className="flex h-[332px] flex-col overflow-hidden border-[#0f0f12]/20 bg-gradient-to-br from-[#0f0f12] to-[#1a1a1f] text-white shadow-lg">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Collection rate</p>
                <p className="mt-1 text-4xl font-extrabold tabular-nums text-[#f08c2b]">{rate}%</p>
                <p className="mt-0.5 text-[11px] text-white/60">Repaid vs total obligation</p>
              </div>
              <div className="rounded-xl bg-[#f08c2b]/15 p-2.5">
                <TrendingUp className="h-5 w-5 text-[#f08c2b]" />
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f08c2b] to-[#fdba74] transition-all duration-500"
                style={{ width: `${Math.min(rate, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
              <div>
                <p className="text-white/50">Interest</p>
                <p className="font-bold text-white">{formatCompact(summary.total_interest, currency)}</p>
              </div>
              <div>
                <p className="text-white/50">Penalties</p>
                <p className="font-bold text-white">{formatCompact(summary.total_penalties_collected, currency)}</p>
              </div>
              <div>
                <p className="text-white/50">Book size</p>
                <p className="font-bold text-white">{total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-white/50">Defaulted</p>
                <p className="font-bold text-white">{summary.defaulted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: supporting insights */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Portfolio health */}
        <Card className="border-border/80 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Portfolio health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Pipeline", value: summary.pipeline, hint: "In review", color: BRAND.orange },
                { label: "Overdue", value: summary.overdue, hint: `${overdueRate}%`, color: "#dc2626", warn: true },
                { label: "Early pay", value: summary.total_early_payments, hint: "On time", color: BRAND.black },
                { label: "Avg late", value: summary.avg_late_pay_days, hint: "Days", color: BRAND.slate, decimal: true },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-lg border border-border/50 bg-muted/10 px-2.5 py-2 text-center"
                >
                  <p className="text-[10px] text-muted-foreground">{row.label}</p>
                  <p
                    className={`text-lg font-extrabold tabular-nums ${row.warn ? "text-red-500" : ""}`}
                    style={!row.warn ? { color: row.color } : undefined}
                  >
                    {row.decimal ? row.value : Number(row.value).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-muted-foreground">{row.hint}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top products */}
        <Card className="border-border/80 xl:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Top products
            </CardTitle>
            <CardDescription className="text-[11px]">By outstanding balance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakdown.by_product.length === 0 ? (
              <p className="text-xs text-muted-foreground">No product data</p>
            ) : (
              breakdown.by_product.slice(0, 4).map((product, i) => {
                const maxOutstanding = breakdown.by_product[0]?.outstanding || 1
                const width = Math.round((product.outstanding / maxOutstanding) * 100)
                return (
                  <div key={product.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-foreground">
                        <span className="mr-1.5 font-bold text-[#f08c2b]">#{i + 1}</span>
                        {product.name}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-foreground">
                        {formatCompact(product.outstanding, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#0f0f12] to-[#f08c2b]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Loan types + action */}
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card className="flex-1 border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Loan types
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {breakdown.by_loan_type.length === 0 ? (
                <p className="text-xs text-muted-foreground">No type data</p>
              ) : (
                breakdown.by_loan_type.map((t) => (
                  <span
                    key={t.loan_type}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#f08c2b]/30 bg-[#f08c2b]/5 px-2.5 py-1 text-xs font-semibold capitalize text-foreground"
                  >
                    {t.loan_type}
                    <span className="rounded-full bg-[#0f0f12] px-1.5 py-0.5 text-[10px] font-bold text-[#f08c2b]">
                      {t.count}
                    </span>
                  </span>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-[#f08c2b]/30 bg-gradient-to-br from-[#f08c2b]/10 to-transparent">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#f08c2b]">Take action</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {summary.overdue > 0
                    ? `${summary.overdue} loan${summary.overdue === 1 ? "" : "s"} need follow-up`
                    : "Portfolio is current"}
                </p>
              </div>
              <Link href={summary.overdue > 0 ? "/loans?status=Active" : "/loans"} className="shrink-0">
                <Button
                  size="sm"
                  className="gap-1.5 bg-[#0f0f12] text-white hover:bg-[#1a1a1f] hover:text-[#f08c2b]"
                >
                  Open
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
