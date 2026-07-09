"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  Users,
  CreditCard,
  PiggyBank,
  AlertTriangle,
  FileText,
  ScrollText,
  UserCog,
  Receipt,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useStaffSession } from "@/components/staff-session-provider"
import { useToast } from "@/components/ui/toast"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import { readClientTerminology, readInstitutionConfigModuleEnabled } from "@/lib/institution-branch-config"

type DashboardStats = {
  peopleLabel: "members" | "borrowers"
  currency: string
  totalMembers: number
  activeMembers: number
  memberRetentionRate: number
  monthlyCollectionEfficiency: number
  totalSavingsPortfolio: number
  activeLoansCount: number
  overdueLoansCount: number
  averageLoanSize: number
  nplRatio: number
}

function formatCompactMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${currency} ${(amount / 1_000).toFixed(0)}K`
  return fmtCurrency(amount, currency)
}

const reportLinks = [
  { href: "/reports/loans", label: "Loan Reports", icon: CreditCard },
  { href: "/reports/savings", label: "Savings Reports", icon: PiggyBank },
  { href: "/reports/shares", label: "Share Reports", icon: TrendingUp },
  { href: "/reports/statements", label: "Statements", icon: FileText },
  { href: "/reports/sacco-loans", label: "Sacco Loan Reports", icon: ScrollText },
  { href: "/reports/invoices", label: "Invoice Reports", icon: Receipt },
  { href: "/reports/staff-audit", label: "Staff Audit Reports", icon: UserCog },
] as const

export default function ReportsPage() {
  const { session } = useStaffSession()
  const { toast } = useToast()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const config = session?.institution?.config
  const savingsEnabled = readInstitutionConfigModuleEnabled(config, "savings")
  const sharesEnabled = readInstitutionConfigModuleEnabled(config, "shares")
  const clientTerm = readClientTerminology(config)
  const peopleLabel = stats?.peopleLabel === "borrowers" ? "Borrower" : clientTerm === "Member" ? "Member" : clientTerm
  const currency = stats?.currency || "UGX"

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/dashboard-stats", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Failed to load report summary")
      setStats(body.stats)
    } catch (e: unknown) {
      const err = e as Error
      setStats(null)
      toast({
        title: "Summary unavailable",
        description: err?.message || "Could not load report metrics.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const visibleReportLinks = reportLinks.filter((link) => {
    if (link.href === "/reports/savings" && !savingsEnabled) return false
    if (link.href === "/reports/shares" && !sharesEnabled) return false
    return true
  })

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground">
          Comprehensive financial insights and detailed reporting for better decision making
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{peopleLabel} Retention</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : `${stats?.memberRetentionRate ?? 0}%`}
            </div>
            <p className="text-xs text-muted-foreground">Active {peopleLabel.toLowerCase()} rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Loan Recovery</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : `${stats?.monthlyCollectionEfficiency ?? 0}%`}
            </div>
            <p className="text-xs text-muted-foreground">Collection efficiency this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "—" : stats?.activeLoansCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">Currently disbursed or active</p>
          </CardContent>
        </Card>

        {savingsEnabled && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Savings Portfolio</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : formatCompactMoney(stats?.totalSavingsPortfolio ?? 0, currency)}
              </div>
              <p className="text-xs text-muted-foreground">Total savings balance</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
            <CardDescription>Key metrics and alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Active Loans</span>
              <Badge variant="secondary">{loading ? "—" : `${stats?.activeLoansCount ?? 0} loans`}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overdue Loans</span>
              <Badge variant={(stats?.overdueLoansCount ?? 0) > 0 ? "destructive" : "secondary"}>
                {(stats?.overdueLoansCount ?? 0) > 0 && <AlertTriangle className="mr-1 h-3 w-3" />}
                {loading ? "—" : `${stats?.overdueLoansCount ?? 0} loans`}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Average Loan Size</span>
              <span className="text-sm font-medium">
                {loading ? "—" : formatCompactMoney(stats?.averageLoanSize ?? 0, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">NPL Ratio</span>
              <Badge variant={(stats?.nplRatio ?? 0) > 10 ? "destructive" : "secondary"}>
                {loading ? "—" : `${stats?.nplRatio ?? 0}%`}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio Snapshot</CardTitle>
            <CardDescription>People and risk overview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total {peopleLabel}s</span>
              <Badge variant="secondary">{loading ? "—" : stats?.totalMembers ?? 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active {peopleLabel}s</span>
              <Badge variant="secondary">{loading ? "—" : stats?.activeMembers ?? 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Retention Rate</span>
              <span className="text-sm font-medium">{loading ? "—" : `${stats?.memberRetentionRate ?? 0}%`}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Quick Access to Reports
          </CardTitle>
          <CardDescription>Open a detailed report section</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {visibleReportLinks.map((link) => {
              const Icon = link.icon
              return (
                <Button key={link.href} variant="outline" className="h-20 flex-col bg-transparent" asChild>
                  <Link href={link.href}>
                    <Icon className="mb-2 h-6 w-6" />
                    <span className="text-sm">{link.label}</span>
                  </Link>
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
