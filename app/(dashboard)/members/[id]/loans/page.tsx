"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import type { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { useStaffSession } from "@/components/staff-session-provider"
import { cn } from "@/lib/utils"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import { readClientTerminology, readInstitutionCurrency } from "@/lib/institution-branch-config"
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  Lock,
  TrendingUp,
  XCircle,
} from "lucide-react"

type MemberSummary = {
  id: string
  fullName: string
  clientNumber: string
}

type MemberLoanRow = {
  id: string
  applicationId: string
  loanProduct: string
  principalAmount: number
  outstandingBalance: number
  interestRate: number
  tenureMonths: number
  applicationDate: string
  status: string
  nextPaymentDate: string | null
}

const LOAN_STATUS_OPTIONS = [
  { value: "Applied", label: "Applied" },
  { value: "Under Review", label: "Under Review" },
  { value: "Reviewed", label: "Reviewed" },
  { value: "Approved", label: "Approved" },
  { value: "Partially Disbursed", label: "Partially Disbursed" },
  { value: "Fully Disbursed", label: "Fully Disbursed" },
  { value: "Active", label: "Active" },
  { value: "Rejected", label: "Rejected" },
  { value: "Closed", label: "Closed" },
  { value: "Defaulted", label: "Defaulted" },
]

const LOAN_TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "top up", label: "Top Up" },
  { value: "buy off", label: "Buy Off" },
  { value: "sell off", label: "Sell Off" },
]

function appendQueryParams(params: URLSearchParams, queryParams?: Record<string, unknown>) {
  if (!queryParams) return
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
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

function mapLoanRows(items: Record<string, unknown>[]): MemberLoanRow[] {
  return items.map((l) => ({
    id: String(l.id),
    applicationId: String(l.application_id || ""),
    loanProduct: String(l.productName || "Loan"),
    principalAmount: Number(l.principal_amount || 0),
    outstandingBalance: Number(l.outstanding_balance || 0),
    interestRate: Number(l.interest_rate || 0),
    tenureMonths: Number(l.tenure_months || 0),
    applicationDate: String(l.application_date || ""),
    status: String(l.status || ""),
    nextPaymentDate: l.next_payment_date != null ? String(l.next_payment_date) : null,
  }))
}

function formatDate(value: string) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getStatusIcon(status: string) {
  switch (status) {
    case "Applied":
      return <Clock className="h-4 w-4 text-accent" />
    case "Under Review":
    case "Reviewed":
      return <Eye className="h-4 w-4 text-accent" />
    case "Approved":
    case "Partially Disbursed":
    case "Fully Disbursed":
    case "Active":
      return <CheckCircle className="h-4 w-4 text-emerald-600" />
    case "Rejected":
    case "Defaulted":
      return <XCircle className="h-4 w-4 text-destructive" />
    case "Closed":
      return <Lock className="h-4 w-4 text-foreground" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "Applied":
    case "Under Review":
    case "Reviewed":
      return "bg-accent/10 text-accent border border-accent/30"
    case "Approved":
    case "Partially Disbursed":
    case "Fully Disbursed":
    case "Active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "Rejected":
    case "Defaulted":
      return "bg-destructive/10 text-destructive border border-destructive/30"
    case "Closed":
      return "bg-foreground/5 text-foreground border border-border"
    default:
      return "bg-muted text-muted-foreground border border-border"
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export default function UserLoansPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { session } = useStaffSession()

  const [member, setMember] = useState<MemberSummary | null>(null)
  const [loans, setLoans] = useState<MemberLoanRow[]>([])
  const [loansTotal, setLoansTotal] = useState(0)
  const [loanSummary, setLoanSummary] = useState({
    totalLoans: 0,
    activeLoans: 0,
    totalBorrowed: 0,
    totalOutstanding: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loansLoading, setLoansLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loansPage, setLoansPage] = useState(0)
  const [loansRowsPerPage, setLoansRowsPerPage] = useState(10)
  const [activeLoansQueryParams, setActiveLoansQueryParams] = useState<Record<string, unknown>>({})
  const includeSummaryRef = useRef(true)

  const currency = readInstitutionCurrency(session?.institution?.config)
  const formatMoney = (amount: number) => fmtCurrency(amount, currency, { fractionDigits: 2 })
  const clientTerm = readClientTerminology(session?.institution?.config, "Member")

  const loanFilterFields = useMemo((): FilterField[] => {
    return [
      {
        field: "status",
        label: "Status",
        type: "select",
        options: LOAN_STATUS_OPTIONS,
      },
      {
        field: "loan_type",
        label: "Loan type",
        type: "select",
        options: LOAN_TYPE_OPTIONS,
      },
      {
        field: "applicationDate",
        label: "Application date range",
        type: "date-range",
      },
    ]
  }, [])

  const loadLoans = useCallback(
    async (queryParams?: Record<string, unknown>, pageOverride?: number, rowsPerPageOverride?: number) => {
      setLoansLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("member_id", userId)
        appendQueryParams(params, queryParams)

        if (includeSummaryRef.current) {
          params.set("include_summary", "true")
        }

        const requestPage = typeof pageOverride === "number" ? pageOverride : loansPage
        const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : loansRowsPerPage
        params.set("page", String(requestPage + 1))
        params.set("pageSize", String(requestRows))

        const res = await fetch(`/api/institution/loans?${params.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load loans")

        setLoans(mapLoanRows(Array.isArray(data.items) ? data.items : []))
        setLoansTotal(Number(data.total || 0))
        if (data.summary) {
          setLoanSummary({
            totalLoans: Number(data.summary.totalLoans || 0),
            activeLoans: Number(data.summary.activeLoans || 0),
            totalBorrowed: Number(data.summary.totalBorrowed || 0),
            totalOutstanding: Number(data.summary.totalOutstanding || 0),
          })
          includeSummaryRef.current = false
        }
      } catch {
        setLoans([])
        setLoansTotal(0)
      } finally {
        setLoansLoading(false)
      }
    },
    [userId, loansPage, loansRowsPerPage],
  )

  useEffect(() => {
    let cancelled = false

    async function loadMember() {
      setLoading(true)
      setError(null)
      includeSummaryRef.current = true
      try {
        const memberRes = await fetch(`/api/institution/members/${userId}`, { cache: "no-store" })
        const memberData = await memberRes.json().catch(() => ({}))

        if (cancelled) return

        if (!memberRes.ok || !memberData?.member) {
          setMember(null)
          setError(memberData?.error || "Member not found")
          return
        }

        const row = memberData.member
        setMember({
          id: String(row.id),
          fullName: String(row.full_name || ""),
          clientNumber: String(row.member_number || ""),
        })
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load member")
          setMember(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadMember()
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleLoansQueryParamsChange = useCallback(
    (params: object) => {
      setLoansPage(0)
      const normalized = params as Record<string, unknown>
      setActiveLoansQueryParams(normalized)
      void loadLoans(normalized, 0, loansRowsPerPage)
    },
    [loadLoans, loansRowsPerPage],
  )

  const handleLoansPageChange = useCallback(
    (_: unknown, newPage: number) => {
      setLoansPage(newPage)
      void loadLoans(activeLoansQueryParams, newPage, loansRowsPerPage)
    },
    [activeLoansQueryParams, loadLoans, loansRowsPerPage],
  )

  const handleLoansRowsPerPageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const nextRowsPerPage = parseInt(e.target.value, 10)
      setLoansRowsPerPage(nextRowsPerPage)
      setLoansPage(0)
      void loadLoans(activeLoansQueryParams, 0, nextRowsPerPage)
    },
    [activeLoansQueryParams, loadLoans],
  )

  const loanColumns = useMemo((): DataTableColumn<MemberLoanRow>[] => {
    return [
      {
        key: "applicationId",
        header: "Application",
        render: (row) => <span className="font-medium">{row.applicationId || "—"}</span>,
      },
      {
        key: "loanProduct",
        header: "Product",
        render: (row) => (
          <div>
            <p className="font-medium">{row.loanProduct}</p>
            <p className="text-xs text-muted-foreground">{row.interestRate}% interest</p>
          </div>
        ),
      },
      {
        key: "principalAmount",
        header: "Principal",
        render: (row) => <span className="font-medium whitespace-nowrap">{formatMoney(row.principalAmount)}</span>,
      },
      {
        key: "outstandingBalance",
        header: "Outstanding",
        render: (row) => (
          <span className="font-medium whitespace-nowrap text-accent">{formatMoney(row.outstandingBalance)}</span>
        ),
      },
      {
        key: "tenureMonths",
        header: "Tenure",
        render: (row) => <span>{row.tenureMonths} months</span>,
      },
      {
        key: "applicationDate",
        header: "Applied",
        render: (row) => (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(row.applicationDate)}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <div className="flex items-center gap-2">
            {getStatusIcon(row.status)}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                getStatusClass(row.status),
              )}
            >
              {row.status}
            </span>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <div className="flex justify-center">
            <ActionButtons
              actions={[
                {
                  icon: <Eye className="h-4 w-4" />,
                  label: "View loan",
                  variant: "view",
                  onClick: () => router.push(`/loans/${row.id}`),
                },
              ]}
              row={row}
            />
          </div>
        ),
      },
    ]
  }, [currency, router])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse space-y-6">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl border bg-muted/40" />
          ))}
        </div>
        <div className="h-64 rounded-xl border bg-muted/40" />
      </div>
    )
  }

  if (!member) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <h1 className="text-2xl font-bold">{clientTerm} not found</h1>
        <p className="text-muted-foreground">
          The requested {clientTerm.toLowerCase()} could not be found or you may not have access.
        </p>
        <Link href="/members">
          <Button className="mt-2">Back to {clientTerm}s</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link
        href={`/members/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-14 bg-linear-to-r from-accent/20 via-accent/10 to-transparent" />
        <div className="px-6 pb-5 -mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Loans</h1>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {member.fullName} · {member.clientNumber}
              </p>
            </div>
            <Link href={`/members/${userId}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                View profile
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total loans"
          value={String(loanSummary.totalLoans)}
          icon={CreditCard}
          accent="bg-foreground/5 text-foreground"
        />
        <StatCard
          label="Active loans"
          value={String(loanSummary.activeLoans)}
          icon={CheckCircle}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total borrowed"
          value={formatMoney(loanSummary.totalBorrowed)}
          icon={DollarSign}
          accent="bg-accent/10 text-accent"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(loanSummary.totalOutstanding)}
          icon={TrendingUp}
          accent="bg-accent/10 text-accent"
        />
      </div>

      <DataTable<MemberLoanRow>
        columns={loanColumns}
        rows={loans}
        loading={loansLoading}
        title={`Loan history (${loansTotal})`}
        filterFields={loanFilterFields}
        onQueryParamsChange={handleLoansQueryParamsChange}
        emptyMessage={`No loans found for this ${clientTerm.toLowerCase()}.`}
        getRowId={(row) => row.id}
        pagination={{
          page: loansPage,
          rowsPerPage: loansRowsPerPage,
          total: loansTotal,
          onPageChange: handleLoansPageChange,
          onRowsPerPageChange: handleLoansRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
      />
    </div>
  )
}
