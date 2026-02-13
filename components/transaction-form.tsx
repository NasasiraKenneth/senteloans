"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { mockSavingsAccounts, mockMembers, mockLoans } from "@/lib/mock-data"
import { ArrowUpDown, DollarSign, CreditCard, Smartphone, Calendar, User } from "lucide-react"

interface TransactionFormProps {
  onClose: () => void
}

export function TransactionForm({ onClose }: TransactionFormProps) {
  const [formData, setFormData] = useState({
    accountType: "",
    accountId: "",
    transactionType: "",
    amount: "",
    transactionDate: new Date().toISOString().split("T")[0], // Prefilled with today's date
    depositorName: "",
    mode: "",
    description: "",
    reference: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the data to your backend
    console.log("New transaction:", formData)
    onClose()
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (field === "accountId") {
      const selectedAccount = getAccountsByType().find((account) => account.id === value)
      if (selectedAccount) {
        setFormData((prev) => ({ ...prev, depositorName: selectedAccount.memberName }))
      }
    }
  }

  const getAccountsByType = () => {
    switch (formData.accountType) {
      case "saving":
        return mockSavingsAccounts.map((acc) => ({
          id: acc.id,
          memberName: acc.memberName,
          accountNumber: acc.accountNumber,
          accountType: acc.accountType,
          balance: acc.availableBalance,
        }))
      case "shares":
        return mockMembers.map((member) => ({
          id: member.id,
          memberName: member.fullName,
          accountNumber: `SH${member.memberNumber}`,
          accountType: "Shares",
          balance: member.totalShareValue,
        }))
      case "loan":
        return mockLoans.map((loan) => ({
          id: loan.id,
          memberName: loan.memberName,
          accountNumber: loan.applicationId,
          accountType: "Loan",
          balance: loan.outstandingBalance,
        }))
      case "income":
      case "expenses":
        return [
          {
            id: "general",
            memberName: "General Account",
            accountNumber: formData.accountType.toUpperCase() + "001",
            accountType: formData.accountType,
            balance: 0,
          },
        ]
      default:
        return []
    }
  }

  const selectedAccount = getAccountsByType().find((account) => account.id === formData.accountId)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case "Mobile Money":
        return <Smartphone className="h-4 w-4" />
      case "Bank Transfer":
        return <CreditCard className="h-4 w-4" />
      default:
        return <DollarSign className="h-4 w-4" />
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <ArrowUpDown className="h-5 w-5 mr-2" />
            Transaction Details
          </CardTitle>
          <CardDescription>Select account type and transaction details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountType">Account Type *</Label>
            <Select value={formData.accountType} onValueChange={(value) => handleInputChange("accountType", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saving">Savings</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="shares">Shares</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountId">Account *</Label>
            <Select
              value={formData.accountId}
              onValueChange={(value) => handleInputChange("accountId", value)}
              disabled={!formData.accountType}
            >
              <SelectTrigger>
                <SelectValue placeholder={formData.accountType ? "Select account" : "Select account type first"} />
              </SelectTrigger>
              <SelectContent>
                {getAccountsByType().map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div>
                      <div className="font-medium">
                        {account.memberName} - {account.accountNumber}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {account.accountType} • Balance: {formatCurrency(account.balance)}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAccount && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Account Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Account Type:</span> {selectedAccount.accountType}
                </div>
                <div>
                  <span className="font-medium">Account Number:</span> {selectedAccount.accountNumber}
                </div>
                <div>
                  <span className="font-medium">Account Holder:</span> {selectedAccount.memberName}
                </div>
                <div>
                  <span className="font-medium">Balance:</span> {formatCurrency(selectedAccount.balance)}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transactionType">Transaction Type *</Label>
              <Select
                value={formData.transactionType}
                onValueChange={(value) => handleInputChange("transactionType", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select transaction type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Deposit">Deposit</SelectItem>
                  <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (UGX) *</Label>
              <Input
                id="amount"
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange("amount", e.target.value)}
                placeholder="100000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transactionDate">Transaction Date *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="transactionDate"
                  type="date"
                  value={formData.transactionDate}
                  onChange={(e) => handleInputChange("transactionDate", e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="depositorName">Depositor's Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="depositorName"
                  value={formData.depositorName}
                  onChange={(e) => handleInputChange("depositorName", e.target.value)}
                  className="pl-10"
                  placeholder="Enter depositor's name"
                  required
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>How is this transaction being processed?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mode">Payment Mode *</Label>
            <Select value={formData.mode} onValueChange={(value) => handleInputChange("mode", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Cash
                  </div>
                </SelectItem>
                <SelectItem value="Mobile Money">
                  <div className="flex items-center">
                    <Smartphone className="h-4 w-4 mr-2" />
                    Mobile Money
                  </div>
                </SelectItem>
                <SelectItem value="Bank Transfer">
                  <div className="flex items-center">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Bank Transfer
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.mode && formData.mode !== "Cash" && (
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => handleInputChange("reference", e.target.value)}
                placeholder={
                  formData.mode === "Mobile Money" ? "Mobile Money transaction ID" : "Bank transfer reference"
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
          <CardDescription>Transaction notes and description</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Enter transaction description or notes..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Transaction Summary */}
      {formData.accountId && formData.transactionType && formData.amount && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Account Type:</span>
                <span className="font-medium capitalize">{formData.accountType}</span>
              </div>
              <div className="flex justify-between">
                <span>Account:</span>
                <span className="font-medium">{selectedAccount?.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Account Holder:</span>
                <span className="font-medium">{selectedAccount?.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span>Transaction Date:</span>
                <span className="font-medium">{new Date(formData.transactionDate).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Depositor:</span>
                <span className="font-medium">{formData.depositorName}</span>
              </div>
              <div className="flex justify-between">
                <span>Transaction Type:</span>
                <span className="font-medium">{formData.transactionType}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-medium">{formatCurrency(Number.parseFloat(formData.amount) || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Mode:</span>
                <span className="font-medium flex items-center">
                  {getModeIcon(formData.mode)}
                  <span className="ml-2">{formData.mode}</span>
                </span>
              </div>
              {selectedAccount && formData.accountType === "saving" && (
                <div className="flex justify-between pt-2 border-t">
                  <span>New Balance:</span>
                  <span className="font-medium">
                    {formatCurrency(
                      formData.transactionType === "Deposit"
                        ? selectedAccount.balance + (Number.parseFloat(formData.amount) || 0)
                        : selectedAccount.balance - (Number.parseFloat(formData.amount) || 0),
                    )}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Process Transaction</Button>
      </div>
    </form>
  )
}
