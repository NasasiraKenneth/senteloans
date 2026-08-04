"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Calendar, CreditCard, User, Receipt, Hash, CheckCircle2, AlertTriangle, Download } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { formatCurrency } from "@/lib/format-currency"

export default function TransactionDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [tx, setTx] = useState<any | null>(null)
  const { toast } = useToast()

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


  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString("en-UG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })

  const downloadAsCSV = () => {
    if (!tx) return
    const run = async () => {
      toast({
        variant: "warning",
        title: "Generating Excel",
        description: "Preparing transaction export...",
      })
      try {
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
          "Assigned To",
          "Party",
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
          tx.assigned_to || tx.client_name || "",
          tx.assigned_to_type === "staff" ? "Staff" : tx.assigned_to_type === "client" ? "Client" : tx.assigned_to_type === "member" ? "Member" : "",
          tx.assigned_to_number || tx.client_number || "",
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

        toast({
          variant: "success",
          title: "Excel downloaded",
          description: `Transaction ${tx.transaction_number || ""} exported.`,
        })
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Excel download failed",
          description: String((e as Error)?.message || "Unexpected error"),
        })
      }
    }
    void run()
  }

  const downloadAsPDF = () => {
    if (!tx) return
    const run = async () => {
      toast({
        variant: "warning",
        title: "Generating PDF",
        description: "Preparing transaction PDF...",
      })
      try {
        const res = await fetch(`/api/institution/transactions/${id}/pdf`, { method: "GET" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || "Failed to generate transaction PDF")
        }
        const blob = await res.blob()
        const contentDisposition = res.headers.get("content-disposition") || ""
        const fileNameMatch =
          contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
          contentDisposition.match(/filename="([^"]+)"/i) ||
          contentDisposition.match(/filename=([^;]+)/i)
        const fileName = decodeURIComponent(
          (fileNameMatch?.[1] || "").trim().replace(/^["']|["']$/g, ""),
        ) || `${String(tx.transaction_number || tx.id || "transaction")}.pdf`

        const href = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = href
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(href)
        toast({
          variant: "success",
          title: "PDF downloaded",
          description: `Transaction ${tx.transaction_number || ""} downloaded.`,
        })
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: String((e as Error)?.message || "Unexpected error"),
        })
      }
    }
    void run()
  }

  const statusBadgeClass = (status?: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-700 border border-green-200 hover:bg-green-100"
      case "Pending":
        return "bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100"
      case "Failed":
      case "Reversed":
        return "bg-red-100 text-red-700 border border-red-200 hover:bg-red-100"
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-100"
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex min-h-[70vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading transaction details...</p>
          </div>
        </div>
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
  const isWithdrawal = tx.type === "Withdrawal"
  const assignedLabel =
    tx.assigned_to_type === "staff" ? "Staff" : tx.assigned_to_type === "client" ? "Client" : "Member"
  const assignedName = tx.assigned_to || tx.client_name || "-"
  const showMemberNumber = tx.assigned_to_type === "member" || (!tx.assigned_to_type && !!tx.client_number)

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
                    <Badge className={statusBadgeClass(tx.status)}>{tx.status}</Badge>
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
                  <div className={`text-2xl font-bold ${isWithdrawal ? "text-red-600" : "text-green-600"}`}>
                    {isWithdrawal ? "-" : ""}
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
                    <User className="h-4 w-4" /> Assigned to
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Party</span>
                    <span className="font-medium">{tx.assigned_to_type ? assignedLabel : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Name</span>
                    <span className="font-medium">{assignedName}</span>
                  </div>
                  {showMemberNumber && (
                  <div className="flex items-center justify-between">
                    <span>Member No.</span>
                    <span className="font-mono text-xs">{tx.assigned_to_number || tx.client_number || "-"}</span>
                  </div>
                  )}
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
                      <TableCell className={isWithdrawal ? "text-red-600" : "text-green-600"}>
                        {isWithdrawal ? "-" : ""}
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
