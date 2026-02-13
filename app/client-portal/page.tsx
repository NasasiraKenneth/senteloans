"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import Link from "next/link"
import {
  User,
  CreditCard,
  PiggyBank,
  History,
  CheckCircle,
  Clock,
  Plus,
  Download,
  Eye,
  EyeOff,
  TrendingUp,
  Filter,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { useRouter } from "next/navigation"

export default function ClientPortalPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [session, setSession] = useState<any>(null)
  const [currentClient, setCurrentClient] = useState<any>(null)
  const [clientLoans, setClientLoans] = useState<any[]>([])
  const [clientTransactions, setClientTransactions] = useState<any[]>([])
  const [txAggregates, setTxAggregates] = useState<any>({ totalSavings: 0, totalShares: 0 })
  const [showBalance, setShowBalance] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [transactionFilter, setTransactionFilter] = useState("all")
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [meRes, loansRes, txRes] = await Promise.all([
          fetch("/api/client/me", { cache: "no-store" }),
          fetch("/api/client/loans", { cache: "no-store" }),
          fetch("/api/client/transactions", { cache: "no-store" }),
        ])
        if (!meRes.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent("/client-portal")}`)
          return
        }
        const me = await meRes.json()
        const loans = loansRes.ok ? await loansRes.json() : { loans: [] }
        const tx = txRes.ok ? await txRes.json() : { transactions: [], aggregates: { totalSavings: 0, totalShares: 0 } }
        if (cancelled) return
        setSession({ institution: me.institution })
        setCurrentClient(me.client)
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
  }, [router])

  const calculateFinancialSummary = () => {
    const totalLoans = clientLoans.reduce((sum, loan) => sum + (Number(loan.outstandingBalance) || 0), 0)
    const totalPrincipal = clientLoans.reduce((sum, loan) => sum + (Number(loan.principalAmount) || 0), 0)
    const totalPaid = totalPrincipal - totalLoans
    const activeLoans = clientLoans.filter((loan) => String(loan.status) === "Disbursed").length

    // Aggregate savings and shares from API aggregates
    const totalSavings = Number(txAggregates?.totalSavings || 0)
    const totalShares = Number(txAggregates?.totalShares || 0)

    // Compute this month's net savings movement from transactions (Deposit - Withdrawal)
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const normalizeType = (t: string) => {
      const s = String(t || "").toLowerCase()
      if (s.includes("deposit")) return "deposit"
      if (s.includes("withdraw")) return "withdrawal"
      return "other"
    }
    const monthlyGrowth = clientTransactions.reduce((acc: number, t: any) => {
      const dt = new Date(t.date)
      if (dt.getFullYear() !== thisYear || dt.getMonth() !== thisMonth) return acc
      const kind = normalizeType(t.type)
      if (kind === "deposit") return acc + Number(t.amount || 0)
      if (kind === "withdrawal") return acc - Number(t.amount || 0)
      return acc
    }, 0)

    return {
      totalLoans,
      totalPrincipal,
      totalPaid,
      activeLoans,
      totalSavings,
      monthlyGrowth,
      totalShares,
      repaymentProgress: totalPrincipal > 0 ? (totalPaid / totalPrincipal) * 100 : 0,
    }
  }

  const getFilteredTransactions = () => {
    const normalizeType = (t: string) => {
      const s = String(t || "").toLowerCase()
      if (s.includes("deposit")) return "deposit"
      if (s.includes("withdraw")) return "withdrawal"
      if (s.includes("repay") || s.includes("payment")) return "payment"
      return "other"
    }
    let filtered = [...clientTransactions]
    if (transactionFilter !== "all") {
      filtered = filtered.filter((tx) => normalizeType(tx.type) === transactionFilter)
    }
    return filtered.sort((a: any, b: any) => new Date(b.date) as any - (new Date(a.date) as any))
  }

  const generateStatement = () => {
    // Mock statement generation
    const statement = {
      period:
        dateRange.from && dateRange.to
          ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
          : "Last 30 days",
      transactions: getFilteredTransactions(),
      summary: calculateFinancialSummary(),
    }

    // In real app, this would generate and download a PDF
    console.log("Generated statement:", statement)
    alert("Statement generated successfully! (Demo mode)")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    )
  }

  if (!session || !currentClient) {
    return null
  }

  const institution = session.institution
  const clientTerminology = institution?.config?.clientTerminology || "Member"
  const isMoneyLender = institution?.type === "money-lender"
  const hasSavings = institution?.config?.modules?.savings
  const hasShares = institution?.config?.modules?.shares

  const financialSummary = calculateFinancialSummary()
  const nextPayment = clientLoans.find((loan) => loan.nextPaymentDate)
  const filteredTransactions = getFilteredTransactions()

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {currentClient?.fullName}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hasSavings && (
            <Card className="financial-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <div className="flex items-center">
                    <PiggyBank className="h-4 w-4 mr-2 text-primary" />
                    Total Savings
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowBalance(!showBalance)}
                    className="h-6 w-6 p-0"
                  >
                    {showBalance ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="stat-value">
                  {showBalance ? `UGX ${(financialSummary.totalSavings / 1000).toFixed(0)}K` : "****"}
                </div>
                <div className="flex items-center space-x-1 mt-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <p className="stat-label text-green-600">
                    +UGX {(financialSummary.monthlyGrowth / 1000).toFixed(0)}K this month
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="financial-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <CreditCard className="h-4 w-4 mr-2 text-primary" />
                {isMoneyLender ? "Outstanding Debt" : "Active Loans"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="stat-value">
                {showBalance ? `UGX ${(financialSummary.totalLoans / 1000).toFixed(0)}K` : "****"}
              </div>
              <p className="stat-label">{financialSummary.activeLoans} active loans</p>
            </CardContent>
          </Card>

          {hasShares && (
            <Card className="financial-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <PieChart className="h-4 w-4 mr-2 text-primary" />
                  Share Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="stat-value">
                  {showBalance ? `UGX ${(financialSummary.totalShares / 1000).toFixed(0)}K` : "****"}
                </div>
                <p className="stat-label">Total shares owned</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <User className="h-4 w-4 mr-2" />
              Account Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{clientTerminology} Status</span>
              <Badge variant={currentClient.status === "Active" ? "default" : "secondary"}>
                {currentClient.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">KYC Verification</span>
              <Badge variant={currentClient.kycStatus === "Verified" ? "default" : "outline"}>
                {currentClient.kycStatus === "Verified" && <CheckCircle className="w-3 h-3 mr-1" />}
                {currentClient.kycStatus === "Pending" && <Clock className="w-3 h-3 mr-1" />}
                {currentClient.kycStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center">
                <History className="h-4 w-4 mr-2" />
                Recent Activity
              </CardTitle>
              <Select value={transactionFilter} onValueChange={setTransactionFilter}>
                <SelectTrigger className="w-24 h-8">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="deposit">Deposits</SelectItem>
                  <SelectItem value="withdrawal">Withdrawals</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredTransactions.slice(0, 5).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        transaction.type === "Deposit"
                          ? "bg-green-100 text-green-600"
                          : transaction.type === "Withdrawal"
                            ? "bg-red-100 text-red-600"
                            : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {transaction.type === "Deposit" ? (
                        <ArrowDownRight className="h-4 w-4" />
                      ) : transaction.type === "Withdrawal" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{transaction.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.date} • {transaction.mode}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${
                        transaction.type === "Deposit"
                          ? "text-green-600"
                          : transaction.type === "Withdrawal"
                            ? "text-red-600"
                            : "text-blue-600"
                      }`}
                    >
                      {transaction.type === "Deposit" ? "+" : "-"}UGX {(transaction.amount / 1000).toFixed(0)}K
                    </p>
                    <p className="text-xs text-muted-foreground">Bal: UGX {(transaction.balance / 1000).toFixed(0)}K</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/client-portal/apply-loan" className="w-full">
            <Button className="h-12 w-full">
              <Plus className="h-4 w-4 mr-2" />
              Apply for Loan
            </Button>
          </Link>
          <Button variant="outline" className="h-12 bg-transparent" disabled>
            <Download className="h-4 w-4 mr-2" />
            Get Statement
            <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
          </Button>
        </div>
      </div>
    </div>
  )
}
