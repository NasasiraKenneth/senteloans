"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Calendar, CreditCard, User, Receipt, Hash, CheckCircle2, AlertTriangle, Download } from "lucide-react"

export default function TransactionDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [tx, setTx] = useState<any | null>(null)

  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/institution/transactions/${id}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load transaction")
        if (abort) return
        setTx(data.transaction)
      } catch (e: any) {
        if (!abort) setError(e?.message || "Failed to load transaction")
      } finally {
        if (!abort) setLoading(false)
      }
    })()
    return () => { abort = true }
  }, [id])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(amount)

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString("en-UG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })

  const downloadAsCSV = () => {
    if (!tx) return
    const headers = [
      "Transaction Number",
      "Type",
      "Amount",
      "Mode",
      "Description",
      "Reference",
      "Balance Before",
      "Balance After",
      "Date",
      "Status",
      "Client Name",
      "Member No.",
      "Account Number",
      "Processed By",
    ]
    const values = [
      tx.transaction_number || "",
      tx.type || "",
      String(tx.amount ?? ""),
      tx.mode || "",
      (tx.description || "").replace(/\r?\n|\r/g, " "),
      tx.reference_number || "",
      String(tx.balance_before ?? ""),
      String(tx.balance_after ?? ""),
      tx.transaction_date ? new Date(tx.transaction_date).toISOString() : "",
      tx.status || "",
      tx.client_name || "",
      tx.client_number || "",
      tx.account_number || "",
      tx.processed_by_name || "",
    ]
    const csv = [headers.join(","), values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transaction_${tx.transaction_number || tx.id}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const downloadAsPDF = () => {
    if (!tx) return
    const win = window.open("", "_blank")
    if (!win) return
    const styles = `
      <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        .muted { color: #6b7280; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        .amount { font-weight: 700; }
      </style>
    `
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Transaction ${tx.transaction_number || tx.id}</title>
          ${styles}
        </head>
        <body>
          <h1>Transaction Receipt</h1>
          <div class="muted">Transaction #${tx.transaction_number || tx.id}</div>
          <table>
            <tbody>
              <tr><th>Type</th><td>${tx.type || ""}</td></tr>
              <tr><th>Amount</th><td class="amount">${formatCurrency(Number(tx.amount || 0))}</td></tr>
              <tr><th>Mode</th><td>${tx.mode || ""}</td></tr>
              <tr><th>Date</th><td>${formatDateTime(tx.transaction_date)}</td></tr>
              <tr><th>Status</th><td>${tx.status || ""}</td></tr>
              <tr><th>Description</th><td>${(tx.description || "").replace(/</g, "&lt;")}</td></tr>
              <tr><th>Reference</th><td>${tx.reference_number || ""}</td></tr>
              <tr><th>Balance Before</th><td>${formatCurrency(Number(tx.balance_before || 0))}</td></tr>
              <tr><th>Balance After</th><td>${formatCurrency(Number(tx.balance_after || 0))}</td></tr>
              <tr><th>Client</th><td>${tx.client_name || ""} (${tx.client_number || ""})</td></tr>
              <tr><th>Account</th><td>${tx.account_number || ""}</td></tr>
              <tr><th>Processed By</th><td>${tx.processed_by_name || ""}</td></tr>
            </tbody>
          </table>
          <script>
            window.onload = () => { window.print(); }
          </script>
        </body>
      </html>
    `
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const statusVariant = (status?: string) => {
    switch (status) {
      case "Completed":
        return "default"
      case "Pending":
        return "secondary"
      case "Failed":
      case "Reversed":
        return "destructive"
      default:
        return "outline"
    }
  }

  if (loading) {
    return (
      <>
        <div className="text-center text-muted-foreground">Loading transaction...</div>
      </>
    )
  }

  if (error || !tx) {
    return (
      <>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Transaction Not Found</h1>
          <p className="text-muted-foreground">{error || "The requested transaction could not be found."}</p>
          <Link href="/transactions">
            <Button className="mt-4">Back to Transactions</Button>
          </Link>
        </div>
      </>
    )
  }

  const isFeePayment = tx.type === "Fee Payment"
  const isInflow = tx.type === "Deposit" || tx.type === "Loan Disbursement" || tx.type === "Opening Balance" || isFeePayment || tx.type === "Loan Repayment"

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href="/transactions">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    <h1 className="text-3xl font-bold">Transaction #{tx.transaction_number || tx.id}</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={downloadAsPDF} title="Download PDF Receipt">
                      <Download className="h-4 w-4 mr-2" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadAsCSV} title="Download Excel (CSV)">
                      <Download className="h-4 w-4 mr-2" /> Excel
                    </Button>
                    <Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>
                  </div>
                </div>
                <p className="text-muted-foreground">Read-only view with full details</p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Type & Amount</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm mb-1">{tx.type}</div>
                  <div className={`text-2xl font-bold ${isFeePayment ? "text-green-600" : isInflow ? "text-green-600" : "text-red-600"}`}>
                    {isFeePayment ? "" : isInflow ? "" : "-"}
                    {formatCurrency(Number(tx.amount || 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Mode</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <div className="text-xl font-bold">{tx.mode}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">When</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <div className="text-xl font-bold">{formatDateTime(tx.transaction_date)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Parties */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4" /> Client
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Name</span>
                    <span className="font-medium">{tx.client_name || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Member No.</span>
                    <span className="font-mono text-xs">{tx.client_number || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Account</span>
                    <span className="font-medium">{tx.account_number || "-"}</span>
                  </div>
                  {tx.loan_application_id && (
                    <div className="flex items-center justify-between">
                      <span>Loan</span>
                      <span className="font-medium">{tx.loan_application_id}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-4 w-4" /> References
                  </CardTitle>
                  <CardDescription>Identifiers and processing info</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Transaction #</span>
                    <span className="font-mono text-xs">{tx.transaction_number || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Reference</span>
                    <span className="font-mono text-xs">{tx.reference_number || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Processed By</span>
                    <span className="font-medium">{tx.processed_by_name || "-"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Amounts Table */}
            <Card>
              <CardHeader>
                <CardTitle>{isFeePayment ? "Fee Balance" : "Balances"}</CardTitle>
                <CardDescription>
                  {isFeePayment
                    ? "Remaining membership fee before and after this payment"
                    : "Before and after this transaction"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isFeePayment ? "Remaining Before" : "Balance Before"}</TableHead>
                      <TableHead>{isFeePayment ? "Amount Paid" : "Amount"}</TableHead>
                      <TableHead>{isFeePayment ? "Remaining After" : "Balance After"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">{formatCurrency(Number(tx.balance_before || 0))}</TableCell>
                      <TableCell className={isFeePayment ? "text-green-600" : isInflow ? "text-green-600" : "text-red-600"}>
                        {isFeePayment ? "" : isInflow ? "" : "-"}
                        {formatCurrency(Number(tx.amount || 0))}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(Number(tx.balance_after || 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Description & Status */}
            <Card>
              <CardHeader>
                <CardTitle>Notes & Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="text-muted-foreground mb-1">Description</div>
                  <div className="font-medium">{tx.description || "—"}</div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {tx.status === "Completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{formatDateTime(tx.created_at)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
    </>
  )
}
