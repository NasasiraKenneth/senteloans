"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  Percent,
  TrendingDown,
  User,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { useToast } from "@/components/ui/toast"
import AddRecordPayment from "../components/recordPayment/add"
import Disburse from "../components/disburse/disburse"

type SaccoLoanDetail = {
  id: string
  client_id: string
  client_name: string
  loan_product: string | null
  principal_amount: number
  interest_rate: number
  tenure_months: number
  monthly_payment: number | null
  total_amount: number | null
  outstanding_balance: number
  status: string
  loan_type: string
  purpose: string | null
  collateral_description: string | null
  application_date: string | null
  approved_at: string | null
  rejected_at: string | null
  maturity_date: string | null
  next_payment_date: string | null
  overdue_days: number
  disbursement_balance: number
  disbursement_date: string | null
}

/** Matches `senteloans_institution_loan_repayments` (see 01-create-schema.sql). */
type RepaymentRow = {
  id: string
  loan_id: string
  due_date: string
  amount_paid: number
  payment_date: string | null
  status: string
  created_at: string
  updated_at: string | null
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateString: string) => {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

const formatDateTime = (value: string) => {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}

function getStatusStyle(status: string) {
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

export default function SaccoLoanDetailPage() {
  const params = useParams()
  const loanId = typeof params?.id === "string" ? params.id : ""
  const { toast } = useToast()
  const [loan, setLoan] = useState<SaccoLoanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [disburseLoanOpen, setDisburseLoanOpen] = useState(false)
  const [statusActionLoading, setStatusActionLoading] = useState(false)
  const [schedPage, setSchedPage] = useState(0)
  const [schedRowsPerPage, setSchedRowsPerPage] = useState(6)
  const [repayments, setRepayments] = useState<RepaymentRow[]>([])

  const load = useCallback(async () => {
    if (!loanId) return
    setLoading(true)
    try {
      const [detailRes, repRes] = await Promise.all([
        fetch(`/api/institution/sacco-loans/${loanId}`, { cache: "no-store" }),
        fetch(`/api/institution/sacco-loans/${loanId}/repayments`, { cache: "no-store" }),
      ])
      const detailBody = await detailRes.json().catch(() => ({}))
      if (!detailRes.ok) throw new Error(detailBody?.error || "Failed to load loan")
      setLoan(detailBody.loan ?? null)

      if (repRes.ok) {
        const repBody = await repRes.json().catch(() => ({}))
        const list = Array.isArray(repBody?.repayments) ? repBody.repayments : []
        setRepayments(
          list.map((r: Record<string, unknown>) => ({
            id: String(r.id || ""),
            loan_id: String(r.loan_id || ""),
            due_date: r.due_date != null ? String(r.due_date).slice(0, 10) : "",
            amount_paid: Number(r.amount_paid ?? 0),
            payment_date: r.payment_date != null ? String(r.payment_date).slice(0, 10) : null,
            status: String(r.status || "Pending"),
            created_at: r.created_at != null ? String(r.created_at) : "",
            updated_at: r.updated_at != null ? String(r.updated_at) : null,
          })),
        )
      } else {
        setRepayments([])
      }
    } catch (e: unknown) {
      setLoan(null)
      setRepayments([])
      const message = e instanceof Error ? e.message : "Failed to load loan"
      toast({ variant: "destructive", title: "Error", description: message })
    } finally {
      setLoading(false)
    }
  }, [loanId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const patchLoanStatus = async (status: "Approved" | "Rejected") => {
    if (!loanId) return
    try {
      setStatusActionLoading(true)
      const res = await fetch(`/api/institution/sacco-loans/${loanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Update failed")
      toast({
        title: status === "Approved" ? "Loan approved" : "Loan rejected",
      })
      await load()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({ variant: "destructive", title: "Could not update loan", description: message })
    } finally {
      setStatusActionLoading(false)
    }
  }

  const repaymentColumns: DataTableColumn<RepaymentRow>[] = useMemo(
    () => [
      {
        key: "due_date",
        header: "Due date",
        render: (row) => (
          <span className="text-sm text-gray-700">{row.due_date ? formatDate(row.due_date) : "—"}</span>
        ),
      },
      {
        key: "amount_paid",
        header: "Amount paid",
        render: (row) => (
          <span className="text-sm font-medium text-gray-900 tabular-nums">{formatCurrency(row.amount_paid)}</span>
        ),
      },
      {
        key: "payment_date",
        header: "Payment date",
        render: (row) => (
          <span className="text-sm text-gray-700">
            {row.payment_date ? formatDate(row.payment_date) : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const statusStyles: Record<string, string> = {
            Paid: "bg-green-100 text-green-700 border border-green-200",
            Pending: "bg-gray-100 text-gray-700 border border-gray-200",
            Partial: "bg-amber-100 text-amber-800 border border-amber-200",
            Due: "bg-red-100 text-red-700 border border-red-200",
            Overdue: "bg-red-100 text-red-700 border border-red-200",
          }
          const dotStyles: Record<string, string> = {
            Paid: "bg-green-500",
            Pending: "bg-gray-400",
            Partial: "bg-amber-500",
            Due: "bg-red-500",
            Overdue: "bg-red-500",
          }
          return (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                statusStyles[row.status] || "bg-gray-100 text-gray-700 border border-gray-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[row.status] || "bg-gray-400"}`} />
              {row.status}
            </span>
          )
        },
      },
    ],
    [],
  )

  const pagedRepayments = repayments.slice(schedPage * schedRowsPerPage, (schedPage + 1) * schedRowsPerPage)

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
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-muted rounded-lg" />
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="h-64 bg-muted rounded-lg" />
              <div className="h-64 bg-muted rounded-lg" />
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Loan not found</h1>
            <p className="text-muted-foreground mt-1">The requested Sacco loan could not be found.</p>
            <Link href="/sacco-loans">
              <Button className="mt-6">Back to Sacco loans</Button>
            </Link>
          </div>
        )}
      </div>
    )
  }

  const canApproveOrReject =
    loan.status === "Applied" || loan.status === "Under Review" || loan.status === "Reviewed"

  const statusStyle = getStatusStyle(loan.status)
  const repaymentProgress = Math.max(
    0,
    Math.min(100, ((loan.principal_amount - loan.outstanding_balance) / Math.max(loan.principal_amount, 1)) * 100),
  )
  const monthlyPayment = Number(loan.monthly_payment || 0)
  const remainingTenureMonths = loan.tenure_months
  const titleProduct = loan.loan_product?.trim() || "Sacco loan"

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/sacco-loans"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sacco loans
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-xl border bg-card">
          <div className="h-20 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row gap-5 -mt-8">
              <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
                <CreditCard className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pt-1 sm:pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <h1 className="text-2xl font-bold tracking-tight truncate">{titleProduct}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium w-fit ${statusStyle.bg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                    {loan.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                  <span>{loan.client_name || "Client"}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2 pt-2">
                {canApproveOrReject && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={statusActionLoading}
                      onClick={() => void patchLoanStatus("Rejected")}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={statusActionLoading}
                      onClick={() => void patchLoanStatus("Approved")}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </>
                )}
                <Link href="/clients">
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    Clients
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-blue-100">
                <Banknote className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Principal</span>
            </div>
            <div className="text-xl font-bold">{formatCurrency(loan.principal_amount)}</div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-orange-100">
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Outstanding</span>
            </div>
            <div className="text-xl font-bold">{formatCurrency(loan.outstanding_balance)}</div>
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
              <span className="text-xs font-medium text-muted-foreground">Monthly payment</span>
            </div>
            <div className="text-xl font-bold">{formatCurrency(monthlyPayment)}</div>
            {(loan.overdue_days ?? 0) > 0 && (
              <p className="text-xs text-red-600 font-medium mt-1">{loan.overdue_days} days overdue</p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-purple-100">
                <Percent className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Interest rate</span>
            </div>
            <div className="text-xl font-bold">{loan.interest_rate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{remainingTenureMonths} months tenure</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Loan information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <SectionLabel>Loan product</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">{loan.loan_product?.trim() || "—"}</p>
                </div>
                <div>
                  <SectionLabel>Interest rate</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">{loan.interest_rate}% per annum</p>
                </div>
                <div>
                  <SectionLabel>Loan type</SectionLabel>
                  <p className="text-sm font-medium mt-0.5 capitalize">
                    {String(loan.loan_type || "normal").replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <SectionLabel>Tenure</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">{loan.tenure_months} months</p>
                </div>
                <div>
                  <SectionLabel>Application date</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">
                    {loan.application_date ? formatDate(loan.application_date) : "—"}
                  </p>
                </div>
                <div>
                  <SectionLabel>Approved at</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">
                    {loan.approved_at ? formatDateTime(loan.approved_at) : "—"}
                  </p>
                </div>
                <div>
                  <SectionLabel>Rejected at</SectionLabel>
                  <p className="text-sm font-medium mt-0.5">
                    {loan.rejected_at ? formatDateTime(loan.rejected_at) : "—"}
                  </p>
                </div>
                {loan.disbursement_date && (
                  <div>
                    <SectionLabel>Disbursement date</SectionLabel>
                    <p className="text-sm font-medium mt-0.5">{formatDate(loan.disbursement_date)}</p>
                  </div>
                )}
                <div>
                  <SectionLabel>Next payment date</SectionLabel>
                  <p className="text-sm font-medium mt-0.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {loan.next_payment_date ? formatDate(loan.next_payment_date) : "—"}
                  </p>
                </div>
                <div>
                  <SectionLabel>Maturity date</SectionLabel>
                  <p className="text-sm font-medium mt-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {loan.maturity_date ? formatDate(loan.maturity_date) : "—"}
                  </p>
                </div>
                {loan.purpose && (
                  <div className="col-span-2">
                    <SectionLabel>Purpose</SectionLabel>
                    <p className="text-sm font-medium mt-0.5">{loan.purpose}</p>
                  </div>
                )}
                {loan.collateral_description && (
                  <div className="col-span-2">
                    <SectionLabel>Collateral</SectionLabel>
                    <p className="text-sm font-medium mt-0.5 whitespace-pre-wrap">{loan.collateral_description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Client information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {loan.client_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{loan.client_name || "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DataTable<RepaymentRow>
          columns={repaymentColumns}
          rows={pagedRepayments}
          loading={loading}
          title="Repayments"
          emptyMessage="No repayment rows yet"
          getRowId={(row) => row.id}
          pagination={{
            page: schedPage,
            rowsPerPage: schedRowsPerPage,
            total: repayments.length,
            onPageChange: (_e, newPage) => setSchedPage(newPage),
            onRowsPerPageChange: (e: ChangeEvent<HTMLInputElement>) => {
              setSchedRowsPerPage(parseInt(e.target.value, 10))
              setSchedPage(0)
            },
            rowsPerPageOptions: [6, 12, 18],
          }}
        />

        <div className="flex justify-end space-x-4 pt-6 border-t">
          {(loan.status === "Approved" || loan.status === "Partially Disbursed") && (
            <Button
              type="button"
              disabled={statusActionLoading}
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
              type="button"
              disabled={statusActionLoading}
              onClick={() => {
                setDisburseLoanOpen(false)
                setRecordPaymentOpen(true)
              }}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Record payment
            </Button>
          )}
        </div>
      </div>

      <AddRecordPayment
        isOpen={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        loanId={loanId}
        onSuccess={() => void load()}
      />

      <Disburse
        isOpen={disburseLoanOpen}
        onClose={() => setDisburseLoanOpen(false)}
        loanId={loanId}
        completeDisbursementAmount={Number(loan.disbursement_balance ?? 0)}
        loanType={String(loan.loan_type || "normal").replace(/_/g, " ")}
      />
    </>
  )
}
