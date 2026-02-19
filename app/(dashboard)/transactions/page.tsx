"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import { Plus, Eye, TrendingUp, TrendingDown, ArrowUpDown, Calendar, CreditCard, Banknote } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"

type TransactionRow = {
  id: string
  transaction_number: string
  memberName: string
  description: string
  amount: number
  mode: string
  date: string
  type: string
  balance: number
  accountNumber: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function TransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadTransactions(queryParams?: object) {
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
      const res = await fetch(`/api/institution/transactions?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load transactions")
      setTransactions(data.items || [])
      setRecentTransactions(data.recentTransactions || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e?.message || "Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTransactions()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadTransactions(params)
  }, [])

  const handleView = (row: TransactionRow) => {
    router.push(`/transactions/${row.id}`)
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
      case "Opening Balance":
        return <TrendingUp className="h-4 w-4 text-green-600" />
      case "Withdrawal":
      case "Loan Repayment":
        return <TrendingDown className="h-4 w-4 text-red-600" />
      default:
        return <ArrowUpDown className="h-4 w-4 text-blue-600" />
    }
  }

  // Calculate statistics
  const totalTransactions = transactions.length
  const totalDeposits = transactions.filter((t) => t.type === "Deposit").length
  const totalWithdrawals = transactions.filter((t) => t.type === "Withdrawal").length
  const totalLoanTransactions = transactions.filter((t) => t.type.includes("Loan")).length

  const totalDepositAmount = transactions
    .filter((t) => t.type === "Deposit" || t.type === "Loan Disbursement" || t.type === "Opening Balance")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalWithdrawalAmount = transactions
    .filter((t) => t.type === "Withdrawal" || t.type === "Loan Repayment")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const netCashFlow = totalDepositAmount - totalWithdrawalAmount

  // DataTable columns
  const columns: DataTableColumn<TransactionRow>[] = [
    {
      key: "transaction_number",
      header: "Transaction ID",
      render: (row) => (
        <div className="font-medium">{row.transaction_number || row.id}</div>
      ),
    },
    {
      key: "memberName",
      header: "Member",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
            <span className="text-[#f08c2b] text-xs font-semibold">{getInitials(row.memberName)}</span>
          </div>
          <div className="font-medium text-sm">{row.memberName || "—"}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => {
        const typeStyles: Record<string, string> = {
          Deposit: "bg-green-100 text-green-700 border border-green-200",
          Withdrawal: "bg-red-100 text-red-700 border border-red-200",
          "Loan Disbursement": "bg-blue-100 text-blue-700 border border-blue-200",
          "Loan Repayment": "bg-purple-100 text-purple-700 border border-purple-200",
          "Fee Payment": "bg-orange-100 text-orange-700 border border-orange-200",
          Transfer: "bg-gray-100 text-gray-700 border border-gray-200",
          "Interest Payment": "bg-yellow-100 text-yellow-700 border border-yellow-200",
          "Opening Balance": "bg-teal-100 text-teal-700 border border-teal-200",
        }
        return (
          <div className="flex items-center space-x-2">
            {getTransactionIcon(row.type)}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeStyles[row.type] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
              {row.type}
            </span>
          </div>
        )
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <div className="font-medium">{formatCurrency(Number(row.amount))}</div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (row) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
          {row.mode}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row) => (
        <div className="text-sm">{new Date(row.date).toLocaleDateString()}</div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row) => (
        <div>
          <div className="font-medium">{formatCurrency(Number(row.balance))}</div>
          {row.type === "Fee Payment" && (
            <div className="text-xs text-muted-foreground">Remaining</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={actions} row={row} />,
    },
  ]

  const actions = [
    {
      label: "View",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4" />,
    },
  ]

  const filterFields: FilterField[] = [
    {
      field: "search",
      label: "Search by member name, transaction ID, or description",
      type: "text",
    },
    {
      field: "type",
      label: "Type",
      options: [
        { value: "Deposit", label: "Deposit" },
        { value: "Withdrawal", label: "Withdrawal" },
        { value: "Loan Disbursement", label: "Loan Disbursement" },
        { value: "Loan Repayment", label: "Loan Repayment" },
        { value: "Fee Payment", label: "Fee Payment" },
      ],
      multiple: false,
      type: "select",
    },
    {
      field: "mode",
      label: "Mode",
      options: [
        { value: "Cash", label: "Cash" },
        { value: "Mobile Money", label: "Mobile Money" },
        { value: "Bank Transfer", label: "Bank Transfer" },
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

            {/* Errors */}
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

            {/* Transactions DataTable */}
            <DataTable<TransactionRow>
              columns={columns}
              rows={transactions.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
              loading={loading}
              title={`All Transactions (${transactions.length}${total > transactions.length ? ` of ${total}` : ""})`}
              filterFields={filterFields}
              onQueryParamsChange={handleQueryParamsChange}
              emptyMessage="No transactions found"
              getRowId={(row) => row.id}
              pagination={{
                page,
                rowsPerPage,
                total: transactions.length,
                onPageChange,
                onRowsPerPageChange,
                rowsPerPageOptions: [10, 25, 50],
              }}
            />
          </div>
    </>
  )
}
