"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  History,
  PiggyBank,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import { SavingsAccountCard, SavingsAccountCardSkeleton } from "@/components/client-portal-account-card"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { useClientSession } from "@/components/client-session-provider"
import { cn } from "@/lib/utils"

type SavingsAccount = {
  id: string
  account_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date?: string
  last_transaction_date?: string
}

type AccountTransaction = {
  id: string
  type: string
  amount: number
  mode?: string
  description?: string
  balance?: number
  date: string
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
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function DetailSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <SavingsAccountCardSkeleton />
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
    </div>
  )
}

export default function ClientSavingsDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { data, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("savings")
  const [isLoading, setIsLoading] = useState(true)
  const [showBalance, setShowBalance] = useState(true)
  const [account, setAccount] = useState<SavingsAccount | null>(null)
  const [transactions, setTransactions] = useState<AccountTransaction[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || guardLoading) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/client/savings/${encodeURIComponent(id)}`, {
          cache: "no-store",
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load account")
        if (cancelled) return
        setAccount(body.account)
        setTransactions(body.transactions || [])
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load account")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    if (id) void load()
    return () => {
      cancelled = true
    }
  }, [id, enabled, guardLoading])

  const openLabel = useMemo(() => {
    if (!account?.open_date) return null
    const d = new Date(account.open_date)
    if (Number.isNaN(d.getTime())) return account.open_date
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
  }, [account?.open_date])

  if (isLoading || guardLoading || !enabled) {
    return <DetailSkeleton />
  }

  if (error || !account || !currentClient || !institution) {
    return (
      <div className="space-y-6">
        <ClientPortalPageHeader
          title="Savings account"
          description="Could not load this account"
          backHref="/client-portal/savings"
        />
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error || "Account not found"}
          </CardContent>
        </Card>
      </div>
    )
  }

  const masked = "••••••"

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <ClientPortalPageHeader
        title={account.account_type}
        description={`${account.account_number}${openLabel ? ` · Opened ${openLabel}` : ""}`}
        backHref="/client-portal/savings"
        backLabel="All savings"
        action={
          <div className="flex items-center gap-2">
            <Badge variant={String(account.status).toLowerCase() === "active" ? "default" : "outline"}>
              {account.status}
            </Badge>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
        <SavingsAccountCard
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
          themeIndex={0}
          index={0}
          className="max-w-[340px]"
        />

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">Balances</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Available
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                {showBalance ? formatMoney(Number(account.available_balance || 0)) : masked}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {showBalance ? formatMoney(Number(account.total_balance || 0)) : masked}
              </p>
            </div>
            <div className="sm:col-span-2 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PiggyBank className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Deposits & withdrawals</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Managed by {institution.name}. Contact your branch for deposits, withdrawals, or
                    statements.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/20 pb-4">
          <CardTitle className="text-base font-semibold">Recent transactions</CardTitle>
          <span className="text-xs text-muted-foreground">Latest 20</span>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Activity on this account will show here</p>
            </div>
          ) : (
            <ul>
              {transactions.map((tx, index) => {
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
                          {formatTxDate(String(tx.date))}
                          {tx.mode ? ` · ${tx.mode}` : ""}
                        </p>
                        {tx.description ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{tx.description}</p>
                        ) : null}
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
