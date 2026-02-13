"use client"

import type React from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SavingsAccount } from "@/lib/mock-data"
import { mockTransactions } from "@/lib/mock-data"
import { PiggyBank, User, Calendar, ArrowUpDown, TrendingUp, Edit } from "lucide-react"

interface AccountDetailsDialogProps {
  account: SavingsAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountDetailsDialog({ account, open, onOpenChange }: AccountDetailsDialogProps) {
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

  // Get transactions for this account
  const accountTransactions = mockTransactions.filter((t) => t.accountId === account.id)

  // Generate mock transaction history
  const generateTransactionHistory = () => {
    const history = [
      {
        id: "t1",
        date: "2023-12-20",
        type: "Deposit",
        amount: 100000,
        mode: "Mobile Money",
        description: "Monthly savings deposit",
        balance: 850000,
      },
      {
        id: "t2",
        date: "2023-12-15",
        type: "Withdrawal",
        amount: 50000,
        mode: "Cash",
        description: "Emergency withdrawal",
        balance: 750000,
      },
      {
        id: "t3",
        date: "2023-12-10",
        type: "Deposit",
        amount: 200000,
        mode: "Bank Transfer",
        description: "Salary deposit",
        balance: 800000,
      },
      {
        id: "t4",
        date: "2023-12-05",
        type: "Deposit",
        amount: 75000,
        mode: "Cash",
        description: "Weekly savings",
        balance: 600000,
      },
      {
        id: "t5",
        date: "2023-12-01",
        type: "Deposit",
        amount: 150000,
        mode: "Mobile Money",
        description: "Business proceeds",
        balance: 525000,
      },
    ]
    return history
  }

  const transactionHistory = generateTransactionHistory()

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "Voluntary":
        return "default"
      case "Fixed":
        return "secondary"
      case "Shares":
        return "outline"
      default:
        return "outline"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <PiggyBank className="h-5 w-5 mr-2" />
              Account Details - {account.accountNumber}
            </div>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit Account
            </Button>
          </DialogTitle>
          <DialogDescription>
            Complete account information and transaction history for {account.memberName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Account Overview */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(account.availableBalance)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(account.totalBalance)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Account Age</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.floor((Date.now() - new Date(account.openDate).getTime()) / (1000 * 60 * 60 * 24 * 30))} months
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Account Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PiggyBank className="h-4 w-4 mr-2" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Account Number</Label>
                  <p className="text-sm font-medium">{account.accountNumber}</p>
                </div>
                <div>
                  <Label>Account Type</Label>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getAccountTypeColor(account.accountType)}>{account.accountType}</Badge>
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center space-x-2">
                    <Badge variant={account.status === "Active" ? "default" : "secondary"}>{account.status}</Badge>
                  </div>
                </div>
                <div>
                  <Label>Opening Date</Label>
                  <p className="text-sm font-medium">{formatDate(account.openDate)}</p>
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
                  <p className="text-sm font-medium">{account.memberName}</p>
                </div>
                <div>
                  <Label>Member ID</Label>
                  <p className="text-sm font-medium">{account.memberId}</p>
                </div>
                <div>
                  <Label>Account Summary</Label>
                  <div className="text-sm space-y-1">
                    <p>Available: {formatCurrency(account.availableBalance)}</p>
                    <p>Reserved: {formatCurrency(account.totalBalance - account.availableBalance)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Transaction History
              </CardTitle>
              <CardDescription>Recent account activities and transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionHistory.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(transaction.date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          {transaction.type === "Deposit" ? (
                            <TrendingUp className="h-4 w-4 text-green-600 mr-2" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 text-red-600 mr-2" />
                          )}
                          <Badge variant={transaction.type === "Deposit" ? "default" : "outline"}>
                            {transaction.type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-medium ${
                            transaction.type === "Deposit" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {transaction.type === "Deposit" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </span>
                      </TableCell>
                      <TableCell>{transaction.mode}</TableCell>
                      <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(transaction.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              New Transaction
            </Button>
            <Button variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Generate Statement
            </Button>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
