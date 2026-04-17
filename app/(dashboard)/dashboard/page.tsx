"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/session"
import { Users, CreditCard, PiggyBank, TrendingUp, AlertTriangle, CheckCircle, Plus, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"


interface DashboardData {
  stats: {
    totalClients: number
    totalMembers: number
    activeClients: number
    activeMembers: number
    totalLoanPortfolio: number
    outstandingLoans: number
    totalSavingsPortfolio?: number
    totalTransactionsThisMonth: number
    newClientsThisMonth: number
    newMembersThisMonth: number
    loansApprovedThisMonth: number
    nplRatio: number
    monthlyCollectionEfficiency: number
  }
  recentLoans: Array<{
    id: string
    applicationId: string
    principalAmount: number
    status: string
    clientName: string
    loanProduct: string
  }>
  recentMembers: Array<{
    id: string
    clientNumber: string
    fullName: string
    district: string
    occupation: string
    kycStatus: string
    status: string
  }>
}

export default function DashboardPage() {
  const [clientTerminology, setClientTerminology] = useState("Members")
  const [institutionName, setInstitutionName] = useState("SACCO")
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (session?.institution) {
      setClientTerminology(session.institution.config?.clientTerminology === "Member" ? "Members" : (session.institution.config?.clientTerminology || "Members"))
      setInstitutionName(session.institution.name || "SACCO")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/institution/dashboard-stats", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && d) setData(d)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const stats = data?.stats ?? {
    totalClients: 0,
    totalMembers: 0,
    activeClients: 0,
    activeMembers: 0,
    totalLoanPortfolio: 0,
    outstandingLoans: 0,
    totalTransactionsThisMonth: 0,
    newClientsThisMonth: 0,
    newMembersThisMonth: 0,
    loansApprovedThisMonth: 0,
    nplRatio: 0,
    monthlyCollectionEfficiency: 0,
  }
  const recentLoans = data?.recentLoans?.slice(0, 3) ?? []
  const recentMembers = data?.recentMembers?.slice(0, 3) ?? []

  if (loading) {
    return (
      <>
        <div className="flex min-h-[70vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
          <div className="space-y-6">
            <div className="flex items-center">
              <div>
                <h2 className="text-3xl font-bold text-balance">Welcome to {institutionName}</h2>
                <p className="text-muted-foreground text-pretty">
                  Manage your financial institution operations efficiently with real-time insights and streamlined
                  processes.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total {clientTerminology}</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalClients || stats.totalMembers}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats.newClientsThisMonth || stats.newMembersThisMonth} new this month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Loan Portfolio</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">UGX {(stats.totalLoanPortfolio / 1000000).toFixed(1)}M</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.loansApprovedThisMonth} loans approved this month
                  </p>
                </CardContent>
              </Card>

              {(stats.totalSavingsPortfolio ?? 0) > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Savings Portfolio</CardTitle>
                    <PiggyBank className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">UGX {((stats.totalSavingsPortfolio ?? 0) / 1000000).toFixed(1)}M</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.totalTransactionsThisMonth} transactions this month
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Collection Efficiency</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.monthlyCollectionEfficiency}%</div>
                  <Progress value={stats.monthlyCollectionEfficiency} className="mt-2" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Health</CardTitle>
                  <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active {clientTerminology}</span>
                    <Badge variant="secondary">
                      {stats.activeClients || stats.activeMembers}/{stats.totalClients || stats.totalMembers}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">NPL Ratio</span>
                    <Badge variant={stats.nplRatio > 10 ? "destructive" : "secondary"}>{stats.nplRatio}%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Outstanding Loans</span>
                    <span className="text-sm font-medium">UGX {(stats.outstandingLoans / 1000000).toFixed(1)}M</span>
                  </div>
                  <div className="pt-2 border-t">
                    <Link href="/reports">
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        View Detailed Reports
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Loan Applications</CardTitle>
                  <CardDescription>Latest loan requests</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentLoans.map((loan) => (
                      <div key={loan.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{loan.clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            UGX {(loan.principalAmount / 1000).toFixed(0)}K - {loan.loanProduct}
                          </p>
                        </div>
                        <Badge
                          variant={
                            loan.status === "Approved"
                              ? "default"
                              : loan.status === "Disbursed"
                                ? "secondary"
                                : loan.status === "Defaulted"
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {loan.status === "Disbursed" && <CheckCircle className="w-3 h-3 mr-1" />}
                          {loan.status === "Defaulted" && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {loan.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t mt-4">
                    <Link href="/loans">
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        View All Loans
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent {clientTerminology}</CardTitle>
                <CardDescription>Newly registered {clientTerminology.toLowerCase()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{member.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.clientNumber} • {member.district} • {member.occupation}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={member.kycStatus === "Verified" ? "default" : "outline"}>
                          {member.kycStatus}
                        </Badge>
                        <Badge variant="secondary">{member.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t mt-4">
                  <Link href="/users">
                    <Button variant="outline" size="sm" className="w-full bg-transparent">
                      View All {clientTerminology}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
       </>
  )
}
