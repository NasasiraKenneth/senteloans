"use client"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { useStaffSession } from "@/components/staff-session-provider"
import { ArrowLeft, CreditCard, DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react"
import Link from "next/link"
import { readClientTerminology } from "@/lib/institution-branch-config"

export default function UserLoansPage() {
  const params = useParams()
  const userId = params.id as string
  const { session } = useStaffSession()
  const [user, setUser] = useState<{ id: string; fullName: string; clientNumber: string } | null>(null)
  const [loans, setLoans] = useState<
    Array<{
      id: string
      applicationId: string
      loanProduct: string
      principalAmount: number
      outstandingBalance: number
      interestRate: number
      applicationDate: string
      status: string
    }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/institution/members/${userId}`).then((r) => r.json()),
      fetch(`/api/institution/loans?member_id=${userId}&pageSize=100`).then((r) => r.json()),
    ])
      .then(([memberRes, loansRes]) => {
        const c = memberRes.member
        if (c) {
          setUser({ id: c.id, fullName: c.full_name, clientNumber: c.member_number })
        }
        const items = loansRes.items ?? []
        setLoans(
          items.map((l: Record<string, unknown>) => ({
            id: l.id as string,
            applicationId: (l.application_id as string) ?? "",
            loanProduct: (l.productName as string) ?? "Loan",
            principalAmount: Number(l.principal_amount ?? 0),
            outstandingBalance: Number(l.outstanding_balance ?? 0),
            interestRate: Number(l.interest_rate ?? 0),
            applicationDate: String(l.application_date ?? ""),
            status: String(l.status ?? ""),
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <>
        <div className="flex min-h-[70vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading ...</p>
          </div>
        </div>
      </>
    )
  }

  if (!user) {
    const clientTerm = readClientTerminology(session?.institution?.config, "User")
    return (
      <>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{clientTerm} Not Found</h1>
          <p className="text-muted-foreground">The requested {clientTerm.toLowerCase()} could not be found.</p>
          <Link href="/users">
            <Button className="mt-4">Back to {clientTerm}s</Button>
          </Link>
        </div>
      </>
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "Pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "Overdue":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <CheckCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Active":
        return "default"
      case "Pending":
        return "outline"
      case "Overdue":
        return "destructive"
      default:
        return "secondary"
    }
  }

  const clientTerm = readClientTerminology(session?.institution?.config, "User")
  const totalLoanAmount = loans.reduce((sum, loan) => sum + loan.principalAmount, 0)
  const totalOutstanding = loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0)
  const activeLoanCount = loans.filter((loan) => loan.status === "Disbursed").length

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href={`/members/${userId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <CreditCard className="h-5 w-5" />
                  <h1 className="text-3xl font-bold">Loans Overview</h1>
                </div>
                <p className="text-muted-foreground text-pretty">
                  {clientTerm}: {user.fullName} • {clientTerm} ID: {user.clientNumber}
                </p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <CreditCard className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Total Loans</span>
                </div>
                <span className="text-sm font-medium">{loans.length}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  <span className="text-sm">Active Loans</span>
                </div>
                <span className="text-sm font-medium">{activeLoanCount}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Total Borrowed</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(totalLoanAmount)}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2 text-red-500" />
                  <span className="text-sm">Outstanding</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(totalOutstanding)}</span>
              </div>
            </div>

            {/* Loans List */}
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-xl font-semibold">Loan History</h2>
                <p className="text-sm text-muted-foreground">Complete loan history for {user.fullName}</p>
              </div>

              {loans.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Loans Found</h3>
                  <p className="text-muted-foreground">This {clientTerm.toLowerCase()} has no loan history.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {loans.map((loan) => (
                    <div key={loan.id} className="border border-border rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(loan.status)}
                          <div>
                            <h3 className="font-semibold">{loan.loanProduct}</h3>
                            <p className="text-sm text-muted-foreground">Application ID: {loan.applicationId}</p>
                          </div>
                        </div>
                        <Badge variant={getStatusVariant(loan.status)}>{loan.status}</Badge>
                      </div>

                      <div className="grid md:grid-cols-4 gap-4">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Loan Amount
                          </span>
                          <p className="text-sm font-medium">{formatCurrency(loan.principalAmount)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Outstanding Balance
                          </span>
                          <p className="text-sm font-medium">{formatCurrency(loan.outstandingBalance)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Interest Rate
                          </span>
                          <p className="text-sm font-medium">{loan.interestRate}%</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Application Date
                          </span>
                          <p className="text-sm font-medium">{formatDate(loan.applicationDate)}</p>
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Link href={`/loans/${loan.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
    </>
  )
}
