"use client"

import type React from "react"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"

import { ArrowLeft, PiggyBank, User, Calendar, ArrowUpDown, TrendingUp, Edit, X } from "lucide-react"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"

export default function AccountDetailsPage() {
  const params = useParams()
  const accountId = params.id as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [txPage, setTxPage] = useState(0)
  const [txRowsPerPage, setTxRowsPerPage] = useState(6)
  const [editing, setEditing] = useState(false)
  const [statusDraft, setStatusDraft] = useState<string>("")
  const { toast } = useToast()

  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/institution/savings/${accountId}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load account")
        if (abort) return
        setAccount(data.account)
        setStatusDraft(data.account?.status || "")
        setTransactions(data.transactions || [])
      } catch (e: any) {
        if (!abort) setError(e?.message || "Failed to load account")
      } finally {
        if (!abort) setLoading(false)
      }
    })()
    return () => { abort = true }
  }, [accountId])

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
  const transactionHistory = useMemo(() => transactions, [transactions])

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
          <Badge variant={row.type === "Deposit" || row.type === "Opening Balance" ? "default" : "outline"}>
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
      transactionHistory.map((transaction: any, index: number) => ({
        id: transaction.id || `${transaction.date || "tx"}-${index}`,
        date: transaction.date || "",
        type: transaction.type || "",
        amount: Number(transaction.amount || 0),
        mode: transaction.mode || "",
        description: transaction.description || "",
        balance: Number(transaction.balance || 0),
      })),
    [transactionHistory],
  )

  const pagedTransactionHistory = mappedTransactionHistory.slice(
    txPage * txRowsPerPage,
    (txPage + 1) * txRowsPerPage,
  )

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

  if (loading) {
    return (
      <>
        <div className="text-center text-muted-foreground">Loading account...</div>
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
                  <div className="flex items-center gap-2">
                    {editing ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Account
                      </Button>
                    )}
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
                      <Badge variant={getAccountTypeColor(account.account_type)}>{account.account_type}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label>Status</Label>
                    {editing ? (
                      <div className="flex items-center gap-3">
                        <Select value={statusDraft} onValueChange={setStatusDraft}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active" disabled={account.status === "Closed"}>Active</SelectItem>
                            <SelectItem value="Inactive">Inactive</SelectItem>
                            <SelectItem value="Suspended">Suspended</SelectItem>
                            <SelectItem value="Closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={async () => {
                            // Client-side validation
                            const allowed = ["Active", "Inactive", "Suspended", "Closed"]
                            if (!allowed.includes(statusDraft)) {
                              toast({ variant: "warning", title: "Invalid status", description: "Choose Active, Inactive, Suspended, or Closed." })
                              return
                            }
                            if (account.status === "Closed" && statusDraft === "Active") {
                              toast({ variant: "warning", title: "Not allowed", description: "Closed accounts cannot be re-activated here." })
                              return
                            }
                            try {
                              const res = await fetch(`/api/institution/savings/${accountId}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: statusDraft }),
                              })
                              const data = await res.json()
                              if (!res.ok) throw new Error(data.error || "Failed to update")
                              setAccount((prev: any) => ({ ...(prev || {}), status: data.account?.status || statusDraft }))
                              setEditing(false)
                              toast({ variant: "success", title: "Saved", description: "Account status updated." })
                            } catch (e: any) {
                              toast({ variant: "destructive", title: "Update failed", description: e?.message || "Try again" })
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Badge variant={account.status === "Active" ? "default" : "secondary"}>{account.status}</Badge>
                      </div>
                    )}
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
              rows={pagedTransactionHistory}
              loading={loading}
              title="Transaction History"
              emptyMessage="No transactions found for this account"
              getRowId={(row) => row.id}
              pagination={{
                page: txPage,
                rowsPerPage: txRowsPerPage,
                total: mappedTransactionHistory.length,
                onPageChange: (_e, newPage) => setTxPage(newPage),
                onRowsPerPageChange: (e) => {
                  setTxRowsPerPage(parseInt(e.target.value, 10))
                  setTxPage(0)
                },
                rowsPerPageOptions: [6, 12, 18],
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
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Generate Statement
              </Button>
              <Button>
                <Edit className="h-4 w-4 mr-2" />
                Edit Account
              </Button>
            </div>
          </div>
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
