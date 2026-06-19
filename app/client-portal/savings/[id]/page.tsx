"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { useClientSession } from "@/components/client-session-provider"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History, ArrowDownRight, ArrowUpRight, Download, ArrowLeft } from "lucide-react"

export default function ClientSavingsDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { formatMoney } = useClientSession()
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("savings")
  const [isLoading, setIsLoading] = useState(true)
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || guardLoading) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/client/savings/${encodeURIComponent(id)}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load account")
        if (cancelled) return
        setAccount(data.account)
        setTransactions(data.transactions || [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load account")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    if (id) load()
    return () => { cancelled = true }
  }, [id, enabled, guardLoading])

  if (isLoading || guardLoading || !enabled) {
    return <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">Loading...</div>
  }

  if (error || !account) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/client-portal/savings"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1"/>Back</Button></Link>
            <h1 className="text-xl font-semibold">Savings Account</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-red-600">{error || "Account not found"}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/client-portal/savings"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1"/>Back</Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{account.account_number}</h1>
            <p className="text-muted-foreground">{account.account_type} • Opened {new Date(account.open_date).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="relative">
          <Button size="sm" variant="outline" disabled>
            <Download className="w-4 h-4 mr-1"/> Statement
          </Button>
          <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
            Coming Soon
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Summary</CardTitle>
          <CardDescription>Live balances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Available Balance</div>
              <div className="text-2xl font-semibold text-primary">{formatMoney(Number(account.available_balance || 0))}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Balance</div>
              <div className="text-xl font-semibold">{formatMoney(Number(account.total_balance || 0))}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="text-sm font-medium">{account.status}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${String(t.type).toLowerCase().includes("deposit") ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                    {String(t.type).toLowerCase().includes("deposit") ? <ArrowDownRight className="w-5 h-5"/> : <ArrowUpRight className="w-5 h-5"/>}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.type}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.date).toLocaleString()} • {t.mode}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${String(t.type).toLowerCase().includes("deposit") ? "text-green-600" : "text-red-600"}`}>
                    {String(t.type).toLowerCase().includes("deposit") ? "+" : "-"}
                    {formatMoney(Number(t.amount || 0))}
                  </div>
                  <div className="text-xs text-muted-foreground">Bal: {formatMoney(Number(t.balance || 0))}</div>
                </div>
              </div>
            ))}
          </div>
          {transactions.length === 0 && (
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
