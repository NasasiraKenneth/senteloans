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
} from "lucide-react"
import { Button } from "@/components/ui/button"
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

  if (isLoading || guardLoading || !enabled) {
    return <SavingsPageSkeleton />
  }

  if (!currentClient || !institution) return null

  const masked = "••••••"
  const monthlyLabel =
    totals.monthlyGrowth >= 0
      ? `+${formatMoney(Math.abs(totals.monthlyGrowth))}`
      : `−${formatMoney(Math.abs(totals.monthlyGrowth))}`

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <ClientPortalPageHeader
        title="Savings"
        description="Your accounts and recent savings activity"
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

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Accounts</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Your savings cards</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {showBalance ? formatMoney(totals.totalBalance) : masked} total
          </p>
        </div>

        {accounts.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
          <CardTitle className="text-base font-semibold">Savings activity</CardTitle>
          <span className="text-xs text-muted-foreground">
            {savingsTransactions.length}{" "}
            {savingsTransactions.length === 1 ? "transaction" : "transactions"}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {savingsTransactions.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No transactions found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {transactionFilter === "all"
                  ? "Deposits and withdrawals will appear here"
                  : "Try a different filter"}
              </p>
            </div>
          ) : (
            <ul>
              {savingsTransactions.slice(0, 25).map((tx, index) => {
                const kind = normalizeTxKind(tx.type)
                const isCredit = kind === "deposit"
                return (
                  <motion.li
                    key={tx.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.28 }}
                    className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4 last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          kind === "deposit" && "bg-emerald-500/10 text-emerald-600",
                          kind === "withdrawal" && "bg-red-500/10 text-red-600",
                          kind === "other" && "bg-primary/10 text-primary",
                        )}
                      >
                        {kind === "deposit" ? (
                          <ArrowDownRight className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tx.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTxDate(tx.date)}
                          {tx.mode ? ` · ${tx.mode}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          isCredit && showBalance && "text-emerald-600",
                          kind === "withdrawal" && showBalance && "text-red-600",
                        )}
                      >
                        {showBalance ? (
                          <>
                            {isCredit ? "+" : kind === "withdrawal" ? "−" : ""}
                            {formatMoney(Number(tx.amount || 0))}
                          </>
                        ) : (
                          masked
                        )}
                      </p>
                      {typeof tx.balance === "number" ? (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Bal: {showBalance ? formatMoney(tx.balance) : masked}
                        </p>
                      ) : null}
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
