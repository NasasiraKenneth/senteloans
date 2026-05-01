"use client"

import type React from "react"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { useToast } from "@/components/ui/toast"
import EditAccount from "../edit_account/edit"
import type { SavingsAccountFormValues } from "../forms/accountForm"
import type { FilterField } from "@/components/datatables/TableFilter"
import { downloadAccountStatementExport } from "./export/export"

import { ArrowLeft, PiggyBank, User, ArrowUpDown, TrendingUp, Edit } from "lucide-react"
import Link from "next/link"

const TRANSACTION_TYPE_OPTIONS = [
  { value: "Deposit", label: "Deposit" },
  { value: "Withdrawal", label: "Withdrawal" },
  { value: "Opening Balance", label: "Opening Balance" },
  { value: "Loan Repayment", label: "Loan Repayment" },
  { value: "Membership Fee", label: "Membership Fee" },
  { value: "Shares Purchase", label: "Shares Purchase" },
]

const TRANSACTION_MODE_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

const TRANSACTION_TYPE_STYLES: Record<string, string> = {
  Deposit: "bg-green-100 text-green-700 border border-green-200",
  Withdrawal: "bg-red-100 text-red-700 border border-red-200",
  "Opening Balance": "bg-emerald-100 text-emerald-700 border border-emerald-200",
  "Loan Repayment": "bg-indigo-100 text-indigo-700 border border-indigo-200",
  "Loan Disbursement": "bg-amber-100 text-amber-700 border border-amber-200",
  "Membership Fee": "bg-cyan-100 text-cyan-700 border border-cyan-200",
  "Shares Purchase": "bg-purple-100 text-purple-700 border border-purple-200",
  "Investment Deposit": "bg-teal-100 text-teal-700 border border-teal-200",
}

export default function AccountDetailsPage() {
  const params = useParams()
  const accountId = params.id as string
  const [accountLoading, setAccountLoading] = useState(true)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txPage, setTxPage] = useState(0)
  const [txRowsPerPage, setTxRowsPerPage] = useState(10)
  const [activeTxQueryParams, setActiveTxQueryParams] = useState<Record<string, unknown>>({})
  const [activeTxFilters, setActiveTxFilters] = useState<Record<string, string>>({})
  const [editOpen, setEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [detailPermissions, setDetailPermissions] = useState({
    editAccount: false,
    generateAccountStatements: false,
  })
  const { toast } = useToast()

  const serializeQueryParams = (value: Record<string, unknown>) => {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(entries)
  }

  const loadAccountDetails = async (queryParams?: Record<string, unknown>, pageOverride?: number, rowsPerPageOverride?: number) => {
    const isInitialLoad = accountLoading && !account
    if (isInitialLoad) {
      setAccountLoading(true)
    } else {
      setTransactionsLoading(true)
    }
    setError("")
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
            const range = value as { start?: string; end?: string }
            if (range.start) params.set(`${key}Start`, range.start)
            if (range.end) params.set(`${key}End`, range.end)
            return
          }
          if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, String(value))
        })
      }
      const requestPage = typeof pageOverride === "number" ? pageOverride : txPage
      const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : txRowsPerPage
      params.set("page", String(requestPage + 1))
      params.set("pageSize", String(requestRows))
      const res = await fetch(`/api/institution/savings/${accountId}?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load account")
      setAccount(data.account)
      setTransactions(data.transactions || [])
      setTxTotal(Number(data?.transactionPagination?.total || 0))
    } catch (e: any) {
      setError(e?.message || "Failed to load account")
    } finally {
      if (isInitialLoad) {
        setAccountLoading(false)
      }
      setTransactionsLoading(false)
    }
  }

  useEffect(() => {
    void loadAccountDetails()
  }, [accountId])

  useEffect(() => {
    let cancelled = false
    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/institution/savings/permissions", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setDetailPermissions({
          editAccount: Boolean(data?.permissions?.editAccount),
          generateAccountStatements: Boolean(data?.permissions?.generateAccountStatements),
        })
      } catch {
        // keep defaults
      }
    }
    void loadPermissions()
    return () => {
      cancelled = true
    }
  }, [])

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
  type TransactionRow = {
    id: string
    date: string
    type: string
    amount: number
    mode: string
    description: string
    balance: number
  }

  const transactionColumns: DataTableColumn<TransactionRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (row) => <span className="text-sm text-gray-700">{row.date ? formatDate(row.date) : "—"}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <div className="flex items-center">
          {row.type === "Deposit" || row.type === "Opening Balance" ? (
            <TrendingUp className="h-4 w-4 text-green-600 mr-2" />
          ) : (
            <ArrowUpDown className="h-4 w-4 text-red-600 mr-2" />
          )}
          <Badge
            className={
              TRANSACTION_TYPE_STYLES[row.type] || "bg-gray-100 text-gray-700 border border-gray-200"
            }
          >
            {row.type}
          </Badge>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span
          className={`font-medium ${row.type === "Deposit" || row.type === "Opening Balance" ? "text-green-600" : "text-red-600"}`}
        >
          {row.type === "Deposit" || row.type === "Opening Balance" ? "" : "-"}
          {formatCurrency(Number(row.amount || 0))}
        </span>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (row) => <span className="text-sm text-gray-700">{row.mode || "—"}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (row) => <span className="inline-block max-w-xs truncate">{row.description || "—"}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      render: (row) => <span className="font-medium">{formatCurrency(Number(row.balance || 0))}</span>,
    },
  ]

  const mappedTransactionHistory: TransactionRow[] = useMemo(
    () =>
      transactions.map((transaction: any, index: number) => ({
        id: transaction.id || `${transaction.date || "tx"}-${index}`,
        date: transaction.date || "",
        type: transaction.type || "",
        amount: Number(transaction.amount || 0),
        mode: transaction.mode || "",
        description: transaction.description || "",
        balance: Number(transaction.balance || 0),
      })),
    [transactions],
  )

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "Voluntary":
        return "bg-blue-100 text-blue-700 border border-blue-200"
      case "Fixed":
        return "bg-purple-100 text-purple-700 border border-purple-200"
      case "Shares":
        return "bg-orange-100 text-orange-700 border border-orange-200"
      case "Current":
        return "bg-cyan-100 text-cyan-700 border border-cyan-200"
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700 border border-green-200"
      case "Inactive":
        return "bg-gray-100 text-gray-700 border border-gray-200"
      case "Suspended":
        return "bg-red-100 text-red-700 border border-red-200"
      case "Closed":
        return "bg-gray-100 text-gray-700 border border-gray-200"
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200"
    }
  }

  const handleEditSubmit = async (values: SavingsAccountFormValues) => {
    if (!detailPermissions.editAccount) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to edit account details.",
      })
      return
    }
    try {
      setSavingEdit(true)
      const res = await fetch(`/api/institution/savings/${accountId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to update savings account")
      setAccount((prev: any) => ({
        ...(prev || {}),
        ...(data?.account || {}),
        status: data?.account?.status || values.status,
        account_type: data?.account?.account_type || values.account_type,
      }))
      setEditOpen(false)
      toast({ variant: "success", title: "Saved", description: "Savings account updated successfully." })
    } catch (e: any) {
      if (String(e?.message || "") === "missing_permission:edit_account") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to edit account details.",
        })
        return
      }
      toast({ variant: "destructive", title: "Update failed", description: e?.message || "Please try again." })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleTransactionQueryParamsChange = (params: object) => {
    const next = params as Record<string, unknown>
    const sameQuery = serializeQueryParams(next) === serializeQueryParams(activeTxQueryParams)
    if (sameQuery) return
    setTxPage(0)
    setActiveTxQueryParams(next)
    const flat: Record<string, string> = {}
    Object.entries(next).forEach(([k, v]) => {
      if (v && typeof v === "object" && "start" in (v as Record<string, unknown>) && "end" in (v as Record<string, unknown>)) {
        const range = v as { start?: string; end?: string }
        if (range.start) flat[`${k}Start`] = range.start
        if (range.end) flat[`${k}End`] = range.end
        return
      }
      if (v !== undefined && v !== null && String(v).trim() !== "") flat[k] = String(v)
    })
    setActiveTxFilters(flat)
    void loadAccountDetails(next, 0, txRowsPerPage)
  }

  const handleTransactionPageChange = (_: unknown, newPage: number) => {
    setTxPage(newPage)
    void loadAccountDetails(activeTxQueryParams, newPage, txRowsPerPage)
  }

  const handleTransactionRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10)
    setTxRowsPerPage(next)
    setTxPage(0)
    void loadAccountDetails(activeTxQueryParams, 0, next)
  }

  const transactionFilterFields: FilterField[] = useMemo(
    () => [
      {
        field: "type",
        label: "Type",
        type: "select",
        options: TRANSACTION_TYPE_OPTIONS,
      },
      {
        field: "mode",
        label: "Mode",
        type: "select",
        multiple: true,
        options: TRANSACTION_MODE_OPTIONS,
      },
      {
        field: "date",
        label: "Transaction Date Range",
        type: "date-range",
      },
    ],
    [],
  )

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!detailPermissions.generateAccountStatements) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to generate account statements.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadAccountStatementExport(accountId, activeTxFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded account statement ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      if (String(e?.message || "") === "missing_permission:generate_account_statements") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to generate account statements.",
        })
        return
      }
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description: String(e?.message || `Failed to download ${format.toUpperCase()}.`),
      })
    } finally {
      setExporting(null)
    }
  }

  if (accountLoading) {
    return (
      <>
        <div className="flex min-h-[70vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading account details...</p>
          </div>
        </div>
      </>
    )
  }

  if (error || !account) {
    return (
      <>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account Not Found</h1>
          <p className="text-muted-foreground">{error || "The requested savings account could not be found."}</p>
          <Link href="/savings">
            <Button className="mt-4">Back to Savings</Button>
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href="/savings">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <PiggyBank className="h-5 w-5" />
                    <h1 className="text-3xl font-bold">Account Details - {account.account_number}</h1>
                  </div>
                </div>
                <p className="text-muted-foreground text-pretty">Complete account information and transaction history for {account.client_name}</p>
              </div>
            </div>

            {/* Account Overview */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(Number(account.available_balance || 0))}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(Number(account.total_balance || 0))}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Account Age</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Math.floor((Date.now() - new Date(account.open_date).getTime()) / (1000 * 60 * 60 * 24 * 30))}{" "}
                    months
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Account Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <PiggyBank className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Account Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Account Number</Label>
                    <p className="text-sm font-medium">{account.account_number}</p>
                  </div>
                  <div>
                    <Label>Account Type</Label>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAccountTypeColor(
                          account.account_type
                        )}`}
                      >
                        {account.account_type}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          account.status
                        )}`}
                      >
                        {account.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label>Opening Date</Label>
                    <p className="text-sm font-medium">{formatDate(account.open_date)}</p>
                  </div>
                </div>
              </div>

              {/* Member Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <User className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Member Information</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Member Name</Label>
                    <p className="text-sm font-medium">{account.client_name}</p>
                  </div>
                  <div>
                    <Label>Member ID</Label>
                    <p className="text-sm font-medium">{account.client_number}</p>
                  </div>
                  <div>
                    <Label>Account Summary</Label>
                    <div className="text-sm space-y-1">
                      <p>Available: {formatCurrency(Number(account.available_balance || 0))}</p>
                      <p>Reserved: {formatCurrency(Number(account.total_balance || 0) - Number(account.available_balance || 0))}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DataTable<TransactionRow>
              columns={transactionColumns}
              rows={mappedTransactionHistory}
              loading={transactionsLoading}
              title="Transaction History"
              filterFields={transactionFilterFields}
              onQueryParamsChange={handleTransactionQueryParamsChange}
              emptyMessage="No transactions found for this account"
              getRowId={(row) => row.id}
              pagination={{
                page: txPage,
                rowsPerPage: txRowsPerPage,
                total: txTotal,
                onPageChange: handleTransactionPageChange,
                onRowsPerPageChange: handleTransactionRowsPerPageChange,
                rowsPerPageOptions: [10, 25, 50],
              }}
              exportActions={{
                onExcel: () => void downloadExport("excel"),
                onPdf: () => void downloadExport("pdf"),
                excelDisabled:
                  transactionsLoading || txTotal === 0 || exporting !== null || !detailPermissions.generateAccountStatements,
                pdfDisabled:
                  transactionsLoading || txTotal === 0 || exporting !== null || !detailPermissions.generateAccountStatements,
              }}
            />

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Link href="/transactions/new">
                <Button variant="outline">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  New Transaction
                </Button>
              </Link>
              <Button
                disabled={!detailPermissions.editAccount}
                onClick={() => {
                  if (!detailPermissions.editAccount) {
                    toast({
                      variant: "warning",
                      title: "Access denied",
                      description: "You do not have permission to edit account details.",
                    })
                    return
                  }
                  setEditOpen(true)
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Account
              </Button>
            </div>
          </div>
      <EditAccount
        isOpen={editOpen}
        loading={savingEdit}
        initialValues={{
          status: String(account?.status || ""),
          account_type: String(account?.account_type || ""),
        }}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
      />
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
