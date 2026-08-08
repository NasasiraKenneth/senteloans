"use client"

import { use, useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  CreditCard,
  User,
  Calendar,
  DollarSign,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Lock,
  ArrowRight,
  TrendingUp,
  Percent,
  Banknote,
  Eye,
  EyeOff,
  Coins,
  Activity,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

// DataTable component imports
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"

type RepaymentRow = {
  installment: number
  dueDate?: string | null
  principal: number
  interest: number
  totalPayment: number
  amountPaid: number
  paymentDate?: string | null
  penaltyAmount: number
  amountDue: number
  daysOverdue: number
  status: string
}

type LoanDetails = {
  id: string
  applicationId: string
  memberName?: string
  memberNumber?: string
  memberId?: string
  loanProduct: string
  principalAmount: number
  interestRate: number
  tenure: number
  remainingTenure: number
  outstandingBalance: number
  monthlyPayment: number
  status: string
  purpose?: string
  applicationDate?: string | null
  approvalDate?: string | null
  disbursementDate?: string | null
  maturityDate?: string | null
  nextPaymentDate?: string | null
  overdueDays: number
  loanOfficer?: string | null
  repayments: RepaymentRow[]
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function ClientLoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const { data, formatMoney } = useClientSession()
  const currentClient = data?.client
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("loans")

  const [loan, setLoan] = useState<LoanDetails | null>(null)
  const [repayments, setRepayments] = useState<RepaymentRow[]>([])
  const [repaymentsTotal, setRepaymentsTotal] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  // Repayment schedule pagination & query params
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  const onPageChange = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10)
    setPage(0)
    setRowsPerPage(next)
  }

  const loadLoanDetails = useCallback(
    async (queryParams?: object) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (queryParams) {
          Object.entries(queryParams).forEach(([key, value]) => {
            if (
              value &&
              typeof value === "object" &&
              "start" in (value as Record<string, unknown>) &&
              "end" in (value as Record<string, unknown>)
            ) {
              const range = value as { start?: string; end?: string }
              if (range.start) params.set(`${key}Start`, range.start)
              if (range.end) params.set(`${key}End`, range.end)
              return
            }
            if (value !== undefined && value !== null && String(value).trim() !== "") {
              params.set(key, String(value))
            }
          })
        }
        params.set("page", String(page + 1))
        params.set("pageSize", String(rowsPerPage))

        const res = await fetch(`/api/client/loans/${id}?${params.toString()}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/client-login?redirect=${encodeURIComponent(`/client-portal/loans/${id}`)}`)
            return
          }
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Failed to load loan: ${res.status}`)
        }
        const json = await res.json()
        if (json.loan) {
          setLoan(json.loan)
          setRepayments(Array.isArray(json.loan.repayments) ? json.loan.repayments : [])
        }
        if (json.repaymentPagination) {
          setRepaymentsTotal(json.repaymentPagination.total || 0)
        } else {
          setRepaymentsTotal(json.loan?.repayments?.length || 0)
        }
        setError(null)
      } catch (e: any) {
        setError(e?.message || "Failed to load loan details")
      } finally {
        setIsLoading(false)
      }
    },
    [id, page, router, rowsPerPage]
  )

  useEffect(() => {
    void loadLoanDetails(activeQueryParams)
  }, [loadLoanDetails])

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0)
      const normalized = params as Record<string, unknown>
      setActiveQueryParams(normalized)
      const flat: Record<string, string> = {}
      Object.entries(normalized).forEach(([k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "start" in (v as Record<string, unknown>) &&
          "end" in (v as Record<string, unknown>)
        ) {
          const range = v as { start?: string; end?: string }
          if (range.start) flat[`${k}Start`] = range.start
          if (range.end) flat[`${k}End`] = range.end
          return
        }
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          flat[k] = String(v)
        }
      })
      setActiveFilters(flat)
      void loadLoanDetails(params)
    },
    [loadLoanDetails]
  )

  const downloadRepaymentsExport = async (format: "excel" | "pdf") => {
    setExporting(format)
    try {
      const q = new URLSearchParams()
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v) q.set(k, v)
      })
      q.set("format", format)

      const res = await fetch(`/api/client/loans/${id}/export?${q.toString()}`, {
        method: "GET",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename =
        match?.[1] ||
        `repayment-schedule-${loan?.applicationId || id}-${new Date().toISOString().slice(0, 10)}.${
          format === "excel" ? "xlsx" : "pdf"
        }`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded repayment schedule ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description: String(e?.message || `Failed to download ${format.toUpperCase()}.`),
      })
    } finally {
      setExporting(null)
    }
  }

  // Next unpaid installment highlight
  const nextUnpaidInstallment = useMemo(() => {
    return repayments.find((r) => r.status !== "Paid")?.installment ?? null
  }, [repayments])

  const getRepaymentStatusColor = (status: string) => {
    const s = String(status || "").toLowerCase()
    switch (s) {
      case "paid":
        return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      case "due":
      case "pending":
        return "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
      case "overdue":
        return "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
      case "partial":
      case "partially paid":
        return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
      default:
        return "bg-slate-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
    }
  }

  // DataTable columns mirroring app/(dashboard)/loans/[id]/page.tsx
  const repaymentColumns: DataTableColumn<RepaymentRow>[] = useMemo(
    () => [
      {
        key: "installment",
        header: "#",
        render: (row) => (
          <span className="font-semibold text-xs font-mono text-foreground">
            #{row.installment}
          </span>
        ),
      },
      {
        key: "dueDate",
        header: "Due Date",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span>{formatDate(row.dueDate)}</span>
          </div>
        ),
      },
      {
        key: "principal",
        header: "Principal",
        render: (row) => (
          <div className="text-xs font-mono text-foreground">
            {showBalance ? formatMoney(row.principal) : "••••••"}
          </div>
        ),
      },
      {
        key: "interest",
        header: "Interest",
        render: (row) => (
          <div className="text-xs font-mono text-muted-foreground">
            {showBalance ? formatMoney(row.interest) : "••••••"}
          </div>
        ),
      },
      {
        key: "totalPayment",
        header: "Monthly Due",
        render: (row) => (
          <div className="font-semibold text-xs font-mono text-foreground">
            {showBalance ? formatMoney(row.totalPayment) : "••••••"}
          </div>
        ),
      },
      {
        key: "amountPaid",
        header: "Amount Paid",
        render: (row) => (
          <div
            className={cn(
              "text-xs font-mono font-medium",
              row.amountPaid > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}
          >
            {showBalance ? formatMoney(row.amountPaid) : "••••••"}
          </div>
        ),
      },
      {
        key: "paymentDate",
        header: "Payment Date",
        render: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.paymentDate ? formatDate(row.paymentDate) : "—"}
          </span>
        ),
      },
      {
        key: "penaltyAmount",
        header: "Penalty",
        render: (row) => (
          <span
            className={cn(
              "text-xs font-mono font-medium",
              row.penaltyAmount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
            )}
          >
            {showBalance ? formatMoney(row.penaltyAmount) : "••••••"}
          </span>
        ),
      },
      {
        key: "amountDue",
        header: "Amount Due",
        render: (row) => {
          const isNextPayment = nextUnpaidInstallment !== null && row.installment === nextUnpaidInstallment
          return (
            <span
              className={cn(
                "text-xs font-mono font-semibold",
                isNextPayment
                  ? "text-[#f08c2b]"
                  : row.amountDue > 0
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {showBalance ? formatMoney(row.amountDue) : "••••••"}
            </span>
          )
        },
      },
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const s = String(row.status || "").toLowerCase()
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                getRepaymentStatusColor(row.status)
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  s === "paid"
                    ? "bg-emerald-500"
                    : s === "overdue"
                    ? "bg-rose-500"
                    : "bg-amber-500"
                )}
              />
              {row.status}
            </span>
          )
        },
      },
    ],
    [formatMoney, nextUnpaidInstallment, showBalance]
  )

  // Filter fields for repayment schedule
  const repaymentFilterFields: FilterField[] = useMemo(
    () => [
      {
        field: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "All Statuses", value: "all" },
          { label: "Paid", value: "paid" },
          { label: "Pending", value: "pending" },
          { label: "Overdue", value: "overdue" },
          { label: "Partially Paid", value: "partially paid" },
        ],
      },
      {
        field: "date",
        label: "Due Date Range",
        type: "date-range",
      },
    ],
    []
  )

  const repaymentProgress = useMemo(() => {
    if (!loan || loan.principalAmount <= 0) return 0
    return Math.max(
      0,
      Math.min(
        100,
        ((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100
      )
    )
  }, [loan])

  if (isLoading && !loan) {
    return (
      <div className="w-full space-y-6">
        <ClientPortalPageHeader
          title="Loan Facility Details"
          description="Fetching loan ledger and repayment schedule..."
          backHref="/client-portal/loans"
          backLabel="All Loans"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
        </div>
      </div>
    )
  }

  if (error || !loan) {
    return (
      <div className="w-full space-y-6">
        <ClientPortalPageHeader
          title="Loan Facility Details"
          description="Could not find the requested loan facility"
          backHref="/client-portal/loans"
          backLabel="All Loans"
        />
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">
          <p className="font-semibold">{error || "Loan account not found."}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/client-portal/loans")}
          >
            Return to Loans Portfolio
          </Button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full space-y-6"
    >
      <ClientPortalPageHeader
        title={`${loan.loanProduct} • ${loan.applicationId}`}
        description={`Active credit line for ${loan.memberName || currentClient?.fullName || "Member"} • Purpose: ${loan.purpose || "Sacco financing"}`}
        backHref="/client-portal/loans"
        backLabel="All Loans"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBalance((v) => !v)}
              className="gap-2 cursor-pointer"
              aria-label={showBalance ? "Hide balances" : "Show balances"}
            >
              {showBalance ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              <span className="text-xs">{showBalance ? "Hide" : "Show"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void downloadRepaymentsExport("pdf")}
              disabled={exporting !== null}
              className="text-xs font-semibold gap-1.5"
            >
              <FileText className="h-3.5 w-3.5 text-rose-500" />
              Download Statement (PDF)
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ClientPortalSummaryCard
          variant="loans"
          label="Principal Amount"
          value={showBalance ? formatMoney(loan.principalAmount) : "••••••"}
          icon={Coins}
          sub={`Tenure: ${loan.tenure} months`}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Outstanding Balance"
          value={showBalance ? formatMoney(loan.outstandingBalance) : "••••••"}
          icon={TrendingDown}
          sub="Principal balance remaining"
          index={1}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Monthly Installment"
          value={showBalance ? formatMoney(loan.monthlyPayment) : "••••••"}
          icon={Calendar}
          sub={`Rate: ${loan.interestRate}% p.a.`}
          index={2}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Next Payment Date"
          value={loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : "—"}
          icon={Clock}
          sub={
            loan.overdueDays > 0 ? `${loan.overdueDays} days overdue` : "Installment schedule up to date"
          }
          index={3}
        />
      </div>

      {/* Progress Bar Card */}
      <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Loan Repayment & Settlement Progress
            </span>
            <span className="font-mono text-[#f08c2b]">{Math.round(repaymentProgress)}% Settled</span>
          </div>
          <Progress value={repaymentProgress} className="h-2 bg-muted" indicatorClassName="bg-[#f08c2b]" />
        </CardContent>
      </Card>

      {/* 2-Column Info Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Loan Information Card */}
        <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
            <CreditCard className="h-4.5 w-4.5 text-[#f08c2b]" />
            <CardTitle className="text-sm font-semibold">Loan Information</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Product Type</span>
              <span className="font-semibold text-foreground">{loan.loanProduct}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Interest Rate</span>
              <span className="font-mono font-semibold text-foreground">{loan.interestRate}% p.a.</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Total Tenure</span>
              <span className="font-mono font-semibold text-foreground">{loan.tenure} Months</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Application Date</span>
              <span className="font-mono text-muted-foreground">{formatDate(loan.applicationDate)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Disbursement Date</span>
              <span className="font-mono text-muted-foreground">{formatDate(loan.disbursementDate)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Maturity Date</span>
              <span className="font-mono font-semibold text-foreground">{formatDate(loan.maturityDate)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Member & Sacco Details Card */}
        <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
            <User className="h-4.5 w-4.5 text-[#f08c2b]" />
            <CardTitle className="text-sm font-semibold">Member & Facility Details</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Borrower Name</span>
              <span className="font-semibold text-foreground">
                {loan.memberName || currentClient?.fullName || "Member"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Member Number</span>
              <span className="font-mono font-semibold text-foreground">
                {loan.memberNumber || currentClient?.clientNumber || "—"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Facility Status</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider",
                  loan.status === "Disbursed" || loan.status === "Active"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                    : loan.status === "Applied"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {loan.status}
              </Badge>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Purpose</span>
              <span className="font-medium text-foreground max-w-[200px] truncate text-right">
                {loan.purpose || "Business & personal development"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Paid Principal</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {showBalance
                  ? formatMoney(Math.max(0, loan.principalAmount - loan.outstandingBalance))
                  : "••••••"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Remaining Principal</span>
              <span className="font-mono font-semibold text-[#f08c2b]">
                {showBalance ? formatMoney(loan.outstandingBalance) : "••••••"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full-width Repayment Schedule DataTable */}
      <div className="col-span-full space-y-4">
        <DataTable<RepaymentRow>
          title={`Repayment Schedule (${repaymentsTotal} installments)`}
          columns={repaymentColumns}
          rows={repayments}
          filterFields={repaymentFilterFields}
          onQueryParamsChange={handleQueryParamsChange}
          loading={isLoading}
          emptyMessage="No repayment installments found matching the filter criteria."
          getRowId={(row) => String(row.installment)}
          pagination={{
            page,
            rowsPerPage,
            total: repaymentsTotal,
            onPageChange,
            onRowsPerPageChange,
            rowsPerPageOptions: [10, 25, 50],
          }}
          exportActions={{
            onExcel: () => void downloadRepaymentsExport("excel"),
            onPdf: () => void downloadRepaymentsExport("pdf"),
            excelDisabled: isLoading || repayments.length === 0 || exporting !== null,
            pdfDisabled: isLoading || repayments.length === 0 || exporting !== null,
            excelLoading: exporting === "excel",
            pdfLoading: exporting === "pdf",
          }}
        />
      </div>
    </motion.div>
  )
}
