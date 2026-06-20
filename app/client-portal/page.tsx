"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
} from "lucide-react"
import { useClientSession } from "@/components/client-session-provider"
import { getGreeting } from "@/lib/greeting"
import { cn } from "@/lib/utils"

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
  type: string
  amount: number
  date: string
}

function clientInitials(fullName: string): string {
  return fullName
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatTxDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function getTransactionKind(type: string): "deposit" | "withdrawal" | "payment" {
  const s = String(type || "").toLowerCase()
  if (s.includes("deposit")) return "deposit"
  if (s.includes("withdraw")) return "withdrawal"
  return "payment"
}

export default function ClientPortalPage() {
  const { data, isMoneyLender, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [clientLoans, setClientLoans] = useState<ClientLoan[]>([])
  const [clientTransactions, setClientTransactions] = useState<ClientTransaction[]>([])
  const [txAggregates, setTxAggregates] = useState({ totalSavings: 0, totalShares: 0 })
  const [shareUnits, setShareUnits] = useState(0)
  const [showBalance, setShowBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const hasSavings = institution?.config?.modules?.savings
  const hasShares = institution?.config?.modules?.shares

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [loansRes, txRes, savRes, sharesRes] = await Promise.all([
          fetch("/api/client/loans", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
          hasSavings ? fetch("/api/client/savings", { cache: "no-store" }) : Promise.resolve(null),
          hasShares ? fetch("/api/client/shares", { cache: "no-store" }) : Promise.resolve(null),
        ])

        const loans = loansRes.ok ? await loansRes.json() : { loans: [] }
        const tx = txRes.ok
          ? await txRes.json()
          : { transactions: [], aggregates: { totalSavings: 0, totalShares: 0 } }
        const sav = savRes?.ok ? await savRes.json() : { accounts: [] }
        const shares = sharesRes?.ok ? await sharesRes.json() : { totals: { units: 0 } }

        if (cancelled) return
        setClientLoans(loans.loans || [])
        setClientTransactions(tx.transactions || [])
        setTxAggregates(tx.aggregates || { totalSavings: 0, totalShares: 0 })
        setSavingsAccounts(sav.accounts || [])
        setShareUnits(Number(shares.totals?.units || 0))
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

  const recentTx = [...clientTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6)

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl bg-primary/20 blur-md" aria-hidden />
              <Avatar className="relative h-20 w-20 rounded-2xl ring-2 ring-background shadow-md">
                {currentClient.avatarUrl ? (
                  <AvatarImage
                    src={currentClient.avatarUrl}
                    alt={currentClient.fullName}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
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
                <Badge variant={currentClient.status === "Active" ? "default" : "outline"} className="text-[10px]">
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

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBalance((v) => !v)}
              className="gap-2"
            >
              {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {showBalance ? "Hide balances" : "Show balances"}
            </Button>
            <Link href="/client-portal/apply-loan">
              <Button size="sm" className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Apply for loan
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main layout: content left, savings cards right */}
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

          {/* Recent activity */}
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
              <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
              <Link
                href="/client-portal/transactions"
                className="inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                View all
                <ChevronRight className="ml-0.5 h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recentTx.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No transactions yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Deposits and payments will show here</p>
                </div>
              ) : (
                <ul>
                  {recentTx.map((tx, index) => {
                    const kind = getTransactionKind(tx.type)
                    const isCredit = kind === "deposit"
                    return (
                      <motion.li
                        key={tx.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * index, duration: 0.3 }}
                        className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4 last:border-0 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                              kind === "deposit" && "bg-emerald-500/10 text-emerald-600",
                              kind === "withdrawal" && "bg-red-500/10 text-red-600",
                              kind === "payment" && "bg-primary/10 text-primary",
                            )}
                          >
                            {kind === "deposit" ? (
                              <ArrowDownRight className="h-4 w-4" />
                            ) : kind === "withdrawal" ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{tx.type}</p>
                            <p className="text-xs text-muted-foreground">{formatTxDate(tx.date)}</p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular-nums",
                            isCredit && showBalance && "text-emerald-600",
                          )}
                        >
                          {showBalance ? (
                            <>
                              {isCredit ? "+" : "−"}
                              {formatMoney(tx.amount)}
                            </>
                          ) : (
                            masked
                          )}
                        </span>
                      </motion.li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-center lg:justify-start">
            <Link
              href="/client-portal/profile"
              className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-primary"
            >
              Manage profile & passport photo
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Savings accounts — right column */}
        {hasSavings ? (
          <aside className="lg:sticky lg:top-6">
            <div className="mb-4 flex items-end justify-between gap-4 lg:flex-col lg:items-end lg:text-right">
              <div className="lg:w-full">
                <div className="flex items-center gap-2 text-primary lg:justify-end">
                  <PiggyBank className="h-4 w-4" />
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
          </aside>
        ) : null}
      </div>
    </motion.div>
  )
}
