"use client"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { useStaffSession } from "@/components/staff-session-provider"
import { ArrowLeft, PiggyBank, TrendingUp, TrendingDown, Calendar, ArrowUpRight, ArrowDownLeft } from "lucide-react"
import Link from "next/link"

export default function UserSavingsPage() {
  const params = useParams()
  const userId = params.id as string
  const { session } = useStaffSession()
  const [user, setUser] = useState<{ id: string; fullName: string; clientNumber: string } | null>(null)
  const [transactions, setTransactions] = useState<Array<{ id: string; type: string; amount: number; mode: string; date: string; description?: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/institution/members/${userId}`).then((r) => r.json()),
      fetch(`/api/institution/transactions?client_id=${userId}&pageSize=100`).then((r) => r.json()),
    ])
      .then(([memberRes, txRes]) => {
        const c = memberRes.member
        if (c) {
          setUser({ id: c.id, fullName: c.full_name, clientNumber: c.member_number })
        }
        const items = (txRes.items ?? []).filter((t: { type: string }) => t.type === "Deposit" || t.type === "Withdrawal")
        setTransactions(
          items.map((t: { id: string; type: string; amount: number; mode: string; date: string; description?: string }) => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            mode: t.mode,
            date: t.date,
            description: t.description,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <>
            <div className="text-center">
              <p>Loading...</p>
            </div>
      </>
    )
  }

  if (!user) {
    const clientTerm = session?.institution?.config?.clientTerminology || "User"
    return (
      <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{clientTerm} Not Found</h1>
              <p className="text-muted-foreground">The requested {clientTerm.toLowerCase()} could not be found.</p>
              <Link href="/users">
                <Button className="mt-4">Back to {clientTerm}s</Button>
              </Link>
            </div>
      </>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-UG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const clientTerm = session?.institution?.config?.clientTerminology || "User"

  // Calculate savings summary
  const deposits = transactions.filter((t) => t.type === "Deposit")
  const withdrawals = transactions.filter((t) => t.type === "Withdrawal")
  const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0)
  const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0)
  const currentBalance = totalDeposits - totalWithdrawals

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href={`/users/${userId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <PiggyBank className="h-5 w-5" />
                  <h1 className="text-3xl font-bold">Savings Overview</h1>
                </div>
                <p className="text-muted-foreground text-pretty">
                  {clientTerm}: {user.fullName} • {clientTerm} ID: {user.clientNumber}
                </p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <PiggyBank className="h-4 w-4 mr-2 text-green-500" />
                  <span className="text-sm">Current Balance</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(currentBalance)}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2 text-green-500" />
                  <span className="text-sm">Total Deposits</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(totalDeposits)}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <TrendingDown className="h-4 w-4 mr-2 text-red-500" />
                  <span className="text-sm">Total Withdrawals</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(totalWithdrawals)}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Transactions</span>
                </div>
                <span className="text-sm font-medium">{transactions.length}</span>
              </div>
            </div>

            {/* Transaction History */}
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-xl font-semibold">Transaction History</h2>
                <p className="text-sm text-muted-foreground">
                  Complete savings transaction history for {user.fullName}
                </p>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <PiggyBank className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Transactions Found</h3>
                  <p className="text-muted-foreground">
                    This {clientTerm.toLowerCase()} has no savings transaction history.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((transaction) => (
                      <div key={transaction.id} className="border border-border rounded-lg p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            {transaction.type === "Deposit" ? (
                              <ArrowUpRight className="h-5 w-5 text-green-500" />
                            ) : (
                              <ArrowDownLeft className="h-5 w-5 text-red-500" />
                            )}
                            <div>
                              <h3 className="font-semibold">{transaction.type}</h3>
                              <p className="text-sm text-muted-foreground">Transaction ID: {transaction.id}</p>
                            </div>
                          </div>
                          <Badge variant={transaction.type === "Deposit" ? "default" : "outline"}>
                            {transaction.type}
                          </Badge>
                        </div>

                        <div className="grid md:grid-cols-4 gap-4">
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Amount
                            </span>
                            <p
                              className={`text-sm font-medium ${
                                transaction.type === "Deposit" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {transaction.type === "Deposit" ? "+" : "-"}
                              {formatCurrency(transaction.amount)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Payment Mode
                            </span>
                            <p className="text-sm font-medium">{transaction.mode}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Date
                            </span>
                            <p className="text-sm font-medium">{formatDate(transaction.date)}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Description
                            </span>
                            <p className="text-sm font-medium">{transaction.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
    </>
  )
}
