"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import { Plus, Eye, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign, Calendar } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"

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

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function LoansPage() {
  const router = useRouter()
  const [loans, setLoans] = useState<LoanUI[]>([])
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

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
        return <XCircle className="h-4 w-4 text-gray-600" />
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

  async function loadLoans(queryParams?: object) {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      params.set("page", "1")
      params.set("pageSize", "200")
      const res = await fetch(`/api/institution/loans?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`failed_to_load: ${res.status}`)
      const json = await res.json()
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
    } catch (e: any) {
      setError(e?.message || "Failed to load loans")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLoans()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadLoans(params)
  }, [])

  const handleView = (row: LoanUI) => {
    router.push(`/loans/${row.id}`)
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Approved":
        return "bg-green-100 text-green-700 border border-green-200"
      case "Disbursed":
        return "bg-blue-100 text-blue-700 border border-blue-200"
      case "Rejected":
        return "bg-gray-100 text-gray-700 border border-gray-200"
      case "Defaulted":
        return "bg-red-100 text-red-700 border border-red-200"
      case "Closed":
        return "bg-gray-100 text-gray-700 border border-gray-200"
      default:
        return "bg-yellow-100 text-yellow-700 border border-yellow-200"
    }
  }

  // Calculate statistics
  const totalLoans = loans.length
  const activeLoans = loans.filter((l) => l.status === "Disbursed").length
  const pendingLoans = loans.filter((l) => l.status === "Applied").length
  const defaultedLoans = loans.filter((l) => l.status === "Defaulted").length
  const totalPortfolio = loans.reduce((sum, loan) => sum + loan.principalAmount, 0)
  const outstandingAmount = loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0)

  // DataTable columns
  const columns: DataTableColumn<LoanUI>[] = [
    {
      key: "applicationId",
      header: "Application",
      render: (row) => (
        <div>
          <div className="font-medium">{row.applicationId}</div>
        </div>
      ),
    },
    {
      key: "memberName",
      header: "Member",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{getInitials(row.memberName)}</span>
          </div>
          <div className="font-medium text-gray-900">{row.memberName}</div>
        </div>
      ),
    },
    {
      key: "loanProduct",
      header: "Loan Product",
      render: (row) => (
        <div className="flex items-center space-x-1">
          <div className="font-medium">{row.loanProduct} &bull;</div>
          <div className="text-sm text-muted-foreground">
            {row.interestRate}%
          </div>
        </div>
      ),
    },
    {
      key: "principalAmount",
      header: "Amount",
      render: (row) => (
        <div className="font-medium">{formatCurrency(row.principalAmount)}</div>
      ),
    },
    {
      key: "applicationDate",
      header: "Application Date",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm text-gray-600">{new Date(row.applicationDate).toLocaleDateString()}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex items-center space-x-2">
          {getStatusIcon(row.status)}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusVariant(row.status)}`}>
            {row.status}
          </span>
        </div>
      ),
    },
    {
      key: "tenure",
      header: "Remaining Tenure",
      render: (row) => (
        <div className="font-medium text-muted-foreground">{row.tenure} months</div>
      ),
    },
    {
      key: "outstandingBalance",
      header: "Outstanding",
      render: (row) => (
        <div>
          <div className="font-medium">{formatCurrency(row.outstandingBalance)}</div>
          {(row.overdueDays ?? 0) > 0 && (
            <div className="text-sm text-red-600">{row.overdueDays} days overdue</div>
          )}
        </div>
      ),
    },
    {
      key: "nextPaymentDate",
      header: "Next Payment",
      render: (row) =>
        row.nextPaymentDate ? (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <div className="text-sm">{new Date(row.nextPaymentDate).toLocaleDateString()}</div>
          </div>
        ) : (
          <span className="flex text-sm text-muted-foreground justify-center ">-</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <div className="flex justify-center"><ActionButtons actions={loanActions} row={row} /></div>,
    },
  ]

  const loanActions = [
    {
      label: "View",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4" />,
    },
  ]

  const filterFields: FilterField[] = [
    {
      field: "q",
      label: "Search by member name, application ID, or loan product",
      type: "text",
    },
    {
      field: "status",
      label: "Status",
      options: [
        { value: "Applied", label: "Applied" },
        { value: "Approved", label: "Approved" },
        { value: "Disbursed", label: "Disbursed" },
        { value: "Rejected", label: "Rejected" },
        { value: "Closed", label: "Closed" },
        { value: "Defaulted", label: "Defaulted" },
      ],
      multiple: false,
      type: "select",
    },
  ]

  return (
    <>
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
                  <Progress value={totalPortfolio > 0 ? (outstandingAmount / totalPortfolio) * 100 : 0} className="mt-2" />
                </CardContent>
              </Card>
            </div>

            {/* Loans DataTable */}
            {error && <div className="text-sm text-red-600">{error}</div>}
            <DataTable<LoanUI>
              columns={columns}
              rows={loans.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
              loading={loading}
              title={`Loans (${loans.length})`}
              filterFields={filterFields}
              onQueryParamsChange={handleQueryParamsChange}
              emptyMessage="No loans found"
              getRowId={(row) => row.id}
              pagination={{
                page,
                rowsPerPage,
                total: loans.length,
                onPageChange,
                onRowsPerPageChange,
              }}
            />
          </div>
    </>
  )
}
