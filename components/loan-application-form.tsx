"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { mockMembers } from "@/lib/mock-data"
import { User, CreditCard, DollarSign, FileText } from "lucide-react"

interface LoanApplicationFormProps {
  onClose: () => void
}

export function LoanApplicationForm({ onClose }: LoanApplicationFormProps) {
  const [formData, setFormData] = useState({
    memberId: "",
    loanProduct: "",
    principalAmount: "",
    tenure: "",
    purpose: "",
    collateral: "",
    guarantor1: "",
    guarantor2: "",
  })

  const loanProducts = [
    { name: "Personal Loan", rate: 15, maxTenure: 24, description: "For personal expenses and emergencies" },
    { name: "Agricultural Loan", rate: 12, maxTenure: 36, description: "For farming activities and equipment" },
    { name: "Business Loan", rate: 18, maxTenure: 18, description: "For business expansion and working capital" },
    { name: "Emergency Loan", rate: 20, maxTenure: 6, description: "Quick loans for urgent needs" },
    { name: "Education Loan", rate: 10, maxTenure: 48, description: "For school fees and educational expenses" },
  ]

  const selectedProduct = loanProducts.find((p) => p.name === formData.loanProduct)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the data to your backend
    console.log("New loan application:", formData)
    onClose()
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const calculateMonthlyPayment = () => {
    if (!formData.principalAmount || !formData.tenure || !selectedProduct) return 0
    const principal = Number.parseFloat(formData.principalAmount)
    const rate = selectedProduct.rate / 100 / 12
    const tenure = Number.parseInt(formData.tenure)
    const monthlyPayment = (principal * rate * Math.pow(1 + rate, tenure)) / (Math.pow(1 + rate, tenure) - 1)
    return monthlyPayment
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Member Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="h-5 w-5 mr-2" />
            Member Information
          </CardTitle>
          <CardDescription>Select the member applying for the loan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="memberId">Member *</Label>
            <Select value={formData.memberId} onValueChange={(value) => handleInputChange("memberId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {mockMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.fullName} ({member.memberNumber}) - {member.phoneNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loan Product */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="h-5 w-5 mr-2" />
            Loan Product
          </CardTitle>
          <CardDescription>Choose the appropriate loan product</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loanProduct">Loan Product *</Label>
            <Select value={formData.loanProduct} onValueChange={(value) => handleInputChange("loanProduct", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select loan product" />
              </SelectTrigger>
              <SelectContent>
                {loanProducts.map((product) => (
                  <SelectItem key={product.name} value={product.name}>
                    <div>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {product.rate}% interest • Max {product.maxTenure} months
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">{selectedProduct.name}</h4>
              <p className="text-sm text-muted-foreground mb-2">{selectedProduct.description}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Interest Rate:</span> {selectedProduct.rate}%
                </div>
                <div>
                  <span className="font-medium">Max Tenure:</span> {selectedProduct.maxTenure} months
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loan Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Loan Details
          </CardTitle>
          <CardDescription>Specify loan amount and repayment terms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="principalAmount">Principal Amount (UGX) *</Label>
              <Input
                id="principalAmount"
                type="number"
                value={formData.principalAmount}
                onChange={(e) => handleInputChange("principalAmount", e.target.value)}
                placeholder="1000000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenure">Tenure (Months) *</Label>
              <Input
                id="tenure"
                type="number"
                value={formData.tenure}
                onChange={(e) => handleInputChange("tenure", e.target.value)}
                placeholder="12"
                max={selectedProduct?.maxTenure}
                required
              />
            </div>
          </div>

          {formData.principalAmount && formData.tenure && selectedProduct && (
            <div className="p-4 bg-primary/5 rounded-lg">
              <h4 className="font-medium mb-2">Loan Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Monthly Payment:</span>{" "}
                  {new Intl.NumberFormat("en-UG", {
                    style: "currency",
                    currency: "UGX",
                    minimumFractionDigits: 0,
                  }).format(calculateMonthlyPayment())}
                </div>
                <div>
                  <span className="font-medium">Total Interest:</span>{" "}
                  {new Intl.NumberFormat("en-UG", {
                    style: "currency",
                    currency: "UGX",
                    minimumFractionDigits: 0,
                  }).format(
                    calculateMonthlyPayment() * Number.parseInt(formData.tenure) -
                      Number.parseFloat(formData.principalAmount),
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Additional Information
          </CardTitle>
          <CardDescription>Purpose and security details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="purpose">Loan Purpose *</Label>
            <Textarea
              id="purpose"
              value={formData.purpose}
              onChange={(e) => handleInputChange("purpose", e.target.value)}
              placeholder="Describe the purpose of this loan..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collateral">Collateral/Security</Label>
            <Textarea
              id="collateral"
              value={formData.collateral}
              onChange={(e) => handleInputChange("collateral", e.target.value)}
              placeholder="Describe any collateral or security offered..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guarantor1">Guarantor 1</Label>
              <Select value={formData.guarantor1} onValueChange={(value) => handleInputChange("guarantor1", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select guarantor" />
                </SelectTrigger>
                <SelectContent>
                  {mockMembers
                    .filter((member) => member.id !== formData.memberId)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.fullName} ({member.memberNumber})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guarantor2">Guarantor 2</Label>
              <Select value={formData.guarantor2} onValueChange={(value) => handleInputChange("guarantor2", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select guarantor" />
                </SelectTrigger>
                <SelectContent>
                  {mockMembers
                    .filter((member) => member.id !== formData.memberId && member.id !== formData.guarantor1)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.fullName} ({member.memberNumber})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Submit Application</Button>
      </div>
    </form>
  )
}
