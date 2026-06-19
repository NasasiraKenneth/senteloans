"use client"

import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History, PieChart, TrendingUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { useClientSession } from "@/components/client-session-provider"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"

export default function ClientSharesPage() {
  const { formatMoney } = useClientSession()
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("shares")
  const [isLoading, setIsLoading] = useState(true)
  const [totals, setTotals] = useState<any>({ units: 0, totalValue: 0, lastShareValue: null })
  const [history, setHistory] = useState<any[]>([])
  const [filter, setFilter] = useState<string>("all")

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
    load()
    return () => { cancelled = true }
  }, [])

  const filteredHistory = history.filter((h) => {
    if (filter === "all") return true
    if (filter === "recent") {
      const dt = new Date(h.date)
      const now = new Date()
      const thirty = 30 * 24 * 60 * 60 * 1000
      return now.getTime() - dt.getTime() <= thirty
    }
    return true
  })

  if (isLoading || guardLoading || !enabled) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Shares</h1>
          <p className="text-muted-foreground">Overview of share holdings and purchase history</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="recent">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Button variant="outline" size="sm" disabled>
              <History className="w-4 h-4 mr-2" /> Export
            </Button>
            <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
              Coming Soon
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="financial-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <PieChart className="h-4 w-4 mr-2 text-primary" /> Total Share Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stat-value">{formatMoney(Number(totals.totalValue || 0))}</div>
            <p className="stat-label">Current total value</p>
          </CardContent>
        </Card>
        <Card className="financial-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stat-value">{Number(totals.units || 0)}</div>
            <p className="stat-label">Shares owned</p>
          </CardContent>
        </Card>
        <Card className="financial-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-primary" /> Last Share Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stat-value">{totals.lastShareValue != null ? formatMoney(Number(totals.lastShareValue)) : "—"}</div>
            <p className="stat-label">Most recent purchase price</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {filteredHistory.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{new Date(row.date).toLocaleDateString()}</div>
                  <div className="text-xs text-muted-foreground">{row.units} units @ {formatMoney(Number(row.shareValue))}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatMoney(Number(row.totalValue))}</div>
                </div>
              </div>
            ))}
          </div>
          {filteredHistory.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No share purchases found</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
