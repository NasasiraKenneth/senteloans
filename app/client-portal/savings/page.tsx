"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Download, TrendingUp, ArrowUpRight, ArrowDownRight, History } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function ClientSavingsPage() {
  const [session, setSession] = useState<any>(null)
  const [currentClient, setCurrentClient] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [clientTransactions, setClientTransactions] = useState<any[]>([])
  const [transactionFilter, setTransactionFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [meRes, savRes, txRes] = await Promise.all([
          fetch("/api/client/me", { cache: "no-store" }),
          fetch("/api/client/savings", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
        ])
        if (!meRes.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent("/client-portal/savings")}`)
          return
        }
        const me = await meRes.json()
        const sav = savRes.ok ? await savRes.json() : { accounts: [] }
        const tx = txRes.ok ? await txRes.json() : { transactions: [] }
        if (cancelled) return
        setSession({ institution: me.institution })
        setCurrentClient(me.client)
        setAccounts(sav.accounts || [])
        setClientTransactions(tx.transactions || [])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  const getFilteredTransactions = () => {
    const normalizeType = (t: string) => {
      const s = String(t || "").toLowerCase()
      if (s.includes("deposit")) return "deposit"
      if (s.includes("withdraw")) return "withdrawal"
      return "other"
    }
    // Savings-related transactions: those linked to an account_id
    let filtered = clientTransactions.filter((tx: any) => !!tx.account_id)
    if (transactionFilter !== "all") {
      filtered = filtered.filter((tx: any) => normalizeType(tx.type) === transactionFilter)
    }
    return filtered.sort((a: any, b: any) => new Date(b.date) as any - (new Date(a.date) as any))
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const filteredTransactions = getFilteredTransactions()
  const totalAvailable = accounts.reduce((s, a) => s + Number(a.available_balance || 0), 0)
  // This month net movement (deposits - withdrawals) from savings transactions
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const monthlyGrowth = filteredTransactions.reduce((acc: number, t: any) => {
    const dt = new Date(t.date)
    if (dt.getFullYear() !== thisYear || dt.getMonth() !== thisMonth) return acc
    const k = String(t.type || "").toLowerCase()
    if (k.includes("deposit")) return acc + Number(t.amount || 0)
    if (k.includes("withdraw")) return acc - Number(t.amount || 0)
    return acc
  }, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Savings</h1>
          <p className="text-gray-600">Track your savings and transaction history</p>
        </div>
        <div className="flex space-x-2">
          <Select value={transactionFilter} onValueChange={setTransactionFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="deposit">Deposits</SelectItem>
              <SelectItem value="withdrawal">Withdrawals</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Button size="sm" variant="outline" disabled>
              <History className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
              Coming Soon
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Savings Accounts</CardTitle>
          <CardDescription>Summary across your savings accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-sm">Available Balance</p>
              <p className="text-2xl font-bold text-primary">UGX {(totalAvailable / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">This Month</p>
              <p className="text-lg font-semibold text-green-600 flex items-center">
                <TrendingUp className="h-4 w-4 mr-1" />
                {monthlyGrowth >= 0 ? "+" : "-"}UGX {(Math.abs(monthlyGrowth) / 1000).toFixed(0)}K
              </p>
            </div>
          </div>

          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Button size="sm" className="w-full" disabled>
                <Plus className="h-4 w-4 mr-2" />
                Deposit
              </Button>
              <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                Coming Soon
              </Badge>
            </div>
            <div className="flex-1 relative">
              <Button size="sm" variant="outline" className="w-full bg-transparent" disabled>
                <Download className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
              <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                Coming Soon
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>Your savings accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {accounts.map((a) => (
              <Link key={a.id} href={`/client-portal/savings/${a.id}`} className="flex items-center justify-between py-3 hover:bg-muted/50 rounded">
                <div>
                  <div className="text-sm font-medium">{a.account_number}</div>
                  <div className="text-xs text-muted-foreground">{a.account_type} • Opened {new Date(a.open_date).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">UGX {(Number(a.available_balance || 0)/1000).toFixed(0)}K</div>
                  <div className="text-xs text-muted-foreground">Available</div>
                </div>
              </Link>
            ))}
            {accounts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No savings accounts found</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      transaction.type === "Deposit" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {transaction.type === "Deposit" ? (
                      <ArrowDownRight className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{transaction.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.date} • {transaction.mode}
                    </p>
                    {transaction.description && (
                      <p className="text-xs text-muted-foreground">{transaction.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-medium ${
                      transaction.type === "Deposit" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {transaction.type === "Deposit" ? "+" : "-"}UGX {(transaction.amount / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance: UGX {(transaction.balance / 1000).toFixed(0)}K
                  </p>
                </div>
              </div>
            ))}
          </div>
          {filteredTransactions.length === 0 && (
            <div className="text-center py-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No transactions found</h3>
              <p className="text-muted-foreground">Try adjusting your filter settings</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
