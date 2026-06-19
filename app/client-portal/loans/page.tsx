"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { CreditCard, Plus } from "lucide-react"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"

export default function ClientLoansPage() {
  const [clientLoans, setClientLoans] = useState<any[]>([])
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
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Loans</h1>
          <p className="text-gray-600">Manage your loan applications and repayments</p>
        </div>
        <Link href="/client-portal/apply-loan">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Apply for Loan
          </Button>
        </Link>
      </div>

      {clientLoans.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No loans yet</h3>
            <p className="text-muted-foreground mb-4">Apply for your first loan to get started</p>
            <Link href="/client-portal/apply-loan">
              <Button>Apply for Loan</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {clientLoans.map((loan) => (
            <Card key={loan.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{loan.loanProduct}</CardTitle>
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
                <CardDescription>Application ID: {loan.applicationId}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Principal Amount</p>
                    <p className="font-medium">UGX {(loan.principalAmount / 1000).toFixed(0)}K</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className="font-medium">UGX {(loan.outstandingBalance / 1000).toFixed(0)}K</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{loan.interestRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tenure</p>
                    <p className="font-medium">{loan.tenure} months</p>
                  </div>
                </div>

                {loan.status === "Disbursed" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Repayment Progress</span>
                      <span>
                        {Math.round(((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100}
                      className="h-2"
                    />
                  </div>
                )}

                <div className="flex space-x-2">
                  <Link href={`/client-portal/loan-details/${loan.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full bg-transparent">
                      View Details
                    </Button>
                  </Link>
                  {loan.status === "Disbursed" && loan.nextPaymentDate && (
                    <div className="flex-1 relative">
                      <Button size="sm" className="w-full" disabled>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pay Now
                      </Button>
                      <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                        Coming Soon
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
