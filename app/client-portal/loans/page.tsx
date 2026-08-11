"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CreditCard,
  Plus,
  Info,
  Calendar,
  Wallet,
  Activity,
  ArrowRight,
  TrendingUp,
  BadgePercent,
  Coins,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  FileText,
  Calculator,
  Eye,
  EyeOff,
  Lock,
  Clock,
  DollarSign,
  XCircle,
  Loader2,
} from "lucide-react"

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
import LoanCalculatorModal from "@/app/(dashboard)/loans/components/calculator"

// Recharts components for breakdown
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ChartTooltip, Legend } from "recharts"

export type ClientLoan = {
  id: string
  loanProduct: string
  applicationId: string
  memberName?: string
  memberNumber?: string
  principalAmount: number
  outstandingBalance: number
  interestRate: number
  tenure: number
  remainingTenure?: number
  status: string
  applicationDate?: string
  disbursementDate?: string | null
  nextPaymentDate?: string | null
  overdueDays?: number
}

type SummaryStats = {
  totalPrincipal: number
  totalOutstanding: number
  totalLoans: number
  activeLoans: number
}

type CalendarEvent = {
  id?: string
  dateStr: string // YYYY-MM-DD
  type: "status_change" | "repayment" | "overdue"
  appId: string
  product: string
  title: string
  amount: number
  status: "Paid" | "Pending" | "Overdue" | "Disbursed" | "Applied" | "Approved" | "Closed" | "Completed"
  description?: string
  installmentNumber?: number
}

const PIE_COLORS = ["#f08c2b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#6366f1"]

function formatTxDate(dateStr?: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getInitials(name?: string): string {
  if (!name) return "LN"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ClientLoansPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { data, formatMoney } = useClientSession()
  const currentClient = data?.client
  const institution = data?.institution
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("loans")

  const [loans, setLoans] = useState<ClientLoan[]>([])
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [total, setTotal] = useState<number>(0)
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [showCalculator, setShowCalculator] = useState(false)

  // Calendar configurations
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false)

  const onPageChange = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10)
    setPage(0)
    setRowsPerPage(next)
  }

  // Load available loan products for filter
  useEffect(() => {
    let ignore = false
    async function loadProducts() {
      try {
        const res = await fetch("/api/client/loan-products")
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        const items = Array.isArray(json.products)
          ? json.products
          : Array.isArray(json.items)
            ? json.items
            : []
        setProducts(items.map((p: Record<string, unknown>) => ({ id: String(p.id), name: String(p.name || p.product_name) })))
      } catch {}
    }
    void loadProducts()
    return () => {
      ignore = true
    }
  }, [])

  // Load loans
  const loadLoans = useCallback(
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

        const res = await fetch(`/api/client/loans?${params.toString()}`, { cache: "no-store" })
        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/client-login?redirect=${encodeURIComponent("/client-portal/loans")}`)
            return
          }
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Failed to load loans: ${res.status}`)
        }
        const json = await res.json()
        setLoans(Array.isArray(json.loans) ? json.loans : [])
        setTotal(json.total ?? (Array.isArray(json.loans) ? json.loans.length : 0))
        if (json.summaryStats) {
          setSummaryStats(json.summaryStats)
        }
        setError(null)
      } catch (e: any) {
        setError(e?.message || "Failed to load loans portfolio")
      } finally {
        setIsLoading(false)
        setIsInitialLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    void loadLoans(activeQueryParams)
  }, [loadLoans])

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
          if (k === "date" || k === "application_date") {
            if (range.start) flat["date_from"] = range.start
            if (range.end) flat["date_to"] = range.end
          } else {
            if (range.start) flat[`${k}Start`] = range.start
            if (range.end) flat[`${k}End`] = range.end
          }
          return
        }
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          flat[k] = String(v)
        }
      })
      setActiveFilters(flat)
      void loadLoans(params)
    },
    [loadLoans]
  )

  const downloadLoansExport = async (format: "excel" | "pdf") => {
    setExporting(format)
    try {
      const q = new URLSearchParams()
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v) q.set(k, v)
      })
      q.set("format", format)

      const res = await fetch(`/api/client/loans/export?${q.toString()}`, {
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
        `loans-portfolio-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`
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
        description: `Successfully downloaded loans ${format.toUpperCase()} report.`,
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

  const paginatedLoans = useMemo(() => {
    return loans.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  }, [loans, page, rowsPerPage])

  const totals = useMemo(() => {
    const totalPrincipal =
      summaryStats?.totalPrincipal ?? loans.reduce((s, l) => s + Number(l.principalAmount || 0), 0)
    const totalOutstanding =
      summaryStats?.totalOutstanding ?? loans.reduce((s, l) => s + Number(l.outstandingBalance || 0), 0)
    const totalLoans = summaryStats?.totalLoans ?? loans.length
    const activeLoans =
      summaryStats?.activeLoans ??
      loans.filter((l) =>
        ["approved", "disbursed", "active", "partially disbursed", "fully disbursed"].includes(
          String(l.status || "").toLowerCase()
        )
      ).length
    return { totalPrincipal, totalOutstanding, totalLoans, activeLoans }
  }, [loans, summaryStats])

  const ratioData = useMemo(() => {
    const map: Record<string, number> = {}
    loans.forEach((l) => {
      const prod = l.loanProduct || "Standard Loan"
      map[prod] = (map[prod] || 0) + Number(l.principalAmount || 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [loans])

  const getStatusColor = (status: string) => {
    const s = String(status || "").toLowerCase()
    switch (s) {
      case "approved":
      case "disbursed":
      case "fully disbursed":
      case "active":
        return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      case "applied":
      case "under review":
      case "reviewed":
        return "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
      case "rejected":
      case "defaulted":
        return "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
      case "closed":
        return "bg-slate-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
      default:
        return "bg-slate-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
    }
  }

  // DataTable columns mirroring app/(dashboard)/loans/page.tsx with View Details eye button
  const columns: DataTableColumn<ClientLoan>[] = useMemo(
    () => [
      {
        key: "applicationId",
        header: "Application ID",
        render: (row) => (
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-[#f08c2b]/15 text-[#f08c2b] flex items-center justify-center font-bold text-[10px] shrink-0 border border-[#f08c2b]/25">
              {getInitials(row.memberName || currentClient?.fullName)}
            </div>
            <div>
              <div className="font-semibold text-xs font-mono">{row.applicationId}</div>
              <div className="text-[11px] text-muted-foreground">
                {row.memberName || currentClient?.fullName || "Member"}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "loanProduct",
        header: "Product",
        render: (row) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 whitespace-nowrap">
            {row.loanProduct}
          </span>
        ),
      },
      {
        key: "principalAmount",
        header: "Principal Amount",
        render: (row) => (
          <div className="font-semibold text-xs font-mono text-foreground">
            {showBalance ? formatMoney(Number(row.principalAmount || 0)) : "••••••"}
          </div>
        ),
      },
      {
        key: "interestRate",
        header: "Interest Rate",
        render: (row) => (
          <div className="text-xs font-medium text-muted-foreground font-mono">
            {Number(row.interestRate || 0)}% p.a.
          </div>
        ),
      },
      {
        key: "outstandingBalance",
        header: "Outstanding Balance",
        render: (row) => (
          <div className="font-semibold text-xs font-mono text-[#f08c2b]">
            {showBalance ? formatMoney(Number(row.outstandingBalance || 0)) : "••••••"}
          </div>
        ),
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
                getStatusColor(row.status)
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  ["approved", "disbursed", "fully disbursed", "active"].includes(s)
                    ? "bg-emerald-500"
                    : s === "defaulted" || s === "rejected"
                    ? "bg-rose-500"
                    : ["applied", "under review"].includes(s)
                    ? "bg-amber-500"
                    : "bg-slate-400"
                )}
              />
              {row.status}
            </span>
          )
        },
      },
      {
        key: "applicationDate",
        header: "Applied Date",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span>{formatTxDate(row.applicationDate)}</span>
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/client-portal/loans/${row.id}`)}
              title="View Loan Details"
              className="h-8 w-8 text-[#f08c2b] hover:bg-[#f08c2b]/10 hover:text-[#d97b1e] rounded-lg transition-colors cursor-pointer"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [currentClient?.fullName, formatMoney, router, showBalance]
  )

  // Filter fields matching dashboard configuration
  const filterFields: FilterField[] = useMemo(
    () => [
      {
        field: "search",
        label: "Search by application ID or product...",
        type: "text",
      },
      {
        field: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "All Statuses", value: "all" },
          { label: "Applied", value: "applied" },
          { label: "Under Review", value: "under review" },
          { label: "Approved", value: "approved" },
          { label: "Fully Disbursed", value: "fully disbursed" },
          { label: "Active", value: "active" },
          { label: "Defaulted", value: "defaulted" },
          { label: "Closed", value: "closed" },
          { label: "Rejected", value: "rejected" },
        ],
      },
      {
        field: "loan_product",
        label: "Loan Product",
        type: "select",
        options: [
          { label: "All Products", value: "all" },
          ...products.map((p) => ({ label: p.name, value: p.name })),
        ],
      },
      {
        field: "date",
        label: "Application Date",
        type: "date-range",
      },
    ],
    [products]
  )

  // Fetch dynamic calendar events from API when currentDate (month/year) changes
  useEffect(() => {
    let ignore = false
    async function loadCalendarEvents() {
      setIsLoadingCalendar(true)
      try {
        const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`
        const res = await fetch(`/api/client/loans/calendar?month=${monthStr}`, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        if (json.ok && Array.isArray(json.events)) {
          setCalendarEvents(json.events)
        }
      } catch (err) {
        console.error("Failed to load loan calendar events:", err)
      } finally {
        if (!ignore) setIsLoadingCalendar(false)
      }
    }
    void loadCalendarEvents()
    return () => {
      ignore = true
    }
  }, [currentDate])

  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const nextMonth = new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      setSelectedDate(nextMonth)
      return nextMonth
    })
  }

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const nextMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      setSelectedDate(nextMonth)
      return nextMonth
    })
  }

  const handleToday = () => {
    const today = new Date()
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()

    const days: (Date | null)[] = []
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null)
    }
    for (let i = 1; i <= lastDate; i++) {
      days.push(new Date(year, month, i))
    }
    return days
  }, [currentDate])

  const selectedDateStr = formatDateString(selectedDate)
  const activeDayEvents = calendarEvents.filter((ev) => ev.dateStr === selectedDateStr)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full space-y-6"
    >
      <ClientPortalPageHeader
        title="Credit & Loans"
        description="Manage active credit facilities, track repayment schedules, and apply for new financing"
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
              onClick={() => setShowCalculator(true)}
              className="gap-2 font-semibold shadow-sm text-xs border-border/80 hover:bg-black/50 cursor-pointer"
            >
              <Calculator className="h-4 w-4 text-[#f08c2b]" />
              Loan Calculator
            </Button>
            <Link href="/client-portal/apply-loan">
              <Button
                size="sm"
                className="gap-2 bg-[#f08c2b] text-white hover:bg-[#d97b1e] font-semibold shadow-sm transition-all text-xs cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Apply for Loan
              </Button>
            </Link>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isInitialLoading ? (
          <>
            <ClientPortalSummaryCardSkeleton />
            <ClientPortalSummaryCardSkeleton />
            <ClientPortalSummaryCardSkeleton />
            <ClientPortalSummaryCardSkeleton />
          </>
        ) : (
          <>
            <ClientPortalSummaryCard
              variant="loans"
              label="Total Borrowed"
              value={showBalance ? formatMoney(totals.totalPrincipal) : "••••••"}
              icon={Wallet}
              sub="Cumulative principal loans"
              index={0}
            />
            <ClientPortalSummaryCard
              variant="loans"
              label="Outstanding Balance"
              value={showBalance ? formatMoney(totals.totalOutstanding) : "••••••"}
              icon={TrendingUp}
              sub="Current total unpaid balance"
              index={1}
            />
            <ClientPortalSummaryCard
              variant="loans"
              label="Active Facilities"
              value={String(totals.activeLoans)}
              icon={Activity}
              sub="Active and serviced loans"
              index={2}
            />
            <ClientPortalSummaryCard
              variant="loans"
              label="Total Loans"
              value={String(totals.totalLoans)}
              icon={Coins}
              sub="Lifetime credit applications"
              index={3}
            />
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadLoans(activeQueryParams)}
            className="border-destructive/30 hover:bg-destructive/10"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Main Grid: Interactive Calendar & Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
        {/* Repayment and Status Calendar */}
        <Card className="border-border/80 shadow-sm bg-card overflow-hidden lg:col-span-2 flex flex-col h-full">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Repayment & Status Tracker</CardTitle>
              {isLoadingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f08c2b]" />}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold uppercase tracking-wider px-2"
                onClick={handleToday}
              >
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePrevMonth} aria-label="Previous Month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground w-28 sm:w-32 text-center">
                {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleNextMonth} aria-label="Next Month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0 space-y-4">
            {/* Top: Calendar Grid (Large & Prominent) */}
            <div className="shrink-0">
              <div className="grid grid-cols-7 gap-2 text-center text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="h-16 sm:h-18 md:h-20 w-full bg-transparent" />
                  const dayStr = formatDateString(day)
                  const isSelected = selectedDateStr === dayStr
                  const dayEvents = calendarEvents.filter((ev) => ev.dateStr === dayStr)
                  const isToday = formatDateString(new Date()) === dayStr

                  return (
                    <button
                      key={dayStr}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "h-16 sm:h-18 md:h-20 w-full flex flex-col items-center justify-between p-2 sm:p-2.5 rounded-xl border border-border/45 relative transition-all duration-200",
                        isSelected
                          ? "border-[#f08c2b] bg-[#f08c2b]/15 text-[#f08c2b] font-bold shadow-sm ring-2 ring-[#f08c2b]/40"
                          : "hover:bg-muted/40 hover:border-border text-foreground",
                        isToday && !isSelected && "border-[#f08c2b]/50 font-bold bg-[#f08c2b]/5"
                      )}
                    >
                      <span className="text-xs sm:text-sm md:text-base font-bold font-mono leading-none">{day.getDate()}</span>
                      {dayEvents.length > 0 ? (
                        <div className="flex gap-1.5 justify-center mt-auto">
                          {dayEvents.map((ev, eIdx) => (
                            <span
                              key={eIdx}
                              className={cn(
                                "h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0",
                                ev.status === "Paid" || ev.status === "Completed"
                                  ? "bg-emerald-500"
                                  : ev.status === "Pending"
                                  ? "bg-amber-400"
                                  : ev.status === "Overdue"
                                  ? "bg-rose-500"
                                  : ev.status === "Applied"
                                  ? "bg-purple-500"
                                  : "bg-blue-400"
                              )}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="h-2" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bottom: Schedule Details for Selected Date */}
            <div className="border-t border-border/60 pt-3.5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2.5 shrink-0">
                <span className="text-xs uppercase font-bold tracking-widest text-[#f08c2b]">
                  Schedule Details (
                  {selectedDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  )
                </span>
                <Badge variant="outline" className="text-[10px] font-bold font-mono px-2 py-0.5">
                  {activeDayEvents.length} {activeDayEvents.length === 1 ? "Event" : "Events"}
                </Badge>
              </div>

              <div className="space-y-2 overflow-y-auto flex-1 min-h-[100px] max-h-[180px] pr-1">
                {activeDayEvents.map((ev, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-lg border border-border/50 bg-muted/10 flex items-start justify-between gap-3 text-xs leading-relaxed transition-all duration-200",
                      ev.type === "overdue" && "border-rose-500/20 bg-rose-500/5"
                    )}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground text-xs sm:text-sm">{ev.title}</span>
                        <span className="text-[9px] uppercase text-muted-foreground font-mono font-semibold">
                          ID: {ev.appId}
                        </span>
                      </div>
                      {ev.description && (
                        <p className="text-muted-foreground text-[11px] line-clamp-2">{ev.description}</p>
                      )}
                      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground pt-0.5">
                        <span>Product:</span>
                        <span className="text-foreground font-semibold">{ev.product}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground font-mono text-xs sm:text-sm">{formatMoney(ev.amount)}</p>
                      <span
                        className={cn(
                          "inline-block text-[8px] sm:text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider mt-1",
                          ev.status === "Paid" || ev.status === "Completed"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                            : ev.status === "Pending"
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
                            : ev.status === "Overdue"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/25"
                            : ev.status === "Applied"
                            ? "bg-purple-500/10 text-purple-600 border-purple-500/25"
                            : "bg-blue-500/10 text-blue-600 border-blue-500/25"
                        )}
                      >
                        {ev.status}
                      </span>
                    </div>
                  </div>
                ))}

                {activeDayEvents.length === 0 && (
                  <div className="h-full min-h-[90px] flex flex-col items-center justify-center p-3 text-center text-muted-foreground text-xs bg-muted/5 border border-dashed border-border/60 rounded-lg">
                    <p className="font-medium text-xs">No events on this date</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      No repayments, overdue dues, or status changes logged.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar: Repayment Ratio & Policies */}
        <div className="space-y-6 lg:col-span-1">
          {/* Repayment Chart */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Credit Portfolio Mix</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="h-48 w-full text-xs">
                {ratioData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ratioData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        cornerRadius={8}
                        dataKey="value"
                      >
                        {ratioData.map((_, idx) => (
                          <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        contentStyle={{
                          background: "#18181b",
                          borderColor: "#27272a",
                          borderRadius: 8,
                          color: "#fff",
                        }}
                        formatter={(val) => [`UGX ${Number(val).toLocaleString()}`, "Valuation"]}
                      />
                      <Legend verticalAlign="bottom" height={24} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    No active loan distributions
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sacco Policy */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Info className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Sacco Lending Limits</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs text-muted-foreground leading-relaxed">
              <div className="space-y-1">
                <span className="font-bold text-foreground">3x Share Capital Rule</span>
                <p>
                  Cooperative bylaws limit maximum total borrow outstanding to <strong>three times (3x)</strong> your verified Paid-up Share Capital.
                </p>
              </div>
              <div className="space-y-1 border-t border-border/40 pt-3">
                <span className="font-bold text-foreground">Guarantors Policy</span>
                <p>
                  Loans exceeding your personal savings balance require <strong>at least 2 verified Sacco members</strong> to sign as guarantors.
                </p>
              </div>
              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10px] text-muted-foreground leading-relaxed">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Approval takes <strong>24 to 48 working hours</strong> depending on guarantor signing and credit appraisal.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full-width Loans Portfolio DataTable */}
        <div className="col-span-full space-y-4">
          <DataTable<ClientLoan>
            title={`All Loans (${loans.length})`}
            columns={columns}
            rows={paginatedLoans}
            filterFields={filterFields}
            onQueryParamsChange={handleQueryParamsChange}
            loading={isLoading}
            emptyMessage="No loan facilities found matching the selected filter criteria."
            getRowId={(row) => row.id}
            pagination={{
              page,
              rowsPerPage,
              total: loans.length,
              onPageChange,
              onRowsPerPageChange,
              rowsPerPageOptions: [5, 10, 25, 50],
            }}
            exportActions={{
              onExcel: () => void downloadLoansExport("excel"),
              onPdf: () => void downloadLoansExport("pdf"),
              excelDisabled: isLoading || loans.length === 0 || exporting !== null,
              pdfDisabled: isLoading || loans.length === 0 || exporting !== null,
              excelLoading: exporting === "excel",
              pdfLoading: exporting === "pdf",
            }}
          />
        </div>
      </div>

      <LoanCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onApplyLoan={() => {
          setShowCalculator(false)
          router.push("/client-portal/apply-loan")
        }}
        currency={institution?.config?.currency || "UGX"}
        memberLoans={loans
          .filter((l) => !["Rejected", "Closed", "Paid"].includes(String(l.status || "")))
          .map((l) => ({
            id: l.id,
            application_id: l.applicationId,
            status: l.status,
            outstanding_balance: Number(l.outstandingBalance || 0),
            principal_amount: Number(l.principalAmount || 0),
          }))}
        isClientPortal={true}
      />
    </motion.div>
  )
}
