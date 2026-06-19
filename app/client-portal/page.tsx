"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CreditCard,
  PiggyBank,
  CheckCircle,
  Clock,
  Plus,
  Eye,
  EyeOff,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from "lucide-react"
import { useClientSession } from "@/components/client-session-provider"
import { getGreeting } from "@/lib/greeting"
import { cn } from "@/lib/utils"

export default function ClientPortalPage() {
  const { data, clientTerminology, isMoneyLender, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const [clientLoans, setClientLoans] = useState<any[]>([])
  const [clientTransactions, setClientTransactions] = useState<any[]>([])
  const [txAggregates, setTxAggregates] = useState<any>({ totalSavings: 0, totalShares: 0 })
  const [showBalance, setShowBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [loansRes, txRes] = await Promise.all([
          fetch("/api/client/loans", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
        ])
        const loans = loansRes.ok ? await loansRes.json() : { loans: [] }
        const tx = txRes.ok ? await txRes.json() : { transactions: [], aggregates: { totalSavings: 0, totalShares: 0 } }
        if (cancelled) return
        setClientLoans(loans.loans || [])
        setClientTransactions(tx.transactions || [])
        setTxAggregates(tx.aggregates || { totalSavings: 0, totalShares: 0 })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = (() => {
    const totalLoans = clientLoans.reduce((sum, l) => sum + (Number(l.outstandingBalance) || 0), 0)
    const totalSavings = Number(txAggregates?.totalSavings || 0)
    const totalShares = Number(txAggregates?.totalShares || 0)
    const activeLoans = clientLoans.filter((l) => String(l.status) === "Disbursed").length
    return { totalLoans, totalSavings, totalShares, activeLoans, netWorth: totalSavings + totalShares - totalLoans }
  })()

  const getTransactionKind = (type: string) => {
    const s = String(type || "").toLowerCase()
    if (s.includes("deposit")) return "deposit"
    if (s.includes("withdraw")) return "withdrawal"
    return "payment"
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="h-48 animate-pulse rounded-xl bg-muted lg:col-span-2" />
          <div className="h-48 animate-pulse rounded-xl bg-muted lg:col-span-3" />
        </div>
      </div>
    )
  }

  if (!currentClient || !institution) return null

  const hasSavings = institution.config?.modules?.savings
  const hasShares = institution.config?.modules?.shares
  const firstName = currentClient.fullName.split(" ")[0] || currentClient.fullName
  const recentTx = [...clientTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  const statCount = 1 + (hasSavings ? 1 : 0) + (hasShares ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{getGreeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{firstName}</h1>
        </div>
        <Button size="icon" variant="outline" onClick={() => setShowBalance(!showBalance)} className="shrink-0">
          {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Net position</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {showBalance ? formatMoney(summary.netWorth) : "••••••"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link href="/client-portal/apply-loan">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Apply for loan
              </Button>
            </Link>
            <Link href="/client-portal/transactions">
              <Button size="sm" variant="outline">
                View transactions
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid gap-4",
          statCount === 1 && "sm:grid-cols-1",
          statCount === 2 && "sm:grid-cols-2",
          statCount === 3 && "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {hasSavings ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PiggyBank className="h-4 w-4" />
                Savings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{showBalance ? formatMoney(summary.totalSavings) : "••••••"}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              {isMoneyLender ? "Outstanding" : "Loans"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{showBalance ? formatMoney(summary.totalLoans) : "••••••"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary.activeLoans} active</p>
          </CardContent>
        </Card>

        {hasShares ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PieChart className="h-4 w-4" />
                Shares
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{showBalance ? formatMoney(summary.totalShares) : "••••••"}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{clientTerminology} status</span>
              <Badge variant={currentClient.status === "Active" ? "default" : "secondary"}>{currentClient.status}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">KYC</span>
              <Badge variant="outline" className="gap-1">
                {currentClient.kycStatus === "Verified" && <CheckCircle className="h-3 w-3" />}
                {currentClient.kycStatus === "Pending" && <Clock className="h-3 w-3" />}
                {currentClient.kycStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{clientTerminology} no.</span>
              <span className="font-medium">{currentClient.clientNumber}</span>
            </div>
            <Link
              href="/client-portal/profile"
              className="inline-flex items-center pt-1 text-sm font-medium text-foreground hover:underline"
            >
              Manage profile
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Link href="/client-portal/transactions" className="text-sm text-muted-foreground hover:text-foreground">
              See all
            </Link>
          </CardHeader>
          <CardContent>
            {recentTx.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
            ) : (
              <ul className="divide-y">
                {recentTx.map((tx) => {
                  const kind = getTransactionKind(tx.type)
                  return (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted",
                            kind === "deposit" && "text-emerald-600",
                            kind === "withdrawal" && "text-red-600",
                          )}
                        >
                          {kind === "deposit" ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : kind === "withdrawal" ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tx.type}</p>
                          <p className="text-xs text-muted-foreground">{tx.date}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {kind === "deposit" ? "+" : "-"}
                        {formatMoney(tx.amount)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
