"use client"

import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { History, ArrowDownRight, ArrowUpRight, CreditCard } from "lucide-react"

export default function ClientTransactionsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
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
    load()
    return () => { cancelled = true }
  }, [])

  const normalizeType = (t: string) => {
    const s = String(t || "").toLowerCase()
    if (s.includes("deposit")) return "deposit"
    if (s.includes("withdraw")) return "withdrawal"
    if (s.includes("repay") || s.includes("payment")) return "payment"
    return "other"
  }

  const filtered = transactions
    .filter((t) => filter === "all" || normalizeType(t.type) === filter)
    .sort((a: any, b: any) => new Date(b.date) as any - (new Date(a.date) as any))

  if (isLoading) return <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">Loading...</div>

  if (error) return <div className="min-h-[50vh] flex items-center justify-center text-red-600 text-sm">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">Your recent deposits, withdrawals and payments</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="deposit">Deposits</SelectItem>
              <SelectItem value="withdrawal">Withdrawals</SelectItem>
              <SelectItem value="payment">Payments</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Button size="sm" variant="outline" disabled>
              <History className="w-4 h-4 mr-2"/> Export
            </Button>
            <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
              Coming Soon
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${normalizeType(t.type)==="deposit"?"bg-green-100 text-green-600": normalizeType(t.type)==="withdrawal"?"bg-red-100 text-red-600":"bg-blue-100 text-blue-600"}`}>
                    {normalizeType(t.type) === "deposit" ? <ArrowDownRight className="w-5 h-5"/> : normalizeType(t.type) === "withdrawal" ? <ArrowUpRight className="w-5 h-5"/> : <CreditCard className="w-5 h-5"/>}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.type}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.date).toLocaleString()} • {t.mode}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${normalizeType(t.type)==="deposit"?"text-green-600": normalizeType(t.type)==="withdrawal"?"text-red-600":"text-blue-600"}`}>
                    {normalizeType(t.type)==="deposit" ? "+" : normalizeType(t.type)==="withdrawal" ? "-" : ""}UGX {(Number(t.amount||0)/1000).toFixed(0)}K
                  </div>
                  <div className="text-xs text-muted-foreground">Bal: UGX {(Number(t.balance||0)/1000).toFixed(0)}K</div>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <div className="text-sm text-muted-foreground">No transactions found</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
