"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { ArrowLeft, CreditCard, User, Calendar, DollarSign, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function LoanDetailsPage() {
  const params = useParams()
  const loanId = params.id as string

  type LoanUI = {
    id: string
    applicationId: string
    memberName: string
    memberId?: string
    memberNumber?: string
    loanProduct: string
    interestRate: number
    tenure: number
    principalAmount: number
    outstandingBalance: number
    status: string
    purpose?: string
    applicationDate: string
    disbursementDate?: string | null
    maturityDate?: string | null
    nextPaymentDate?: string | null
    overdueDays?: number
  }

  const [loan, setLoan] = useState<LoanUI | null>(null)
  const [repaymentSchedule, setRepaymentSchedule] = useState<
    { installment: number; dueDate: string; principal: number; interest: number; totalPayment: number; status: string }[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState<boolean>(false)
  const [recordPaymentAmount, setRecordPaymentAmount] = useState<string>("")
  const [recordPaymentMode, setRecordPaymentMode] = useState<string>("Cash")
  const [recordPaymentDate, setRecordPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const { toast } = useToast()

  async function refetchLoanAndRepayments() {
    if (!loanId) return
    try {
      const [detailRes, repRes] = await Promise.all([
        fetch(`/api/institution/loans/${loanId}`),
        fetch(`/api/institution/loans/${loanId}/repayments`),
      ])
      if (detailRes.ok) {
        const detailJson = await detailRes.json()
        const l = detailJson?.loan
        if (l) {
          setLoan({
            id: l.id,
            applicationId: l.application_id,
            memberName: l.client_name || "",
            memberId: l.client_id,
            memberNumber: l.client_number || "",
            loanProduct: l.product_name || "",
            interestRate: Number(l.interest_rate || 0),
            tenure: Number(l.tenure_months || 0),
            principalAmount: Number(l.principal_amount || 0),
            outstandingBalance: Number(l.outstanding_balance || 0),
            status: String(l.status || "Applied"),
            purpose: l.purpose || "",
            applicationDate: l.application_date,
            disbursementDate: l.disbursement_date || null,
            maturityDate: l.maturity_date || null,
            nextPaymentDate: l.next_payment_date || null,
            overdueDays: Number(l.overdue_days || 0),
          })
        }
      }
      if (repRes.ok) {
        const repJson = await repRes.json()
        const reps = Array.isArray(repJson.repayments) ? repJson.repayments : []
        setRepaymentSchedule(
          reps.map((r: { installment?: number; due_date?: string; principal?: number; principal_amount?: number; interest?: number; interest_amount?: number; total?: number; total_amount?: number; status?: string }) => ({
            installment: Number(r.installment ?? 0),
            dueDate: r.due_date ?? "",
            principal: Number(r.principal ?? r.principal_amount ?? 0),
            interest: Number(r.interest ?? r.interest_amount ?? 0),
            totalPayment: Number(r.total ?? r.total_amount ?? 0),
            status: String(r.status ?? "Pending"),
          }))
        )
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        setLoading(true)
        const [detailRes, repRes] = await Promise.all([
          fetch(`/api/institution/loans/${loanId}`),
          fetch(`/api/institution/loans/${loanId}/repayments`),
        ])
        if (!detailRes.ok) throw new Error(`loan_detail_failed:${detailRes.status}`)
        const detailJson = await detailRes.json()
        if (!ignore) {
          const l = detailJson?.loan
          if (l) {
            const mapped: LoanUI = {
              id: l.id,
              applicationId: l.application_id,
              memberName: l.client_name || "",
              memberId: l.client_id,
              memberNumber: l.client_number || "",
              loanProduct: l.product_name || "",
              interestRate: Number(l.interest_rate || 0),
              tenure: Number(l.tenure_months || 0),
              principalAmount: Number(l.principal_amount || 0),
              outstandingBalance: Number(l.outstanding_balance || 0),
              status: String(l.status || "Applied"),
              purpose: l.purpose || "",
              applicationDate: l.application_date,
              disbursementDate: l.disbursement_date || null,
              maturityDate: l.maturity_date || null,
              nextPaymentDate: l.next_payment_date || null,
              overdueDays: Number(l.overdue_days || 0),
            }
            setLoan(mapped)
          } else {
            setLoan(null)
          }
        }

        if (repRes.ok && !ignore) {
          const repJson = await repRes.json()
          const reps = Array.isArray(repJson.repayments) ? repJson.repayments : []
          const mappedReps = reps.map((r: any) => ({
            installment: Number(r.installment || 0),
            dueDate: r.due_date,
            principal: Number(r.principal || r.principal_amount || 0),
            interest: Number(r.interest || r.interest_amount || 0),
            totalPayment: Number(r.total || r.total_amount || 0),
            status: String(r.status || "Pending"),
          }))
          setRepaymentSchedule(mappedReps)
        } else if (!ignore) {
          setRepaymentSchedule([])
        }
      } catch {
        if (!ignore) {
          setLoan(null)
          setRepaymentSchedule([])
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    if (loanId) load()
    return () => {
      ignore = true
    }
  }, [loanId])

  if (!loan) {
    return (
      <>
        <div className="text-center">
          {loading ? (
            <>
              <h1 className="text-2xl font-bold">Loading loan…</h1>
              <p className="text-muted-foreground">Please wait while we fetch the loan details.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Loan Not Found</h1>
              <p className="text-muted-foreground">The requested loan could not be found.</p>
              <Link href="/loans">
                <Button className="mt-4">Back to Loans</Button>
              </Link>
            </>
          )}
        </div>
      </>
    )
  }

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved":
      case "Disbursed":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "Rejected":
        return <XCircle className="h-5 w-5 text-red-600" />
      case "Defaulted":
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
    }
  }

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

  // Calculate repayment progress
  const repaymentProgress = loan
    ? Math.max(0, Math.min(100, ((loan.principalAmount - loan.outstandingBalance) / Math.max(loan.principalAmount, 1)) * 100))
    : 0

  return (
    <>
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href="/loans">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <h1 className="text-3xl font-bold">Loan Details - {loan.applicationId}</h1>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(loan.status)}
                    <Badge variant={getStatusVariant(loan.status)}>{loan.status}</Badge>
                  </div>
                </div>
                <p className="text-muted-foreground text-pretty">
                  Complete loan information and repayment schedule for {loan.memberName}
                </p>
              </div>
            </div>

            {/* Loan Overview */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Principal Amount</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(loan.principalAmount)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(loan.outstandingBalance)}</div>
                  <Progress value={repaymentProgress} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">{repaymentProgress.toFixed(1)}% repaid</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(
                      Number.isFinite((loan.principalAmount * (1 + loan.interestRate / 100)) / Math.max(loan.tenure, 1))
                        ? (loan.principalAmount * (1 + loan.interestRate / 100)) / Math.max(loan.tenure, 1)
                        : 0
                    )}
                  </div>
                  {(loan.overdueDays ?? 0) > 0 && (
                    <p className="text-xs text-red-600 mt-1">{loan.overdueDays} days overdue</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Loan Information */}
              <div className="space-y-6">
                <div className="border-b pb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <h2 className="text-xl font-semibold">Loan Information</h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <SectionLabel>Application ID</SectionLabel>
                    <p className="text-sm font-medium">{loan.applicationId}</p>
                  </div>
                  <div>
                    <SectionLabel>Loan Product</SectionLabel>
                    <p className="text-sm font-medium">{loan.loanProduct}</p>
                  </div>
                  <div>
                    <SectionLabel>Interest Rate</SectionLabel>
                    <p className="text-sm font-medium">{loan.interestRate}% per annum</p>
                  </div>
                  <div>
                    <SectionLabel>Tenure</SectionLabel>
                    <p className="text-sm font-medium">{loan.tenure} months</p>
                  </div>
                  <div>
                    <SectionLabel>Application Date</SectionLabel>
                    <p className="text-sm font-medium">{formatDate(loan.applicationDate)}</p>
                  </div>
                  {loan.disbursementDate && (
                    <div>
                      <SectionLabel>Disbursement Date</SectionLabel>
                      <p className="text-sm font-medium">{formatDate(loan.disbursementDate)}</p>
                    </div>
                  )}
                </div>
                <div>
                  <SectionLabel>Purpose</SectionLabel>
                  <p className="text-sm font-medium">{loan.purpose}</p>
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
                    <SectionLabel>Member Name</SectionLabel>
                    <p className="text-sm font-medium">{loan.memberName}</p>
                  </div>
                  <div>
                    <SectionLabel>Member ID</SectionLabel>
                    <p className="text-sm font-medium">{loan.memberId}</p>
                  </div>
                  {loan.nextPaymentDate && (
                    <div>
                      <SectionLabel>Next Payment Due</SectionLabel>
                      <p className="text-sm font-medium">{formatDate(loan.nextPaymentDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Repayment Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Repayment Schedule
                </CardTitle>
                <CardDescription>Monthly installment breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Installment</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Interest</TableHead>
                      <TableHead>Total Payment</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repaymentSchedule.slice(0, 6).map((payment) => (
                      <TableRow key={payment.installment}>
                        <TableCell className="font-medium">#{payment.installment}</TableCell>
                        <TableCell>{formatDate(payment.dueDate)}</TableCell>
                        <TableCell>{formatCurrency(payment.principal)}</TableCell>
                        <TableCell>{formatCurrency(payment.interest)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(payment.totalPayment)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              payment.status === "Paid"
                                ? "default"
                                : payment.status === "Due"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {payment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {repaymentSchedule.length > 6 && (
                  <div className="text-center mt-4">
                    <Button variant="outline" size="sm">
                      View Full Schedule ({repaymentSchedule.length} installments)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Record Payment form */}
            {recordPaymentOpen && loan && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Record Payment</CardTitle>
                  <CardDescription>Enter the payment amount and details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="payment-amount">Amount</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={recordPaymentAmount}
                      onChange={(e) => setRecordPaymentAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={recordPaymentDate}
                      onChange={(e) => setRecordPaymentDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={recordPaymentMode} onValueChange={setRecordPaymentMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRecordPaymentOpen(false)
                        setRecordPaymentAmount("")
                        setRecordPaymentDate(new Date().toISOString().slice(0, 10))
                        setRecordPaymentMode("Cash")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={actionLoading || !recordPaymentAmount || Number(recordPaymentAmount) <= 0}
                      onClick={async () => {
                        try {
                          setActionLoading(true)
                          const res = await fetch(`/api/institution/loans/${loan.id}/record-payment`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              amount: Number(recordPaymentAmount),
                              payment_date: recordPaymentDate,
                              mode: recordPaymentMode,
                            }),
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data?.message || data?.error || "Failed to record payment")
                          await refetchLoanAndRepayments()
                          setRecordPaymentOpen(false)
                          setRecordPaymentAmount("")
                          setRecordPaymentDate(new Date().toISOString().slice(0, 10))
                          setRecordPaymentMode("Cash")
                          toast({ variant: "success", title: "Payment recorded" })
                        } catch (e: unknown) {
                          const err = e as Error
                          toast({ variant: "destructive", title: "Action failed", description: err?.message || "Please try again" })
                        } finally {
                          setActionLoading(false)
                        }
                      }}
                    >
                      Record Payment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t">
              {loan.status === "Applied" && (
                <>
                  <Button
                    variant="outline"
                    disabled={actionLoading}
                    onClick={async () => {
                      try {
                        setActionLoading(true)
                        const res = await fetch(`/api/institution/loans/${loan.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "Rejected" }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data?.error || "Failed to reject application")
                        setLoan((prev) => (prev ? { ...prev, status: "Rejected" } : prev))
                        toast({ variant: "success", title: "Application Rejected" })
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
                      } finally {
                        setActionLoading(false)
                      }
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Application
                  </Button>
                  <Button
                    disabled={actionLoading}
                    onClick={async () => {
                      try {
                        setActionLoading(true)
                        const res = await fetch(`/api/institution/loans/${loan.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "Approved" }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data?.error || "Failed to approve loan")
                        setLoan((prev) => (prev ? { ...prev, status: "Approved" } : prev))
                        toast({ variant: "success", title: "Loan Approved" })
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
                      } finally {
                        setActionLoading(false)
                      }
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Loan
                  </Button>
                </>
              )}
              {loan.status === "Approved" && (
                <Button
                  disabled={actionLoading}
                  onClick={async () => {
                    try {
                      setActionLoading(true)
                      const res = await fetch(`/api/institution/loans/${loan.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Disbursed" }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data?.error || "Failed to disburse loan")
                      const today = new Date().toISOString().slice(0, 10)
                      setLoan((prev) => (prev ? { ...prev, status: "Disbursed", disbursementDate: today } : prev))
                      toast({ variant: "success", title: "Loan Disbursed" })
                    } catch (e: any) {
                      toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Disburse Loan
                </Button>
              )}
              {loan.status === "Disbursed" && (
                <Button
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() => setRecordPaymentOpen(true)}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              )}
            </div>
          </div>
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
