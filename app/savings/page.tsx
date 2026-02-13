"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import AppLayout from "@/components/layout/app-layout"
import { Search, Plus, Eye, ArrowUpDown, PiggyBank, TrendingUp, Users, DollarSign } from "lucide-react"
import Link from "next/link"

export default function SavingsPage() {
  const [accounts, setAccounts] = useState<Array<any>>([])
  const [transactions, setTransactions] = useState<Array<any>>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let abort = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (searchTerm) params.set("search", searchTerm)
        if (accountTypeFilter !== "all") params.set("account_type", accountTypeFilter)
        if (statusFilter !== "all") params.set("status", statusFilter)
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))
        const res = await fetch(`/api/institution/savings?${params.toString()}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load savings")
        if (abort) return
        setAccounts(data.items || [])
        setTransactions(data.recentTransactions || [])
        setTotal(data.total || 0)
      } catch (e: any) {
        if (!abort) setError(e?.message || "Failed to load savings")
      } finally {
        if (!abort) setLoading(false)
      }
    }
    load()
    return () => { abort = true }
  }, [searchTerm, accountTypeFilter, statusFilter, page, pageSize])

  const filteredAccounts = useMemo(() => accounts, [accounts])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "Voluntary":
        return "default"
      case "Fixed":
        return "secondary"
      case "Shares":
        return "outline"
      default:
        return "outline"
    }
  }

  // Calculate statistics
  const totalAccounts = total
  const activeAccounts = accounts.filter((a) => a.status === "Active").length
  const totalSavings = accounts.reduce((sum, account) => sum + Number(account.total_balance || 0), 0)
  const averageBalance = totalAccounts > 0 ? totalSavings / totalAccounts : 0
  const recentTransactions = transactions

  return (
    <AppLayout>
      <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-balance">Savings & Transactions</h2>
                <p className="text-muted-foreground text-pretty">
                  Manage member savings accounts, process transactions, and track balances.
                </p>
              </div>
              <Link href="/transactions/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Transaction
                </Button>
              </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalAccounts}</div>
                  <p className="text-xs text-muted-foreground">{activeAccounts} active accounts</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
                  <PiggyBank className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalSavings).replace("UGX", "UGX ")}</div>
                  <p className="text-xs text-muted-foreground">Across all accounts</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Balance</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(averageBalance).replace("UGX", "UGX ")}</div>
                  <p className="text-xs text-muted-foreground">Per account</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">This Month</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{transactions.length}</div>
                  <p className="text-xs text-muted-foreground">Transactions processed</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Savings Accounts */}
              <div className="md:col-span-2 space-y-6">
                {/* Filters */}
                <Card>
                  <CardHeader>
                    <CardTitle>Search & Filter Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search by member name or account number..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Account Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="Voluntary">Voluntary</SelectItem>
                          <SelectItem value="Fixed">Fixed</SelectItem>
                          <SelectItem value="Shares">Shares</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Accounts Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Savings Accounts ({total})</CardTitle>
                    <CardDescription>Member savings accounts and current balances.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Member</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Available Balance</TableHead>
                          <TableHead>Total Balance</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <div className="py-6 text-center text-muted-foreground">Loading savings accounts...</div>
                            </TableCell>
                          </TableRow>
                        ) : filteredAccounts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <div className="py-6 text-center text-muted-foreground">No accounts found.</div>
                            </TableCell>
                          </TableRow>
                        ) : filteredAccounts.map((account: any) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{account.account_number}</div>
                                <div className="text-sm text-muted-foreground">
                                  Opened {new Date(account.open_date).toLocaleDateString()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{account.client_name}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getAccountTypeColor(account.account_type)}>{account.account_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{formatCurrency(Number(account.available_balance || 0))}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{formatCurrency(Number(account.total_balance || 0))}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={account.status === "Active" ? "default" : "secondary"}>
                                {account.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Link href={`/savings/${account.id}`}>
                                  <Button variant="ghost" size="icon">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href="/transactions/new">
                                  <Button variant="ghost" size="icon">
                                    <ArrowUpDown className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= Math.ceil(total / pageSize)}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Transactions */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Latest account activities</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentTransactions.map((transaction: any) => (
                        <div key={transaction.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{transaction.memberName}</p>
                            <p className="text-xs text-muted-foreground">
                              {transaction.type} • {transaction.mode}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(transaction.date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-sm font-medium ${
                                transaction.type === "Deposit" || transaction.type === "Loan Disbursement"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {transaction.type === "Deposit" || transaction.type === "Loan Disbursement" ? "+" : "-"}
                              {formatCurrency(Number(transaction.amount || 0))}
                            </p>
                            <p className="text-xs text-muted-foreground">Bal: {formatCurrency(Number(transaction.balance || 0))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        View All Transactions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
    </AppLayout>
  )
}
