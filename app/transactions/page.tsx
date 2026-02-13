"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import AppLayout from "@/components/layout/app-layout"
// Live data: fetched from /api/institution/transactions
import { Search, Plus, Eye, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react"
import Link from "next/link"

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [total, setTotal] = useState<number>(0)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>("")

  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [modeFilter, setModeFilter] = useState<string>("all")

  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))
        if (typeFilter !== "all") params.set("type", typeFilter)
        if (modeFilter !== "all") params.set("mode", modeFilter)
        if (searchTerm.trim()) params.set("search", searchTerm.trim())
        const res = await fetch(`/api/institution/transactions?${params.toString()}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load transactions")
        if (abort) return
        setTransactions(data.items || [])
        setRecentTransactions(data.recentTransactions || [])
        setTotal(data.total || 0)
      } catch (e: any) {
        if (!abort) setError(e?.message || "Failed to load transactions")
      } finally {
        if (!abort) setLoading(false)
      }
    })()
    return () => {
      abort = true
    }
  }, [page, pageSize, typeFilter, modeFilter, searchTerm])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
        return <TrendingUp className="h-4 w-4 text-green-600" />
      case "Withdrawal":
      case "Loan Repayment":
        return <TrendingDown className="h-4 w-4 text-red-600" />
      default:
        return <ArrowUpDown className="h-4 w-4 text-blue-600" />
    }
  }

  const getTransactionVariant = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
        return "default"
      case "Withdrawal":
        return "destructive"
      case "Loan Repayment":
        return "secondary"
      default:
        return "outline"
    }
  }

  // Calculate statistics (based on current page data)
  const totalTransactions = transactions.length
  const totalDeposits = transactions.filter((t) => t.type === "Deposit").length
  const totalWithdrawals = transactions.filter((t) => t.type === "Withdrawal").length
  const totalLoanTransactions = transactions.filter((t) => t.type.includes("Loan")).length

  const totalDepositAmount = transactions
    .filter((t) => t.type === "Deposit" || t.type === "Loan Disbursement")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalWithdrawalAmount = transactions
    .filter((t) => t.type === "Withdrawal" || t.type === "Loan Repayment")
    .reduce((sum, t) => sum + t.amount, 0)
  const netCashFlow = totalDepositAmount - totalWithdrawalAmount

  // Recent transactions loaded from API

  return (
    <AppLayout>
      <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-balance">Transaction Management</h2>
                <p className="text-muted-foreground text-pretty">
                  Monitor all financial transactions, deposits, withdrawals, and loan activities.
                </p>
              </div>
              <Link href="/transactions/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Transaction
                </Button>
              </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalTransactions}</div>
                  <p className="text-xs text-muted-foreground">{totalLoanTransactions} loan-related</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Deposits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalDeposits}</div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(totalDepositAmount).replace("UGX", "UGX ")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Withdrawals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalWithdrawals}</div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(totalWithdrawalAmount).replace("UGX", "UGX ")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(netCashFlow).replace("UGX", "UGX ")}</div>
                  <Progress value={netCashFlow > 0 ? 75 : 25} className="mt-2" />
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Search & Filter Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by member name, transaction ID, or description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Deposit">Deposit</SelectItem>
                      <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                      <SelectItem value="Loan Disbursement">Loan Disbursement</SelectItem>
                      <SelectItem value="Loan Repayment">Loan Repayment</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={modeFilter} onValueChange={setModeFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modes</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Errors / Loading */}
            {error && (
              <Card>
                <CardHeader>
                  <CardTitle>Error</CardTitle>
                  <CardDescription className="text-destructive">{error}</CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Recent Transactions Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest transactions from the past 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentTransactions.map((transaction: any) => (
                    <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getTransactionIcon(transaction.type)}
                        <div>
                          <div className="font-medium">{transaction.memberName}</div>
                          <div className="text-sm text-muted-foreground">{transaction.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(transaction.amount)}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Transactions Table */}
            <Card>
              <CardHeader>
                <CardTitle>All Transactions ({transactions.length}{total ? ` of ${total}` : ""})</CardTitle>
                <CardDescription>Complete list of all financial transactions.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction: any) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="font-medium">{transaction.transaction_number || transaction.id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{transaction.memberName}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getTransactionIcon(transaction.type)}
                            <Badge variant={getTransactionVariant(transaction.type)}>{transaction.type}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatCurrency(transaction.amount)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{transaction.mode}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(transaction.date).toLocaleDateString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatCurrency(transaction.balance)}</div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/transactions/${transaction.id}`}>
                            <Button variant="ghost" size="icon" aria-label="View details">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} • Showing {transactions.length} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      disabled={loading || page * pageSize >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
    </AppLayout>
  )
}
