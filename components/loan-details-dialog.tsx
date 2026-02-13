"use client"

import type React from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Loan } from "@/lib/mock-data"
import { CreditCard, User, Calendar, DollarSign, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

interface LoanDetailsDialogProps {
  loan: Loan
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoanDetailsDialog({ loan, open, onOpenChange }: LoanDetailsDialogProps) {
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
      case "Approved":
      case "Disbursed":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "Rejected":
        return <XCircle className="h-5 w-5 text-red-600" />
      case "Defaulted":
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Approved":
      case "Disbursed":
        return "default"
      case "Rejected":
      case "Defaulted":
        return "destructive"
      case "Closed":
        return "secondary"
      default:
        return "outline"
    }
  }

  // Calculate repayment progress
  const repaymentProgress = ((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100

  // Generate mock repayment schedule
  const generateRepaymentSchedule = () => {
    const schedule = []
    const monthlyPayment = loan.principalAmount / loan.tenure
    const monthlyInterest = (loan.principalAmount * loan.interestRate) / 100 / 12
    const totalMonthlyPayment = monthlyPayment + monthlyInterest

    for (let i = 1; i <= loan.tenure; i++) {
      const dueDate = new Date(loan.disbursementDate || loan.applicationDate)
      dueDate.setMonth(dueDate.getMonth() + i)

      schedule.push({
        installment: i,
        dueDate: dueDate.toISOString().split("T")[0],
        principal: monthlyPayment,
        interest: monthlyInterest,
        totalPayment: totalMonthlyPayment,
        status: i <= 3 ? "Paid" : i === 4 ? "Due" : "Pending",
      })
    }
    return schedule
  }

  const repaymentSchedule = generateRepaymentSchedule()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Loan Details - {loan.applicationId}
            </div>
            <div className="flex items-center space-x-2">
              {getStatusIcon(loan.status)}
              <Badge variant={getStatusVariant(loan.status)}>{loan.status}</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>Complete loan information and repayment schedule for {loan.memberName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Loan Overview */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Principal Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(loan.principalAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(loan.outstandingBalance)}</div>
                <Progress value={repaymentProgress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{repaymentProgress.toFixed(1)}% repaid</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency((loan.principalAmount * (1 + loan.interestRate / 100)) / loan.tenure)}
                </div>
                {loan.overdueDays > 0 && <p className="text-xs text-red-600 mt-1">{loan.overdueDays} days overdue</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Loan Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Loan Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Application ID</Label>
                    <p className="text-sm font-medium">{loan.applicationId}</p>
                  </div>
                  <div>
                    <Label>Loan Product</Label>
                    <p className="text-sm font-medium">{loan.loanProduct}</p>
                  </div>
                  <div>
                    <Label>Interest Rate</Label>
                    <p className="text-sm font-medium">{loan.interestRate}% per annum</p>
                  </div>
                  <div>
                    <Label>Tenure</Label>
                    <p className="text-sm font-medium">{loan.tenure} months</p>
                  </div>
                  <div>
                    <Label>Application Date</Label>
                    <p className="text-sm font-medium">{formatDate(loan.applicationDate)}</p>
                  </div>
                  {loan.disbursementDate && (
                    <div>
                      <Label>Disbursement Date</Label>
                      <p className="text-sm font-medium">{formatDate(loan.disbursementDate)}</p>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Purpose</Label>
                  <p className="text-sm font-medium">{loan.purpose}</p>
                </div>
              </CardContent>
            </Card>

            {/* Member Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Member Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Member Name</Label>
                  <p className="text-sm font-medium">{loan.memberName}</p>
                </div>
                <div>
                  <Label>Member ID</Label>
                  <p className="text-sm font-medium">{loan.memberId}</p>
                </div>
                {loan.nextPaymentDate && (
                  <div>
                    <Label>Next Payment Due</Label>
                    <p className="text-sm font-medium">{formatDate(loan.nextPaymentDate)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Repayment Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Repayment Schedule
              </CardTitle>
              <CardDescription>Monthly installment breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Installment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Total Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repaymentSchedule.slice(0, 6).map((payment) => (
                    <TableRow key={payment.installment}>
                      <TableCell className="font-medium">#{payment.installment}</TableCell>
                      <TableCell>{formatDate(payment.dueDate)}</TableCell>
                      <TableCell>{formatCurrency(payment.principal)}</TableCell>
                      <TableCell>{formatCurrency(payment.interest)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(payment.totalPayment)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            payment.status === "Paid" ? "default" : payment.status === "Due" ? "destructive" : "outline"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {repaymentSchedule.length > 6 && (
                <div className="text-center mt-4">
                  <Button variant="outline" size="sm">
                    View Full Schedule ({repaymentSchedule.length} installments)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            {loan.status === "Applied" && (
              <>
                <Button variant="outline">
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Application
                </Button>
                <Button>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Loan
                </Button>
              </>
            )}
            {loan.status === "Approved" && (
              <Button>
                <DollarSign className="h-4 w-4 mr-2" />
                Disburse Loan
              </Button>
            )}
            {loan.status === "Disbursed" && (
              <Button variant="outline">
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
