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
// Live data: fetched from /api/institution/loans and /api/institution/loan-products
import { Search, Plus, Eye, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign } from "lucide-react"
import Link from "next/link"

export default function LoansPage() {
  type LoanUI = {
    id: string
    applicationId: string
    memberName: string
    memberNumber?: string
    loanProduct: string
    interestRate: number
    tenure: number
    principalAmount: number
    status: string
    outstandingBalance: number
    applicationDate: string
    disbursementDate?: string | null
    nextPaymentDate?: string | null
    overdueDays?: number
  }

  const [loans, setLoans] = useState<LoanUI[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [productFilter, setProductFilter] = useState<string>("all")
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  const filteredLoans = loans.filter((loan) => {
    const matchesSearch =
      (loan.memberName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (loan.applicationId?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (loan.loanProduct?.toLowerCase() || "").includes(searchTerm.toLowerCase())
    // Server applies status/product filters; we only apply search locally for UX consistency
    return matchesSearch
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "Disbursed":
        return <DollarSign className="h-4 w-4 text-blue-600" />
      case "Rejected":
        return <XCircle className="h-4 w-4 text-red-600" />
      case "Defaulted":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  // Load products for filter
  useEffect(() => {
    let ignore = false
    async function loadProducts() {
      try {
        const res = await fetch(`/api/institution/loan-products?status=Active&limit=200`)
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        const items = Array.isArray(json.items) ? json.items : []
        setProducts(items.map((p: any) => ({ id: p.id, name: p.product_name })))
      } catch {}
    }
    loadProducts()
    return () => {
      ignore = true
    }
  }, [])

  // Load loans whenever filters/search change
  useEffect(() => {
    let ignore = false
    async function loadLoans() {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        params.set("page", "1")
        params.set("pageSize", "50")
        if (searchTerm.trim()) params.set("q", searchTerm.trim())
        if (statusFilter !== "all") params.set("status", statusFilter)
        if (productFilter !== "all") {
          const prod = products.find((p) => p.name === productFilter)
          if (prod?.id) params.set("product_id", prod.id)
        }
        const url = `/api/institution/loans?${params.toString()}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`failed_to_load: ${res.status}`)
        const json = await res.json()
        if (ignore) return
        const items = Array.isArray(json.items) ? json.items : []
        const mapped: LoanUI[] = items.map((row: any) => ({
          id: row.id,
          applicationId: row.application_id,
          memberName: row.memberName || "",
          memberNumber: row.memberNumber || "",
          loanProduct: row.productName || "",
          interestRate: Number(row.interest_rate || 0),
          tenure: Number(row.tenure_months || 0),
          principalAmount: Number(row.principal_amount || 0),
          status: String(row.status || "Applied"),
          outstandingBalance: Number(row.outstanding_balance || 0),
          applicationDate: row.application_date,
          disbursementDate: row.disbursement_date || null,
          nextPaymentDate: row.next_payment_date || null,
          overdueDays: 0,
        }))
        setLoans(mapped)
      } catch {
        setLoans([])
      } finally {
        setLoading(false)
      }
    }
    loadLoans()
    return () => {
      ignore = true
    }
  }, [searchTerm, statusFilter, productFilter, products])

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Approved":
      case "Disbursed":
        return "default"
      case "Rejected":
      case "Defaulted":
        return "destructive"
      case "Closed":
        return "secondary"
      default:
        return "outline"
    }
  }

  // Calculate statistics
  const totalLoans = loans.length
  const activeLoans = loans.filter((l) => l.status === "Disbursed").length
  const pendingLoans = loans.filter((l) => l.status === "Applied").length
  const defaultedLoans = loans.filter((l) => l.status === "Defaulted").length
  const totalPortfolio = loans.reduce((sum, loan) => sum + loan.principalAmount, 0)
  const outstandingAmount = loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0)

  return (
    <AppLayout>
      <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-balance">Loan Management</h2>
                <p className="text-muted-foreground text-pretty">
                  Manage loan applications, approvals, disbursements, and repayments.
                </p>
              </div>
              <Link href="/loans/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Loan Application
                </Button>
              </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalLoans}</div>
                  <p className="text-xs text-muted-foreground">{pendingLoans} pending approval</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeLoans}</div>
                  <p className="text-xs text-muted-foreground">{defaultedLoans} defaulted</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Portfolio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalPortfolio).replace("UGX", "UGX ")}</div>
                  <p className="text-xs text-muted-foreground">Principal amount</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(outstandingAmount).replace("UGX", "UGX ")}</div>
                  <Progress value={(outstandingAmount / totalPortfolio) * 100} className="mt-2" />
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Search & Filter Loans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by member name, application ID, or loan product..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Applied">Applied</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Disbursed">Disbursed</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                      <SelectItem value="Defaulted">Defaulted</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={productFilter} onValueChange={setProductFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Loans Table */}
            <Card>
              <CardHeader>
                <CardTitle>Loans ({filteredLoans.length})</CardTitle>
                <CardDescription>Complete list of loan applications and their current status.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Application</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Loan Product</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Next Payment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoans.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{loan.applicationId}</div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(loan.applicationDate).toLocaleDateString()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{loan.memberName}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{loan.loanProduct}</div>
                            <div className="text-sm text-muted-foreground">
                              {loan.interestRate}% • {loan.tenure} months
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatCurrency(loan.principalAmount)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(loan.status)}
                            <Badge variant={getStatusVariant(loan.status)}>{loan.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatCurrency(loan.outstandingBalance)}</div>
                          {(loan.overdueDays ?? 0) > 0 && (
                            <div className="text-sm text-red-600">{loan.overdueDays} days overdue</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {loan.nextPaymentDate ? (
                            <div className="text-sm">{new Date(loan.nextPaymentDate).toLocaleDateString()}</div>
                          ) : (
                            <span className="text-sm text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/loans/${loan.id}`}>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
    </AppLayout>
  )
}
