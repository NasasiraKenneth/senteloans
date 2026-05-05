"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { Plus, Eye, ArrowUpDown, PiggyBank, TrendingUp, Users, DollarSign, PanelRightOpen, PanelRightClose, Calendar } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { useToast } from "@/components/ui/toast"
import Tooltip from "@mui/material/Tooltip"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { downloadSavingsExport } from "./export/export"

type SavingsRow = {
  id: string
  account_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date: string
  client_name: string
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SavingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<SavingsRow[]>([])
  const [transactions, setTransactions] = useState<Array<any>>([])
  const [total, setTotal] = useState<number>(0)
  const [summaryStats, setSummaryStats] = useState({
    totalSavings: 0,
    averageBalance: 0,
    activeAccounts: 0,
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [savingsPermissions, setSavingsPermissions] = useState({
    viewSavings: false,
    viewAccount: false,
    createTransaction: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })
  const permissionToastShown = useRef(false)

  async function loadAccounts(queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) {
    setLoading(true)
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
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      const requestPage = typeof pageOverride === "number" ? pageOverride : page
      const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage
      params.set("page", String(requestPage + 1))
      params.set("pageSize", String(requestRows))
      const res = await fetch(`/api/institution/savings?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403 && data?.error === "missing_permission:view_savings") {
          throw new Error("missing_permission:view_savings")
        }
        throw new Error(data.error || "Failed to load savings")
      }
      setAccounts(data.items || [])
      setTransactions(data.recentTransactions || [])
      setTotal(data.total || 0)
      setSummaryStats({
        totalSavings: Number(data?.stats?.totalSavings || 0),
        averageBalance: Number(data?.stats?.averageBalance || 0),
        activeAccounts: Number(data?.stats?.activeAccounts || 0),
      })
      permissionToastShown.current = false
    } catch (e: any) {
      const message = e?.message || "Failed to load savings"
      if (message === "missing_permission:view_savings") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view savings.",
          })
          permissionToastShown.current = true
        }
        setError("")
      } else {
        setError(message)
        toast({
          variant: "destructive",
          title: "Failed to load savings",
          description: message,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadSavingsPermissions() {
    try {
      const res = await fetch("/api/institution/savings/permissions", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as {
        permissions?: {
          viewSavings?: boolean
          viewAccount?: boolean
          createTransaction?: boolean
          isSuperAdmin?: boolean
          branches?: Array<{ id: string; name: string }>
        }
      }
      setSavingsPermissions({
        viewSavings: !!data.permissions?.viewSavings,
        viewAccount: !!data.permissions?.viewAccount,
        createTransaction: !!data.permissions?.createTransaction,
        isSuperAdmin: !!data.permissions?.isSuperAdmin,
        branches: (data.permissions?.branches || []).map((b) => ({ value: b.id, label: b.name })),
      })
    } catch {
      // keep defaults
    }
  }

  useEffect(() => {
    void loadSavingsPermissions()
    void loadAccounts()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    setPage(0)
    const normalized = params as Record<string, unknown>
    const flat: Record<string, string> = {}
    Object.entries(normalized).forEach(([k, v]) => {
      if (v && typeof v === "object" && "start" in (v as Record<string, unknown>) && "end" in (v as Record<string, unknown>)) {
        const range = v as { start?: string; end?: string }
        if (range.start) flat[`${k}Start`] = range.start
        if (range.end) flat[`${k}End`] = range.end
        return
      }
      if (v !== undefined && v !== null && String(v).trim() !== "") flat[k] = String(v)
    })
    setActiveFilters(flat)
    setActiveQueryParams(normalized)
    void loadAccounts(normalized, 0, rowsPerPage)
  }, [rowsPerPage])

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage)
      void loadAccounts(activeQueryParams, newPage, rowsPerPage)
    },
    [activeQueryParams, rowsPerPage]
  )

  const handleRowsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10)
      setRowsPerPage(next)
      setPage(0)
      void loadAccounts(activeQueryParams, 0, next)
    },
    [activeQueryParams]
  )

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!savingsPermissions.viewSavings) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export savings accounts.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadSavingsExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded savings accounts ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_permission:view_savings") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export savings accounts.",
        })
      } else {
        toast({
          variant: "destructive",
          title: `Download ${format.toUpperCase()} failed`,
          description: message || `Failed to download ${format.toUpperCase()}.`,
        })
      }
    } finally {
      setExporting(null)
    }
  }

  const handleView = (row: SavingsRow) => {
    router.push(`/savings/${row.id}`)
  }

  const handleTransaction = (row: SavingsRow) => {
    router.push(`/transactions/new`)
  }

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
        return "bg-blue-100 text-blue-700 border border-blue-200"
      case "Fixed":
        return "bg-purple-100 text-purple-700 border border-purple-200"
      case "Shares":
        return "bg-orange-100 text-orange-700 border border-orange-200"
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200"
    }
  }

  // Calculate statistics
  const totalAccounts = total
  const activeAccounts = summaryStats.activeAccounts
  const totalSavings = summaryStats.totalSavings
  const averageBalance = summaryStats.averageBalance
  const recentTransactions = transactions

  // DataTable columns
  const columns: DataTableColumn<SavingsRow>[] = [
    {
      key: "account_number",
      header: "Account",
      render: (row) => (
        <div>
          <div className="font-medium">{row.account_number}</div>
        </div>
      ),
    },
    {
      key: "client_name",
      header: "Member",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{getInitials(row.client_name)}</span>
          </div>
          <div className="font-medium">{row.client_name}</div>
        </div>
      ),
    },
    {
      key: "account_type",
      header: "Type",
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAccountTypeColor(row.account_type)}`}>
          {row.account_type}
        </span>
      ),
    },
    {
      key: "available_balance",
      header: "Available Balance",
      render: (row) => (
        <div className="font-medium">{formatCurrency(Number(row.available_balance || 0))}</div>
      ),
    },
    {
      key: "total_balance",
      header: "Total Balance",
      render: (row) => (
        <div className="font-medium">{formatCurrency(Number(row.total_balance || 0))}</div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusStyles: Record<string, string> = {
          Active: "bg-green-100 text-green-700 border border-green-200",
          Inactive: "bg-gray-100 text-gray-700 border border-gray-200",
          Suspended: "bg-red-100 text-red-700 border border-red-200",
          Closed: "bg-gray-100 text-gray-700 border border-gray-200",
        }
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            {row.status}
          </span>
        )
      },
    },
    {
      key: "open_date",
      header: "Created at",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm text-gray-600">{new Date(row.open_date).toLocaleDateString()}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={savingsActions} row={row} />,
    },
  ]

  const savingsActions = [
    {
      label: "View",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4" />,
      disabled: !savingsPermissions.viewAccount,
    },
    {
      label: "Transaction",
      onClick: handleTransaction,
      variant: "primary",
      icon: <ArrowUpDown className="h-4 w-4" />,
      disabled: !savingsPermissions.createTransaction,
    },
  ]

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      {
        field: "search",
        label: "Search by member name or account number",
        type: "text",
      },
      {
        field: "status",
        label: "Status",
        options: [
          { value: "Active", label: "Active" },
          { value: "Inactive", label: "Inactive" },
          { value: "Suspended", label: "Suspended" },
          { value: "Closed", label: "Closed" },
        ],
        multiple: false,
        type: "select",
      },
      {
        field: "account_type",
        label: "Account Type",
        options: [
          { value: "Voluntary", label: "Voluntary" },
          { value: "Fixed", label: "Fixed" },
          { value: "Shares", label: "Shares" },
        ],
        multiple: true,
        type: "select",
      },
      {
        field: "open_date",
        label: "Search By Open Date Range",
        type: "date-range",
      },
    ]

    return withBranchFilterFirst(fields, {
      isSuperAdmin: savingsPermissions.isSuperAdmin,
      branchOptions: savingsPermissions.branches,
    })
  }, [savingsPermissions.isSuperAdmin, savingsPermissions.branches])

  return (
    <>
      <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-balance">Savings & Transactions</h2>
                <p className="text-muted-foreground text-pretty">
                  Manage member savings accounts, process transactions, and track balances.
                </p>
              </div>
              {savingsPermissions.createTransaction ? (
                <Link href="/transactions">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Transaction
                  </Button>
                </Link>
              ) : (
                <Tooltip title="Missing create_transaction permission" placement="top" arrow>
                  <span className="inline-block cursor-not-allowed">
                    <Button disabled>
                      <Plus className="h-4 w-4 mr-2" />
                      New Transaction
                    </Button>
                  </span>
                </Tooltip>
              )}
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

            <div className="flex items-start gap-6">
              {/* Savings Accounts - expands when sidebar is collapsed */}
              <div className="min-w-0 flex-1 space-y-6">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {!sidebarOpen && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSidebarOpen(true)}
                      className="gap-2"
                    >
                      <PanelRightOpen className="h-4 w-4" />
                      Recent Transactions
                    </Button>
                  </div>
                )}

                <DataTable<SavingsRow>
                  columns={columns}
                  rows={accounts}
                  loading={loading}
                  title={`Savings Accounts (${total})`}
                  exportActions={{
                    onExcel: () => void downloadExport("excel"),
                    onPdf: () => void downloadExport("pdf"),
                    excelDisabled: loading || accounts.length === 0 || exporting !== null || !savingsPermissions.viewSavings,
                    pdfDisabled: loading || accounts.length === 0 || exporting !== null || !savingsPermissions.viewSavings,
                  }}
                  filterFields={filterFields}
                  onQueryParamsChange={handleQueryParamsChange}
                  emptyMessage="No accounts found"
                  getRowId={(row) => row.id}
                  pagination={{
                    page,
                    rowsPerPage,
                    total,
                    onPageChange: handlePageChange,
                    onRowsPerPageChange: handleRowsPerPageChange,
                  }}
                />
              </div>

              {/* Recent Transactions - Collapsible sidebar */}
              <div
                className="shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
                style={{
                  width: sidebarOpen ? "33.333%" : "0px",
                  maxHeight: sidebarOpen ? "none" : "0px",
                  opacity: sidebarOpen ? 1 : 0,
                }}
              >
                <Card className="h-fit">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle>Recent Transactions</CardTitle>
                      <CardDescription>Latest account activities</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentTransactions.map((transaction: any) => (
                        <div key={transaction.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{transaction.memberName}</p>
                            <p className="text-xs text-muted-foreground">
                              {transaction.type} &bull; {transaction.mode}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(transaction.date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-sm font-medium ${
                                transaction.type === "Deposit" ||
                                transaction.type === "Loan Disbursement" ||
                                transaction.type === "Opening Balance" ||
                                transaction.type === "Shares Purchase"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {transaction.type === "Deposit" ||
                              transaction.type === "Loan Disbursement" ||
                              transaction.type === "Opening Balance" ||
                              transaction.type === "Shares Purchase"
                                ? "+"
                                : "-"}
                              {formatCurrency(Number(transaction.amount || 0))}
                            </p>
                            <p className="text-xs text-muted-foreground">Bal: {formatCurrency(Number(transaction.balance || 0))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Link href="/transactions">
                        <Button variant="outline" size="sm" className="w-full bg-transparent">
                          View All Transactions
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
    </>
  )
}
