"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { BsFileEarmarkPdf } from "react-icons/bs"
import {
  SavingsAccountCard,
  SavingsAccountCardSkeleton,
} from "@/components/client-portal-account-card"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import {
  CheckCircle,
  Clock,
  Plus,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  History,
  PiggyBank,
  Landmark,
  PieChart,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Calendar,
  Loader2,
  Building2,
} from "lucide-react"
import { useClientSession } from "@/components/client-session-provider"
import { getGreeting } from "@/lib/greeting"
import { cn } from "@/lib/utils"

// Recharts & DataTable imports
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import DataTable from "@/components/datatables/DataTable"

type ClientLoan = {
  id: string
  applicationId: string
  loanProduct: string
  outstandingBalance: number
  status: string
}

type SavingsAccount = {
  id: string
  account_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date?: string
}

type ClientTransaction = {
  id: string
  transaction_number?: string
  account_id?: string
  memberName?: string
  type: string
  amount: number
  balance: number
  mode: string
  date: string
  description?: string
}

function clientInitials(fullName: string): string {
  if (!fullName) return "?"
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const isPaid = data.name === "Paid"
    return (
      <div
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-bold shadow-md border",
          isPaid
            ? "bg-[#0f0f12] text-[#f08c2b] border-[#f08c2b]/20"
            : "bg-[#f08c2b] text-black border-transparent"
        )}
      >
        {data.name}: {data.value}%
      </div>
    )
  }
  return null
}

export default function ClientPortalPage() {
  const { data, isMoneyLender, formatMoney } = useClientSession()
  const { toast } = useToast()
  const currentClient = data?.client
  const institution = data?.institution
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [clientLoans, setClientLoans] = useState<ClientLoan[]>([])
  const [clientTransactions, setClientTransactions] = useState<ClientTransaction[]>([])
  const [txAggregates, setTxAggregates] = useState({ totalSavings: 0, totalShares: 0 })
  const [shareUnits, setShareUnits] = useState(0)
  const [saccoTotalAmount, setSaccoTotalAmount] = useState<number>(0)
  const [showBalance, setShowBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState<number>(0)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const hasSavings = institution?.config?.modules?.savings
  const hasShares = institution?.config?.modules?.shares

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [loansRes, txRes, savRes, sharesRes, saccoRes] = await Promise.all([
          fetch("/api/client/loans", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
          hasSavings ? fetch("/api/client/savings", { cache: "no-store" }) : Promise.resolve(null),
          hasShares ? fetch("/api/client/shares", { cache: "no-store" }) : Promise.resolve(null),
          fetch("/api/client/sacco-amount", { cache: "no-store" }),
        ])

        const loans = loansRes.ok ? await loansRes.json() : { loans: [] }
        const tx = txRes.ok
          ? await txRes.json()
          : { transactions: [], aggregates: { totalSavings: 0, totalShares: 0 } }
        const sav = savRes?.ok ? await savRes.json() : { accounts: [] }
        const shares = sharesRes?.ok ? await sharesRes.json() : { totals: { units: 0 } }
        const sacco = saccoRes.ok ? await saccoRes.json() : { totalAmount: 0 }

        if (cancelled) return
        const txItems = tx.transactions || []
        setClientLoans(loans.loans || [])
        setClientTransactions(txItems)
        setTotal(txItems.length)
        setTxAggregates(tx.aggregates || { totalSavings: 0, totalShares: 0 })
        setSavingsAccounts(sav.accounts || [])
        setShareUnits(Number(shares.totals?.units || 0))
        setSaccoTotalAmount(Number(sacco.totalAmount || 0))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasSavings, hasShares])

  const summary = useMemo(() => {
    const totalLoans = clientLoans.reduce((sum, l) => sum + (Number(l.outstandingBalance) || 0), 0)
    const totalSavingsFromAccounts = savingsAccounts.reduce(
      (sum, a) => sum + Number(a.available_balance || 0),
      0,
    )
    const totalSavings = savingsAccounts.length > 0 ? totalSavingsFromAccounts : Number(txAggregates.totalSavings || 0)
    const totalShares = Number(txAggregates.totalShares || 0)
    const activeLoans = clientLoans.filter((l) => String(l.status) === "Disbursed").length
    const pendingLoans = clientLoans.filter((l) => {
      const s = String(l.status).toLowerCase()
      return s !== "disbursed" && s !== "closed" && s !== "rejected"
    }).length
    return { totalLoans, totalSavings, totalShares, activeLoans, pendingLoans, savingsAccountCount: savingsAccounts.length }
  }, [clientLoans, txAggregates, savingsAccounts])

  const masked = "••••••"

  const shareCountLabel =
    shareUnits === 0
      ? "No shares yet"
      : `${shareUnits.toLocaleString()} ${shareUnits === 1 ? "share" : "shares"}`

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
      case "Opening Balance":
      case "Shares Purchase":
        return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
      case "Withdrawal":
      case "Loan Repayment":
        return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
      default:
        return <ArrowUpDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
    }
  }

  const downloadExport = async (format: "excel" | "pdf") => {
    setExporting(format)
    try {
      const res = await fetch(`/api/client/transactions/export?format=${format}`, {
        method: "GET",
        cache: "no-store",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename =
        match?.[1] ||
        `transactions-statement-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded transaction statement ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description: e?.message || `Failed to download ${format.toUpperCase()}.`,
      })
    } finally {
      setExporting(null)
    }
  }

  const downloadTransactionPdf = async (txId: string, txNumber?: string) => {
    try {
      setDownloadingId(txId)
      const res = await fetch(`/api/client/transactions/${txId}/pdf?download=1`, {
        cache: "no-store",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to download receipt")
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `receipt-${txNumber || txId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast({
        variant: "success",
        title: "Receipt Downloaded",
        description: `Receipt for ${txNumber || txId} downloaded successfully.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: e?.message || "Failed to download transaction receipt PDF.",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  // Columns for DataTable component matching app/(dashboard)/transactions/page.tsx
  const recentTableColumns = [
    {
      key: "transaction_number",
      header: "Transaction ID",
      render: (row: ClientTransaction) => (
        <div className="font-medium text-xs font-mono">{row.transaction_number || row.id}</div>
      ),
    },
    {
      key: "memberName",
      header: "Assigned to",
      render: (row: ClientTransaction) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-linear-to-br from-[#f08c2b] to-[#d97b1e] rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-xs">
            {clientInitials(row.memberName || currentClient?.fullName || "")}
          </div>
          <div className="font-medium text-xs truncate max-w-[130px]">
            {row.memberName || currentClient?.fullName || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row: ClientTransaction) => {
        const typeStyles: Record<string, string> = {
          Deposit: "bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
          Withdrawal: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
          "Loan Disbursement":
            "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
          "Loan Repayment":
            "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
          "Fee Payment":
            "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
          Transfer: "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
          "Interest Payment":
            "bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
          "Opening Balance": "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
          "Shares Purchase":
            "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
        }
        return (
          <div className="flex items-center space-x-2">
            {getTransactionIcon(row.type)}
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
                typeStyles[row.type] || "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
              )}
            >
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
        const isDeposit =
          row.type === "Deposit" ||
          row.type === "Shares Purchase" ||
          row.type === "Loan Disbursement" ||
          row.type === "Opening Balance"
        return (
          <div className={cn("font-semibold text-xs font-mono", isDeposit ? "text-emerald-600 dark:text-emerald-400" : "text-[#f08c2b]")}>
            {formatMoney(Number(row.amount))}
          </div>
        )
      },
    },
    {
      key: "mode",
      header: "Mode",
      render: (row: ClientTransaction) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/60">
          {row.mode}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row: ClientTransaction) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span>
            {new Date(row.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: ClientTransaction) => (
        <div>
          <div className="font-semibold text-xs font-mono text-muted-foreground">
            {formatMoney(Number(row.balance))}
          </div>
          {row.type === "Fee Payment" && (
            <div className="text-[10px] text-muted-foreground">Remaining</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row: ClientTransaction) => {
        const isDownloading = downloadingId === row.id
        return (
          <div className="flex justify-center">
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                void downloadTransactionPdf(row.id, row.transaction_number)
              }}
              disabled={isDownloading}
              title="Download Receipt PDF"
              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
              ) : (
                <BsFileEarmarkPdf className="h-4 w-4 text-rose-600" />
              )}
            </Button>
          </div>
        )
      },
    },
  ]

  // Recharts: Savings Growth Chart Data (Line Chart)
  const savingsChartData = [
    { name: "Jan", balance: 1000000 },
    { name: "Feb", balance: 2000000 },
    { name: "Mar", balance: 3000000 },
    { name: "Apr", balance: 4000000 }
  ]

  // Recharts: Loan Repayment Chart Data (Pie Chart)
  const repaymentChartData = [
    { name: "Paid", value: 68 },
    { name: "Remaining", value: 32 }
  ]
  const PIE_COLORS = ["#f08c2b", "#1f1f24"]

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6">
          <div className="h-20 w-20 animate-pulse rounded-2xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:ml-auto lg:max-w-[340px]">
          {[1, 2].map((i) => (
            <SavingsAccountCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ClientPortalSummaryCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!currentClient || !institution) return null

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-[#f08c2b]/10 via-[#f08c2b]/5 to-transparent" />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl bg-[#f08c2b]/20 blur-md" aria-hidden />
              <Avatar className="relative h-20 w-20 rounded-2xl ring-2 ring-background shadow-md">
                {currentClient.avatarUrl ? (
                  <AvatarImage
                    src={currentClient.avatarUrl}
                    alt={currentClient.fullName}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-2xl bg-[#f08c2b] text-lg font-bold text-white">
                  {clientInitials(currentClient.fullName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{getGreeting()}</p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{currentClient.fullName}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {currentClient.clientNumber}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    currentClient.status === "Active"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : ""
                  )}
                >
                  {currentClient.status}
                </Badge>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  {currentClient.kycStatus === "Verified" && <CheckCircle className="h-3 w-3 text-emerald-600" />}
                  {currentClient.kycStatus === "Pending" && <Clock className="h-3 w-3" />}
                  KYC {currentClient.kycStatus}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-border/80 bg-background/80 backdrop-blur-xs shadow-xs">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f08c2b]/10 text-[#f08c2b]">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total SACCO Amount
                </span>
                <span className="font-mono text-xs font-bold text-foreground">
                  {showBalance ? formatMoney(saccoTotalAmount) : masked}
                </span>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBalance((v) => !v)}
              className="gap-2 h-9"
              title={showBalance ? "Hide balances" : "Show balances"}
            >
              {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Link href="/client-portal/apply-loan">
              <Button size="sm" className="gap-2 shadow-xs bg-[#f08c2b] text-white hover:bg-[#f08c2b]/90 border-transparent cursor-pointer h-9">
                <Plus className="h-4 w-4" />
                Apply for loan
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: content left, widgets right */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(340px,36%)] lg:items-start">
        <div className="space-y-8 min-w-0">
          
          {/* Portfolio summary cards */}
          <div
            className={cn(
              "grid gap-4",
              hasSavings && hasShares ? "sm:grid-cols-3" : hasSavings || hasShares ? "sm:grid-cols-2" : "sm:grid-cols-1",
            )}
          >
            {hasSavings ? (
              <ClientPortalSummaryCard
                variant="savings"
                label="Total savings"
                value={showBalance ? formatMoney(summary.totalSavings) : masked}
                sub={
                  summary.savingsAccountCount > 0
                    ? `${summary.savingsAccountCount} ${summary.savingsAccountCount === 1 ? "account" : "accounts"}`
                    : "No accounts yet"
                }
                href="/client-portal/savings"
                icon={PiggyBank}
                index={0}
              />
            ) : null}
            <ClientPortalSummaryCard
              variant="loans"
              label={isMoneyLender ? "Outstanding balance" : "Total loans"}
              value={showBalance ? formatMoney(summary.totalLoans) : masked}
              sub={
                summary.activeLoans > 0
                  ? `${summary.activeLoans} active${summary.pendingLoans > 0 ? ` · ${summary.pendingLoans} pending` : ""}`
                  : summary.pendingLoans > 0
                    ? `${summary.pendingLoans} pending`
                    : "No active loans"
              }
              href="/client-portal/loans"
              icon={Landmark}
              index={hasSavings ? 1 : 0}
            />
            {hasShares ? (
              <ClientPortalSummaryCard
                variant="shares"
                label="Share holdings"
                value={showBalance ? formatMoney(summary.totalShares) : masked}
                sub={shareCountLabel}
                href="/client-portal/shares"
                icon={PieChart}
                index={hasSavings ? 2 : 1}
              />
            ) : null}
          </div>

          {/* Analytics Charts Grid */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Savings Growth Line Chart */}
            <Card className="border-border/80 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4.5 w-4.5 text-[#f08c2b]" />
                  Savings Growth
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-60 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={savingsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#88888815" />
                      <XAxis dataKey="name" stroke="#88888880" />
                      <YAxis
                        stroke="#88888880"
                        tickFormatter={(value) => `${value / 1000000}M`}
                      />
                      <ChartTooltip
                        contentStyle={{ background: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                        formatter={(val) => [`UGX ${Number(val).toLocaleString()}`, "Savings"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="#f08c2b"
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 1 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Loan Repayment Pie Chart */}
            <Card className="border-border/80 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PieChart className="h-4.5 w-4.5 text-[#f08c2b]" />
                  Loan Repayment Status
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={repaymentChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={100}
                        paddingAngle={5}
                        cornerRadius={17}
                        startAngle={-45}
                        endAngle={310}
                        dataKey="value"
                      >
                        {repaymentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<PieTooltip />} />
                      <Legend verticalAlign="bottom" height={24} iconType="circle" />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent activity datatable with live transactions & matching columns */}
          <Card className="overflow-hidden border-border/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <Link href="/client-portal/transactions">
                <Button size="sm" variant="outline" className="gap-1 text-xs cursor-pointer">
                  View All Transactions
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                title={`Recent Transactions (${Math.min(clientTransactions.length, 10)}${total > 10 ? ` of ${total}` : ""})`}
                columns={recentTableColumns}
                rows={clientTransactions.slice(0, 10)}
                loading={isLoading}
                emptyMessage="No recent transaction activities found"
                exportActions={{
                  onExcel: () => void downloadExport("excel"),
                  onPdf: () => void downloadExport("pdf"),
                  excelDisabled: isLoading || total === 0 || exporting !== null,
                  pdfDisabled: isLoading || total === 0 || exporting !== null,
                  excelLoading: exporting === "excel",
                  pdfLoading: exporting === "pdf",
                }}
              />
            </CardContent>
          </Card>

          <div className="flex justify-center lg:justify-start">
            <Link
              href="/client-portal/profile"
              className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/30 hover:text-[#f08c2b]"
            >
              Manage profile & passport photo
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Sidebar widgets — right column */}
        <aside className="space-y-8 lg:sticky lg:top-6">
          
          {/* Custom Interactive Payments Calendar */}
          <DashboardCalendar />

          {/* Savings accounts cards list */}
          {hasSavings ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4 lg:flex-col lg:items-end lg:text-right">
                <div className="lg:w-full">
                  <div className="flex items-center gap-2 text-primary lg:justify-end">
                    <PiggyBank className="h-4 w-4 text-[#f08c2b]" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Savings accounts</span>
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    {savingsAccounts.length}{" "}
                    {savingsAccounts.length === 1 ? "account" : "accounts"}
                  </h2>
                </div>
                <Link
                  href="/client-portal/savings"
                  className="shrink-0 text-sm text-muted-foreground hover:text-primary"
                >
                  View all
                  <ChevronRight className="ml-0.5 inline h-4 w-4" />
                </Link>
              </div>

              {savingsAccounts.length > 0 ? (
                <div className="flex flex-col items-stretch gap-4 lg:items-end">
                  {savingsAccounts.map((account, i) => (
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
                      className="w-full lg:max-w-[340px]"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center lg:items-end lg:text-right">
                  <PiggyBank className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">No savings accounts yet</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Contact {institution.name} to open a savings account.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </motion.div>
  )
}

// Custom Interactive Calendar component showing scheduled dates
function DashboardCalendar() {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // Repayment, Fixed saving, and Loan maturity dates highlighted on Calendar
  const events: { [key: number]: { type: "repayment" | "saving" | "maturity"; title: string; desc: string }[] } = {
    5: [{ type: "repayment", title: "Loan Repayment Date", desc: "Installment: UGX 350,000" }],
    12: [{ type: "saving", title: "Fixed Account Deposit", desc: "Automated lock-in deposit date" }],
    28: [{ type: "maturity", title: "Loan Maturity Date", desc: "Repayment tenure ends for active loan" }]
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const selectedEvents = selectedDay ? events[selectedDay] || [] : []

  return (
    <Card className="overflow-hidden border-border/80 shadow-xs bg-card">
      <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
        <CalendarClock className="h-4.5 w-4.5 text-[#f08c2b]" />
        <CardTitle className="text-sm font-semibold">Payment Calendar</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Month header */}
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
                  "relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors font-medium outline-hidden h-8 w-8 mx-auto cursor-pointer",
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
                          ev.type === "repayment" && "bg-[#f08c2b]",
                          ev.type === "saving" && "bg-blue-500",
                          ev.type === "maturity" && "bg-red-500"
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
                      ev.type === "repayment" && "bg-[#f08c2b]",
                      ev.type === "saving" && "bg-blue-500",
                      ev.type === "maturity" && "bg-red-500"
                    )}
                  />
                  <div>
                    <h4 className="font-semibold text-foreground">{ev.title}</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ev.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">No payment schedules for this day</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
