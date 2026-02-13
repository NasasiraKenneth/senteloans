"use client"

import { use, useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, AlertCircle, CheckCircle, Download, CreditCard, Phone, FileText } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function LoanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loan, setLoan] = useState<any>(null)
  const [repaymentSchedule, setRepaymentSchedule] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/client/loans/${id}`, { cache: "no-store" })
        if (!res.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent(`/client-portal/loan-details/${id}`)}`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const l = data.loan
        setLoan(l)
        // Compute schedule with remaining balance derived from principal minus cumulative principal
        const schedule = (l.repayments || []).map((r: any) => ({ ...r }))
        let balance = Number(l.principalAmount || 0)
        const enriched = schedule.map((r: any) => {
          const interest = Number(r.interestAmount || 0)
          const principal = Number(r.principalAmount || 0)
          balance = Math.max(0, balance - principal)
          let status = String(r.status || "Pending")
          if (status === "Overdue") status = "Due"
          if (status === "Partial") status = "Due"
          return {
            installment: r.installment,
            dueDate: r.dueDate,
            principalAmount: principal,
            interestAmount: interest,
            totalAmount: Number(r.totalAmount || principal + interest),
            remainingBalance: balance,
            status,
          }
        })
        setRepaymentSchedule(enriched)
      } finally {
        // no-op
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, router])

  if (!loan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading loan details...</p>
        </div>
      </div>
    )
  }

  const repaymentProgress =
    loan.principalAmount > 0 ? ((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100 : 0
  const paidInstallments = repaymentSchedule.filter((r) => r.status === "Paid").length
  const nextPayment = repaymentSchedule.find((r) => r.status === "Due") ||
    repaymentSchedule.find((r) => r.status === "Pending")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center space-x-3">
          <Link href="/client-portal">
            <Button size="sm" variant="ghost" className="text-primary-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{loan.loanProduct}</h1>
            <p className="text-sm opacity-90">Application ID: {loan.applicationId}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Loan Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Loan Status</CardTitle>
              <Badge
                variant={
                  loan.status === "Disbursed"
                    ? "default"
                    : loan.status === "Applied"
                      ? "outline"
                      : loan.status === "Defaulted"
                        ? "destructive"
                        : "secondary"
                }
              >
                {loan.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Principal Amount</p>
                <p className="text-xl font-bold">UGX {(loan.principalAmount / 1000).toFixed(0)}K</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                <p className="text-xl font-bold text-orange-600">UGX {(loan.outstandingBalance / 1000).toFixed(0)}K</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Repayment Progress</span>
                <span>
                  {Math.round(repaymentProgress)}% ({paidInstallments}/{loan.tenure} payments)
                </span>
              </div>
              <Progress value={repaymentProgress} className="h-3" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Interest Rate</p>
                <p className="font-medium">{loan.interestRate}% per annum</p>
              </div>
              <div>
                <p className="text-muted-foreground">Loan Tenure</p>
                <p className="font-medium">{loan.tenure} months</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Payment Alert */}
        {nextPayment && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Next Payment Due</p>
                    <p className="text-xs text-orange-600">
                      {nextPayment.dueDate} - UGX {(nextPayment.totalAmount / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" disabled>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay Now
                  </Button>
                  <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                    Coming Soon
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Repayment Schedule</h3>
              <div className="relative">
                <Button size="sm" variant="outline" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                  Coming Soon
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              {repaymentSchedule.map((payment) => (
                <Card
                  key={payment.installment}
                  className={`${
                    payment.status === "Paid"
                      ? "bg-green-50 border-green-200"
                      : payment.status === "Due"
                        ? "bg-orange-50 border-orange-200"
                        : "bg-background"
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            payment.status === "Paid"
                              ? "bg-green-600 text-white"
                              : payment.status === "Due"
                                ? "bg-orange-600 text-white"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {payment.status === "Paid" ? <CheckCircle className="h-4 w-4" /> : payment.installment}
                        </div>
                        <div>
                          <p className="text-sm font-medium">Payment #{payment.installment}</p>
                          <p className="text-xs text-muted-foreground">Due: {payment.dueDate}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">UGX {(payment.totalAmount / 1000).toFixed(0)}K</p>
                        <Badge
                          variant={
                            payment.status === "Paid" ? "default" : payment.status === "Due" ? "destructive" : "outline"
                          }
                          className="text-xs"
                        >
                          {payment.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="font-medium">UGX {(payment.principalAmount / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Interest</p>
                        <p className="font-medium">UGX {(payment.interestAmount / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Balance</p>
                        <p className="font-medium">UGX {(payment.remainingBalance / 1000).toFixed(0)}K</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Application Date</p>
                    <p className="font-medium">{loan.applicationDate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Disbursement Date</p>
                    <p className="font-medium">{loan.disbursementDate || "Pending"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Maturity Date</p>
                    <p className="font-medium">{loan.maturityDate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Loan Officer</p>
                    <p className="font-medium">{loan.loanOfficer}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan Purpose</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{loan.purpose || "Business expansion and working capital"}</p>
              </CardContent>
            </Card>

            {loan.guarantors && loan.guarantors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Guarantors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loan.guarantors.map((guarantor, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div>
                        <p className="text-sm font-medium">{guarantor.name}</p>
                        <p className="text-xs text-muted-foreground">{guarantor.relationship}</p>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan Documents</CardTitle>
                <CardDescription>Download your loan agreement and related documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Loan Agreement</p>
                      <p className="text-xs text-muted-foreground">Signed on {loan.applicationDate}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                      Coming Soon
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Repayment Schedule</p>
                      <p className="text-xs text-muted-foreground">Generated on {loan.applicationDate}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                      Coming Soon
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Payment History</p>
                      <p className="text-xs text-muted-foreground">Updated daily</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                      Coming Soon
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
