"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"

import { ArrowLeft, CreditCard, User, DollarSign, CheckCircle, XCircle, Calendar, Percent, Clock, TrendingDown, Banknote, Pencil, X, FileText, Check } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"
import Disburse from "../components/add/Disburse"
import NewPayment from "../components/add/newPayment"
import SellOff from "../components/add/sellOff"

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
    monthlyPayment: number
    outstandingBalance: number
    status: string
    loanType?: string
    purpose?: string
    applicationDate: string
    disbursementDate?: string | null
    maturityDate?: string | null
    nextPaymentDate?: string | null
    overdueDays?: number
    settlement?: {
      settlementType?: string | null
      settlementStatus?: string | null
      settlementAmount?: number
      settledApplicationId?: string | null
      externalLenderName?: string | null
    } | null
    disbursementPreview?: {
      processingFeePercentage?: number
      processingFeeAmount?: number
      settlementAmount?: number
      completeDisbursementAmount?: number
      remainingDisbursementBalance?: number
    } | null
    eligibilityReviews?: { id: string; eligibility: string; isEligible: boolean }[]
  }

  const [loan, setLoan] = useState<LoanUI | null>(null)
  const [repaymentSchedule, setRepaymentSchedule] = useState<
    { installment: number; dueDate: string; principal: number; interest: number; totalPayment: number; status: string }[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState<boolean>(false)
  const [disburseLoanOpen, setDisburseLoanOpen] = useState<boolean>(false)
  const [sellOffOpen, setSellOffOpen] = useState<boolean>(false)
  const [reviewEditMode, setReviewEditMode] = useState<boolean>(false)
  const [schedPage, setSchedPage] = useState(0)
  const [schedRowsPerPage, setSchedRowsPerPage] = useState(6)
  const [reviewSavingIds, setReviewSavingIds] = useState<string[]>([])
  const [markReviewedLoading, setMarkReviewedLoading] = useState<boolean>(false)
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
            memberName: l.member_name || "",
            memberId: l.member_id,
            memberNumber: l.member_number || "",
            loanProduct: l.product_name || "",
            interestRate: Number(l.interest_rate || 0),
            tenure: Number(l.tenure_months || 0),
            principalAmount: Number(l.principal_amount || 0),
            monthlyPayment: Number(l.monthly_payment || 0),
            outstandingBalance: Number(l.outstanding_balance || 0),
            status: String(l.status || "Applied"),
            loanType: String(l.loan_type || "normal"),
            purpose: l.purpose || "",
            applicationDate: l.application_date,
            disbursementDate: l.disbursement_date || null,
            maturityDate: l.maturity_date || null,
            nextPaymentDate: l.next_payment_date || null,
            overdueDays: Number(l.overdue_days || 0),
            settlement: l.settlement
              ? {
                  settlementType: l.settlement.settlement_type || null,
                  settlementStatus: l.settlement.settlement_status || null,
                  settlementAmount: Number(l.settlement.settlement_amount || 0),
                  settledApplicationId: l.settlement.settled_application_id || null,
                  externalLenderName: l.settlement.external_lender_name || null,
                }
              : null,
            disbursementPreview: l.disbursement_preview
              ? {
                  processingFeePercentage: Number(l.disbursement_preview.processing_fee_percentage || 0),
                  processingFeeAmount: Number(l.disbursement_preview.processing_fee_amount || 0),
                  settlementAmount: Number(l.disbursement_preview.settlement_amount || 0),
                  completeDisbursementAmount: Number(l.disbursement_preview.complete_disbursement_amount || 0),
                  remainingDisbursementBalance: Number(l.disbursement_preview.remaining_disbursement_balance || 0),
                }
              : null,
            eligibilityReviews: Array.isArray(l.eligibility_reviews)
              ? l.eligibility_reviews.map((r: any) => ({
                  id: String(r.id),
                  eligibility: String(r.eligibility || ""),
                  isEligible: Boolean(r.is_eligible),
                }))
              : [],
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
              memberName: l.member_name || "",
              memberId: l.member_id,
              memberNumber: l.member_number || "",
              loanProduct: l.product_name || "",
              interestRate: Number(l.interest_rate || 0),
              tenure: Number(l.tenure_months || 0),
              principalAmount: Number(l.principal_amount || 0),
              monthlyPayment: Number(l.monthly_payment || 0),
              outstandingBalance: Number(l.outstanding_balance || 0),
              status: String(l.status || "Applied"),
              loanType: String(l.loan_type || "normal"),
              purpose: l.purpose || "",
              applicationDate: l.application_date,
              disbursementDate: l.disbursement_date || null,
              maturityDate: l.maturity_date || null,
              nextPaymentDate: l.next_payment_date || null,
              overdueDays: Number(l.overdue_days || 0),
              settlement: l.settlement
                ? {
                    settlementType: l.settlement.settlement_type || null,
                    settlementStatus: l.settlement.settlement_status || null,
                    settlementAmount: Number(l.settlement.settlement_amount || 0),
                    settledApplicationId: l.settlement.settled_application_id || null,
                    externalLenderName: l.settlement.external_lender_name || null,
                  }
                : null,
              disbursementPreview: l.disbursement_preview
                ? {
                    processingFeePercentage: Number(l.disbursement_preview.processing_fee_percentage || 0),
                    processingFeeAmount: Number(l.disbursement_preview.processing_fee_amount || 0),
                    settlementAmount: Number(l.disbursement_preview.settlement_amount || 0),
                    completeDisbursementAmount: Number(l.disbursement_preview.complete_disbursement_amount || 0),
                    remainingDisbursementBalance: Number(l.disbursement_preview.remaining_disbursement_balance || 0),
                  }
                : null,
              eligibilityReviews: Array.isArray(l.eligibility_reviews)
                ? l.eligibility_reviews.map((r: any) => ({
                    id: String(r.id),
                    eligibility: String(r.eligibility || ""),
                    isEligible: Boolean(r.is_eligible),
                  }))
                : [],
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
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-muted rounded w-28" />
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="h-20 bg-muted/50" />
              <div className="px-6 pb-6 -mt-6 flex items-end gap-4">
                <div className="h-14 w-14 rounded-full bg-muted border-4 border-card" />
                <div className="flex-1 space-y-2 pb-1">
                  <div className="h-5 bg-muted rounded w-56" />
                  <div className="h-3 bg-muted rounded w-80" />
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="h-64 bg-muted rounded-lg" />
              <div className="h-64 bg-muted rounded-lg" />
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Loan Not Found</h1>
            <p className="text-muted-foreground mt-1">The requested loan could not be found.</p>
            <Link href="/loans">
              <Button className="mt-6">Back to Loans</Button>
            </Link>
          </div>
        )}
      </div>
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Approved":
      case "Fully Disbursed":
      case "Partially Disbursed":
      case "Active":
        return { bg: "bg-green-100 text-green-700 border border-green-200", dot: "bg-green-500" }
      case "Rejected":
      case "Defaulted":
        return { bg: "bg-red-100 text-red-700 border border-red-200", dot: "bg-red-500" }
      case "Closed":
        return { bg: "bg-gray-100 text-gray-700 border border-gray-200", dot: "bg-gray-400" }
      default:
        return { bg: "bg-yellow-100 text-yellow-700 border border-yellow-200", dot: "bg-yellow-500" }
    }
  }

  const statusStyle = getStatusStyle(loan.status)

  // Calculate repayment progress
  const repaymentProgress = loan
    ? Math.max(0, Math.min(100, ((loan.principalAmount - loan.outstandingBalance) / Math.max(loan.principalAmount, 1)) * 100))
    : 0

  type RepaymentRow = typeof repaymentSchedule[number]

  const repaymentColumns: DataTableColumn<RepaymentRow>[] = [
    {
      key: "installment",
      header: "#",
      render: (row) => (
        <span className="text-sm font-semibold text-gray-700">#{row.installment}</span>
      ),
    },
    {
      key: "dueDate",
      header: "Due Date",
      render: (row) => (
        <span className="text-sm text-gray-700">{row.dueDate ? formatDate(row.dueDate) : "—"}</span>
      ),
    },
    {
      key: "principal",
      header: "Principal",
      render: (row) => (
        <span className="text-sm text-gray-900">{formatCurrency(row.principal)}</span>
      ),
    },
    {
      key: "interest",
      header: "Interest",
      render: (row) => (
        <span className="text-sm text-gray-900">{formatCurrency(row.interest)}</span>
      ),
    },
    {
      key: "totalPayment",
      header: "Total Payment",
      render: (row) => (
        <span className="text-sm font-semibold text-gray-900">{formatCurrency(row.totalPayment)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusStyles: Record<string, string> = {
          Paid: "bg-green-100 text-green-700 border border-green-200",
          Pending: "bg-gray-100 text-gray-700 border border-gray-200",
          Due: "bg-red-100 text-red-700 border border-red-200",
          Overdue: "bg-red-100 text-red-700 border border-red-200",
        }
        const dotStyles: Record<string, string> = {
          Paid: "bg-green-500",
          Pending: "bg-gray-400",
          Due: "bg-red-500",
          Overdue: "bg-red-500",
        }
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[row.status] || "bg-gray-400"}`} />
            {row.status}
          </span>
        )
      },
    },
  ]

  const pagedRepayments = repaymentSchedule.slice(
    schedPage * schedRowsPerPage,
    (schedPage + 1) * schedRowsPerPage
  )

  const monthlyPayment = Number(loan.monthlyPayment || 0)
  const remainingInstallments = repaymentSchedule.filter((r) => r.status !== "Paid").length
  const remainingTenureMonths = repaymentSchedule.length > 0 ? remainingInstallments : loan.tenure
  const canEditLoanReview = loan.status === "Under Review"
  const allEligibilityReviewed =
    Array.isArray(loan.eligibilityReviews) &&
    loan.eligibilityReviews.every((r) => r.isEligible)

  const updateEligibilityReview = async (reviewId: string, checked: boolean) => {
    if (!loan) return
    try {
      setReviewSavingIds((prev) => (prev.includes(reviewId) ? prev : [...prev, reviewId]))
      const res = await fetch(`/api/institution/loans/${loan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eligibility_reviews: [{ id: reviewId, is_eligible: checked }],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to update review")
      setLoan((prev) =>
        prev
          ? {
              ...prev,
              eligibilityReviews: (prev.eligibilityReviews || []).map((r) =>
                r.id === reviewId ? { ...r, isEligible: checked } : r
              ),
            }
          : prev
      )
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
    } finally {
      setReviewSavingIds((prev) => prev.filter((id) => id !== reviewId))
    }
  }

  const markLoanReviewed = async () => {
    if (!loan) return
    try {
      setMarkReviewedLoading(true)
      const res = await fetch(`/api/institution/loans/${loan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Reviewed" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to mark loan reviewed")
      setLoan((prev) => (prev ? { ...prev, status: "Reviewed" } : prev))
      setReviewEditMode(false)
      toast({ variant: "success", title: "Loan reviewed" })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
    } finally {
      setMarkReviewedLoading(false)
    }
  }

  return (
    <>
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Back link + quick actions */}
            <div className="flex items-center justify-between gap-4">
              <Link href="/loans" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Loans
              </Link>
              <div className="flex items-center gap-2">
                {loan.status === "Approved" &&
                  (loan.loanType === "top up" || loan.loanType === "buy off") && (
                  String(loan.settlement?.settlementStatus || "").toLowerCase() === "pending" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={async () => {
                        try {
                          setActionLoading(true)
                          const res = await fetch(`/api/institution/loans/${loan.id}/settle-previous`, {
                            method: "POST",
                          })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) throw new Error(data?.error || "Failed to settle previous loan")
                          await refetchLoanAndRepayments()
                          toast({ variant: "success", title: "Previous loan settled" })
                        } catch (e: any) {
                          toast({
                            variant: "destructive",
                            title: "Action failed",
                            description: e?.message || "Please try again",
                          })
                        } finally {
                          setActionLoading(false)
                        }
                      }}
                    >
                      Settle Previous Loan
                    </Button>
                  ))}
                {(loan.status === "Fully Disbursed" || loan.status === "Active") && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSellOffOpen(true)}>
                    Sell Off Loan
                  </Button>
                )}
              </div>
            </div>

            {/* Loan Header Card */}
            <div className="relative overflow-hidden rounded-xl border bg-card">
              <div className="h-20 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
              <div className="px-6 pb-6">
                <div className="flex flex-col sm:flex-row gap-5 -mt-8">
                  {/* Loan icon */}
                  <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
                    <CreditCard className="h-7 w-7 text-primary" />
                  </div>

                  {/* Loan meta */}
                  <div className="flex-1 min-w-0 pt-1 sm:pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <h1 className="text-2xl font-bold tracking-tight truncate">{loan.applicationId}</h1>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium w-fit ${statusStyle.bg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                        {loan.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                      <span>{loan.loanProduct}</span>
                      <span className="hidden sm:inline text-border">|</span>
                      <Link href={`/users/${loan.memberId}`} className="hover:text-foreground transition-colors underline-offset-2 hover:underline">
                        {loan.memberName}
                      </Link>
                      {loan.memberNumber && (
                        <>
                          <span className="hidden sm:inline text-border">|</span>
                          <span className="font-mono">{loan.memberNumber}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-start gap-2 pt-2">
                    {loan.memberId && (
                      <Link href={`/users/${loan.memberId}`}>
                        <Button variant="outline" size="sm">
                          <User className="h-4 w-4 mr-2" />
                          View Member
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-100">
                    <Banknote className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Principal</span>
                </div>
                <div className="text-xl font-bold">{formatCurrency(loan.principalAmount)}</div>
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-orange-100">
                    <TrendingDown className="h-4 w-4 text-orange-600" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Outstanding</span>
                </div>
                <div className="text-xl font-bold">{formatCurrency(loan.outstandingBalance)}</div>
                <div className="mt-2">
                  <Progress value={repaymentProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">{repaymentProgress.toFixed(0)}% repaid</p>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-green-100">
                    <DollarSign className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Monthly Payment</span>
                </div>
                <div className="text-xl font-bold">{formatCurrency(monthlyPayment)}</div>
                {(loan.overdueDays ?? 0) > 0 && (
                  <p className="text-xs text-red-600 font-medium mt-1">{loan.overdueDays} days overdue</p>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-purple-100">
                    <Percent className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Interest Rate</span>
                </div>
                <div className="text-xl font-bold">{loan.interestRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">{remainingTenureMonths} months remaining</p>
              </div>
            </div>

            {/* Loan Details + Member Info */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Loan Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Loan Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <SectionLabel>Application ID</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.applicationId}</p>
                    </div>
                    <div>
                      <SectionLabel>Loan Product</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.loanProduct}</p>
                    </div>
                    <div>
                      <SectionLabel>Interest Rate</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.interestRate}% per annum</p>
                    </div>
                    <div>
                      <SectionLabel>Loan Type</SectionLabel>
                      <p className="text-sm font-medium mt-0.5 capitalize">{loan.loanType || "normal"}</p>
                    </div>
                    <div>
                      <SectionLabel>Tenure</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.tenure} months</p>
                    </div>
                    <div>
                      <SectionLabel>Remaining Tenure</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{remainingTenureMonths} months</p>
                    </div>
                    <div>
                      <SectionLabel>Application Date</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{formatDate(loan.applicationDate)}</p>
                    </div>
                    {loan.disbursementDate && (
                      <div>
                        <SectionLabel>Disbursement Date</SectionLabel>
                        <p className="text-sm font-medium mt-0.5">{formatDate(loan.disbursementDate)}</p>
                      </div>
                    )}
                    {loan.maturityDate && (
                      <div>
                        <SectionLabel>Maturity Date</SectionLabel>
                        <p className="text-sm font-medium mt-0.5">{formatDate(loan.maturityDate)}</p>
                      </div>
                    )}
                    {loan.purpose && (
                      <div className="col-span-2">
                        <SectionLabel>Purpose</SectionLabel>
                        <p className="text-sm font-medium mt-0.5">{loan.purpose}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {loan.status === "Applied" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      Member Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {loan.memberName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{loan.memberName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{loan.memberNumber || loan.memberId}</p>
                        </div>
                        {loan.memberId && (
                          <Link href={`/users/${loan.memberId}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {loan.nextPaymentDate && (
                          <div>
                            <SectionLabel>Next Payment Due</SectionLabel>
                            <p className="text-sm font-medium mt-0.5 flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatDate(loan.nextPaymentDate)}
                            </p>
                          </div>
                        )}
                        {loan.maturityDate && (
                          <div>
                            <SectionLabel>Maturity Date</SectionLabel>
                            <p className="text-sm font-medium mt-0.5 flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatDate(loan.maturityDate)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="group">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-primary" />
                          Loan Review
                        </CardTitle>
                        <CardDescription>Review and mark each eligibility before approval</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled
                          title="PDF export coming soon"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {canEditLoanReview && allEligibilityReviewed && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={markLoanReviewed}
                            disabled={actionLoading || markReviewedLoading || reviewSavingIds.length > 0}
                            title="Mark loan reviewed"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {canEditLoanReview && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewEditMode((prev) => !prev)}
                            disabled={actionLoading || markReviewedLoading || reviewSavingIds.length > 0}
                            className={`transition-opacity ${
                              reviewEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                            title={reviewEditMode ? "Disable edit mode" : "Enable edit mode"}
                          >
                            {reviewEditMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {Array.isArray(loan.eligibilityReviews) && loan.eligibilityReviews.length > 0 ? (
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {loan.eligibilityReviews.map((review) => {
                          const saving = reviewSavingIds.includes(review.id)
                          const disabled = !canEditLoanReview || !reviewEditMode || saving || actionLoading
                          return (
                            <label
                              key={review.id}
                              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                                review.isEligible ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-white"
                              } ${disabled ? "cursor-not-allowed opacity-85" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={review.isEligible}
                                disabled={disabled}
                                onChange={(e) => updateEligibilityReview(review.id, e.target.checked)}
                              />
                              <div
                                className={`relative mt-0.5 h-[18px] w-[18px] border-2 flex items-center justify-center rounded-full transition-all ${
                                  review.isEligible
                                    ? "bg-[#f08c2b] border-[#f08c2b]"
                                    : "bg-white border-gray-400"
                                }`}
                              >
                                {review.isEligible && (
                                  <svg
                                    className="h-3 w-3 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 wrap-break-word">{review.eligibility}</p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {review.isEligible ? "Marked eligible" : "Not yet marked eligible"}
                                  {saving ? " · Saving..." : ""}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
                        No eligibility checks configured for this loan product.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Settlement Details */}
            {loan.settlement && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-primary" />
                    Settlement Details
                  </CardTitle>
                  <CardDescription>Top up and buy off settlement context for this loan</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <SectionLabel>Settlement Type</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.settlement.settlementType || "—"}</p>
                    </div>
                    <div>
                      <SectionLabel>Status</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{loan.settlement.settlementStatus || "—"}</p>
                    </div>
                    <div>
                      <SectionLabel>Settlement Amount</SectionLabel>
                      <p className="text-sm font-medium mt-0.5">{formatCurrency(Number(loan.settlement.settlementAmount || 0))}</p>
                    </div>
                    {loan.settlement.settledApplicationId && (
                      <div>
                        <SectionLabel>Settled Loan</SectionLabel>
                        <p className="text-sm font-medium mt-0.5">{loan.settlement.settledApplicationId}</p>
                      </div>
                    )}
                    {loan.settlement.externalLenderName && (
                      <div className="md:col-span-2">
                        <SectionLabel>External Lender</SectionLabel>
                        <p className="text-sm font-medium mt-0.5">{loan.settlement.externalLenderName}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Repayment Schedule */}
            <DataTable<RepaymentRow>
              columns={repaymentColumns}
              rows={pagedRepayments}
              loading={loading}
              title="Repayment Schedule"
              emptyMessage="No repayment schedule available"
              getRowId={(row) => row.installment}
              pagination={{
                page: schedPage,
                rowsPerPage: schedRowsPerPage,
                total: repaymentSchedule.length,
                onPageChange: (_e, newPage) => setSchedPage(newPage),
                onRowsPerPageChange: (e) => {
                  setSchedRowsPerPage(parseInt(e.target.value, 10))
                  setSchedPage(0)
                },
                rowsPerPageOptions: [6, 12, 18],
              }}
            />

            <Disburse
              isOpen={disburseLoanOpen}
              onClose={() => setDisburseLoanOpen(false)}
              loanId={loan.id}
              completeDisbursementAmount={Number(loan.disbursementPreview?.remainingDisbursementBalance || 0)}
              processingFeeAmount={Number(loan.disbursementPreview?.processingFeeAmount || 0)}
              processingFeePercentage={Number(loan.disbursementPreview?.processingFeePercentage || 0)}
              loanType={loan.loanType}
              settlementOutstandingBalance={Number(loan.disbursementPreview?.settlementAmount || 0)}
              onSuccess={refetchLoanAndRepayments}
            />

            <NewPayment
              isOpen={recordPaymentOpen}
              onClose={() => setRecordPaymentOpen(false)}
              loanId={loan.id}
              onSuccess={refetchLoanAndRepayments}
            />
            <SellOff
              isOpen={sellOffOpen}
              onClose={() => setSellOffOpen(false)}
              outstandingBalance={Number(loan.outstandingBalance || 0)}
            />

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
                          body: JSON.stringify({ status: "Under Review" }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data?.error || "Failed to move loan under review")
                        setLoan((prev) => (prev ? { ...prev, status: "Under Review" } : prev))
                        toast({ variant: "success", title: "Loan moved to review" })
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again" })
                      } finally {
                        setActionLoading(false)
                      }
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Review Loan
                  </Button>
                </>
              )}
              {loan.status === "Under Review" && (
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
                </>
              )}
              {loan.status === "Reviewed" && (
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
              {(loan.status === "Approved" || loan.status === "Partially Disbursed") && (
                <Button
                  disabled={actionLoading}
                  onClick={() => {
                    setRecordPaymentOpen(false)
                    setDisburseLoanOpen(true)
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Disburse Loan
                </Button>
              )}
              {(loan.status === "Fully Disbursed" || loan.status === "Active") && (
                <Button
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() => {
                    setDisburseLoanOpen(false)
                    setRecordPaymentOpen(true)
                  }}
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
