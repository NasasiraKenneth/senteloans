"use client"

import { useState, useEffect, useMemo } from "react"
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
} from "lucide-react"

import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { cn } from "@/lib/utils"

// Recharts components for breakdown
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ChartTooltip, Legend } from "recharts"

type ClientLoan = {
  id: string
  loanProduct: string
  applicationId: string
  principalAmount: number
  outstandingBalance: number
  interestRate: number
  tenure: number
  status: string
  nextPaymentDate?: string
}

type CalendarEvent = {
  dateStr: string // YYYY-MM-DD
  type: "status_change" | "repayment" | "overdue"
  appId: string
  product: string
  title: string
  amount: number
  status: "Paid" | "Pending" | "Overdue" | "Disbursed"
  description?: string
}

export default function ClientLoansPage() {
  const { refresh, formatMoney } = useClientSession()
  const [clientLoans, setClientLoans] = useState<ClientLoan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/client/loans", { cache: "no-store" })
        if (!res.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent("/client-portal/loans")}`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setClientLoans(data.loans || [])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  // Calendar configurations (defaults to July 2026 to show indicators)
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 6, 23))
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(2026, 6, 23))

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return [
      {
        dateStr: "2026-07-05",
        type: "repayment",
        appId: "LN-2026-8802",
        product: "Emergency Loan",
        title: "Repayment Cleared",
        amount: 350000,
        status: "Paid",
        description: "Scheduled installment #2 paid successfully via MTN Mobile Money."
      },
      {
        dateStr: "2026-07-15",
        type: "overdue",
        appId: "LN-2026-9041",
        product: "Short-term Business Cap",
        title: "Overdue Repayment Due",
        amount: 180000,
        status: "Overdue",
        description: "Missed repayment deadline. Sacco overdue interest penalties apply."
      },
      {
        dateStr: "2026-07-20",
        type: "status_change",
        appId: "LN-2026-8802",
        product: "Emergency Loan",
        title: "Loan Status Changed to Disbursed",
        amount: 1500000,
        status: "Disbursed",
        description: "Guarantor reviews completed. Loan disbursed to member wallet."
      },
      {
        dateStr: "2026-07-28",
        type: "repayment",
        appId: "LN-2026-9504",
        product: "Development Capital Loan",
        title: "Upcoming Installment Due",
        amount: 420000,
        status: "Pending",
        description: "Next repayment billing cycle. Ensure mobile money/bank balances cover dues."
      }
    ]
  }, [])

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  // Days in month calculation
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()
    
    const days: (Date | null)[] = []
    
    // Add empty slots for offset
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null)
    }
    
    // Add day objects
    for (let d = 1; d <= lastDate; d++) {
      days.push(new Date(year, month, d))
    }
    
    return days
  }, [currentDate])

  const formatDateString = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  const selectedDateStr = useMemo(() => formatDateString(selectedDate), [selectedDate])
  
  const activeDayEvents = useMemo(() => {
    return calendarEvents.filter(ev => ev.dateStr === selectedDateStr)
  }, [calendarEvents, selectedDateStr])

  // Calculations
  const activeOutstanding = useMemo(() => {
    return clientLoans
      .filter((l) => l.status === "Disbursed" || l.status === "Defaulted")
      .reduce((sum, l) => sum + Number(l.outstandingBalance || 0), 0)
  }, [clientLoans])

  const totalPrincipal = useMemo(() => {
    return clientLoans
      .filter((l) => l.status === "Disbursed" || l.status === "Defaulted")
      .reduce((sum, l) => sum + Number(l.principalAmount || 0), 0)
  }, [clientLoans])

  const activeCount = useMemo(() => {
    return clientLoans.filter((l) => l.status === "Disbursed" || l.status === "Defaulted").length
  }, [clientLoans])

  const amountRepaid = useMemo(() => {
    const repaid = totalPrincipal - activeOutstanding
    return repaid > 0 ? repaid : 0
  }, [totalPrincipal, activeOutstanding])

  // Recharts Pie Chart Data configuration
  const ratioData = useMemo(() => {
    return [
      { name: "Principal Settled", value: amountRepaid || 1 },
      { name: "Dues Outstanding", value: activeOutstanding || 0 },
    ]
  }, [amountRepaid, activeOutstanding])

  const PIE_COLORS = ["#10b981", "#f08c2b"]

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Credit & Loans"
        description="Track active loan balances, repayment timeline schedules, and borrow applications."
        backHref="/client-portal"
        action={
          <Link href="/client-portal/apply-loan">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Apply for Loan
            </Button>
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ClientPortalSummaryCard
          variant="loans"
          label="Active Dues Outstanding"
          value={formatMoney(activeOutstanding)}
          sub={`${activeCount} active ${activeCount === 1 ? "loan" : "loans"} outstanding`}
          icon={TrendingUp}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="savings"
          label="Principal Settled"
          value={formatMoney(amountRepaid)}
          sub="Accumulated repayments"
          icon={Coins}
          index={1}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Sacco Share Limit"
          value={formatMoney(2000000 * 3)}
          sub="3x maximum share capital limit"
          icon={BadgePercent}
          index={2}
        />
      </div>

      {clientLoans.length === 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground opacity-70" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">No active loans found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You do not have any active or pending loan records. Apply for your first Sacco credit disbursement today.
              </p>
            </div>
            <Link href="/client-portal/apply-loan" className="inline-block">
              <Button size="sm">Apply for Loan</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
          {/* Column 1 & 2: Active & Historical Loan List + Repayment Calendar */}
          <div className="space-y-6 lg:col-span-2">
            {/* Repayment and Status Calendar */}
            <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 pb-3.5 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4.5 w-4.5 text-[#f08c2b]" />
                  <CardTitle className="text-sm font-semibold">Repayment & Status Tracker</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground w-28 text-center">
                    {currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  <span>Sun</span>
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="aspect-square bg-transparent" />
                    const dayStr = formatDateString(day)
                    const isSelected = selectedDateStr === dayStr
                    const dayEvents = calendarEvents.filter(ev => ev.dateStr === dayStr)
                    const isToday = formatDateString(new Date()) === dayStr

                    return (
                      <button
                        key={dayStr}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "aspect-square flex flex-col items-center justify-between p-1.5 rounded-lg border border-border/40 relative transition-all duration-200",
                          isSelected
                            ? "border-[#f08c2b] bg-[#f08c2b]/5 text-[#f08c2b]"
                            : "hover:bg-muted/30 hover:border-border text-foreground",
                          isToday && !isSelected && "border-[#f08c2b]/40 font-bold bg-[#f08c2b]/2"
                        )}
                      >
                        <span className="text-[11px] font-bold font-mono">{day.getDate()}</span>
                        {dayEvents.length > 0 && (
                          <div className="flex gap-0.5 justify-center mt-auto">
                            {dayEvents.map((ev, eIdx) => (
                              <span
                                key={eIdx}
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  ev.type === "repayment" && ev.status === "Paid"
                                    ? "bg-emerald-500"
                                    : ev.type === "repayment" && ev.status === "Pending"
                                    ? "bg-amber-400"
                                    : ev.type === "overdue"
                                    ? "bg-rose-500"
                                    : "bg-blue-400"
                                )}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Day Details View */}
                <div className="mt-4 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#f08c2b]">
                      Schedule Details ({selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {activeDayEvents.length} {activeDayEvents.length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeDayEvents.map((ev, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-3 rounded-lg border border-border/50 bg-muted/10 flex items-start justify-between gap-3 text-xs leading-relaxed transition-all duration-200",
                          ev.type === "overdue" && "border-rose-500/20 bg-rose-500/2"
                        )}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground">{ev.title}</span>
                            <span className="text-[9px] uppercase text-muted-foreground font-mono font-bold">
                              ID: {ev.appId}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[11px]">{ev.description}</p>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <span>Product:</span>
                            <span className="text-foreground font-bold">{ev.product}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-foreground font-mono">{formatMoney(ev.amount)}</p>
                          <span
                            className={cn(
                              "inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider mt-1",
                              ev.status === "Paid"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                                : ev.status === "Pending"
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
                                : ev.status === "Overdue"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/25"
                                : "bg-blue-500/10 text-blue-600 border-blue-500/25"
                            )}
                          >
                            {ev.status}
                          </span>
                        </div>
                      </div>
                    ))}

                    {activeDayEvents.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-xs bg-muted/5 border border-dashed border-border/60 rounded-lg">
                        No repayments, overdue installments, or status change events logged for this date.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">Loan Products</h2>
              <div className="grid gap-4">
                {clientLoans.map((loan) => {
                  const progressVal =
                    loan.principalAmount > 0
                      ? ((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100
                      : 0
                  const isDisbursed = loan.status === "Disbursed"
                  return (
                    <Card key={loan.id} className="overflow-hidden border-border/80 border-t-2 border-t-[#f08c2b] shadow-sm">
                      <CardHeader className="pb-3 flex flex-row items-start justify-between border-b border-border/40 bg-muted/10">
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">{loan.loanProduct}</CardTitle>
                          <CardDescription className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                            ID: {loan.applicationId}
                          </CardDescription>
                        </div>
                        <Badge
                          className={cn(
                            "text-[9px] font-bold px-2.5 py-0.5 rounded border uppercase tracking-widest shrink-0",
                            loan.status === "Disbursed"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                              : loan.status === "Applied"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
                              : loan.status === "Defaulted"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/25"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                          variant="outline"
                        >
                          {loan.status}
                        </Badge>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                          <div>
                            <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Principal</p>
                            <p className="font-bold text-foreground mt-0.5">{formatMoney(loan.principalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Outstanding</p>
                            <p className="font-bold text-[#f08c2b] mt-0.5">{formatMoney(loan.outstandingBalance)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Rate (Month)</p>
                            <p className="font-bold text-foreground mt-0.5">{loan.interestRate}%</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Tenure</p>
                            <p className="font-bold text-foreground mt-0.5">{loan.tenure} Months</p>
                          </div>
                        </div>

                        {isDisbursed && (
                          <div className="space-y-2 pt-2 border-t border-border/40">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              <span>Settled Progress</span>
                              <span className="font-bold text-foreground">{Math.round(progressVal)}%</span>
                            </div>
                            <Progress value={progressVal} className="h-1.5 bg-muted" indicatorClassName="bg-[#f08c2b]" />
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Link href={`/client-portal/loan-details/${loan.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full text-xs font-semibold uppercase tracking-wider">
                              View Schedule
                            </Button>
                          </Link>
                          {isDisbursed && loan.nextPaymentDate && (
                            <div className="flex-1 relative">
                              <Button size="sm" className="w-full text-xs font-semibold uppercase tracking-wider" disabled>
                                <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                                Pay Now
                              </Button>
                              <Badge className="absolute -top-2 -right-2 text-[9px] font-bold px-1 bg-[#f08c2b]" variant="secondary">
                                SOON
                              </Badge>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Column 3: Sidebar Details */}
          <div className="space-y-6 lg:col-span-1">
            {/* Repayment Chart */}
            <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
                <Activity className="h-4.5 w-4.5 text-[#f08c2b]" />
                <CardTitle className="text-sm font-semibold">Repayment Ratio</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <div className="h-48 w-full text-xs">
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
                        {ratioData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        contentStyle={{ background: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                        formatter={(val) => [`UGX ${Number(val).toLocaleString()}`, "Valuation"]}
                      />
                      <Legend verticalAlign="bottom" height={24} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
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
                    Cooperative bylaws limit maximum total borrow outstanding to **three times (3x)** your verified Paid-up Share Capital.
                  </p>
                </div>
                <div className="space-y-1 border-t border-border/40 pt-3">
                  <span className="font-bold text-foreground">Guarantors Policy</span>
                  <p>
                    Loans exceeding your personal savings balance require **at least 2 verified Sacco members** to sign as guarantors.
                  </p>
                </div>
                <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10px] text-muted-foreground leading-relaxed">
                  <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                  <span>
                    Approval takes **24 to 48 working hours** depending on guarantor signing and credit appraisal.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </motion.div>
  )
}
