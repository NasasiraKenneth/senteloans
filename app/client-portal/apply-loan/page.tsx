"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, CheckCircle, Calculator, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GuarantorSearch } from "@/components/guarantor-search"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import { useToast } from "@/hooks/use-toast"
import { useClientSession } from "@/components/client-session-provider"

interface LoanProduct {
  id: string
  name: string
  description: string
  interestRate: number
  maxAmount: number
  minAmount: number
  maxTenure: number
  minTenure: number
}

interface Guarantor {
  id: string
  full_name: string
  phone_number: string
  member_number: string
}

export default function ApplyLoanPage() {
  const { data, isLoading: isSessionLoading } = useClientSession()
  const session = data ? { institution: data.institution, client: data.client } : null
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null)
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [loanAmount, setLoanAmount] = useState("")
  const [tenure, setTenure] = useState("")
  const [purpose, setPurpose] = useState("")
  const [monthlyIncome, setMonthlyIncome] = useState("")
  const [collateralDescription, setCollateralDescription] = useState("")
  const [selectedGuarantors, setSelectedGuarantors] = useState<Guarantor[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedLoanId, setSubmittedLoanId] = useState("")
  const [submittedApplicationId, setSubmittedApplicationId] = useState("")
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchLoanProducts()
  }, [])

  const fetchLoanProducts = async () => {
    try {
      setIsLoadingProducts(true)
      const res = await fetch("/api/client/loan-products")
      const data = await res.json()
      
      if (data.ok && data.products) {
        setLoanProducts(data.products)
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load loan products",
        })
      }
    } catch (error) {
      console.error("Error fetching loan products:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load loan products",
      })
    } finally {
      setIsLoadingProducts(false)
    }
  }

  if (isSessionLoading || !session) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const institution = session.institution
  const institutionType = institution?.type || "SACCO"
  const requiresGuarantors = institutionType === "SACCO"
  const requiresCollateral = institutionType === "Money Lender"

  const calculateLoanDetails = () => {
    if (!selectedProduct || !loanAmount || !tenure) return null

    const principal = Number.parseFloat(loanAmount)
    const rate = selectedProduct.interestRate / 100 / 12 // Monthly rate
    const months = Number.parseInt(tenure)

    const monthlyPayment = (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1)
    const totalPayment = monthlyPayment * months
    const totalInterest = totalPayment - principal

    return {
      monthlyPayment: Math.round(monthlyPayment),
      totalPayment: Math.round(totalPayment),
      totalInterest: Math.round(totalInterest),
    }
  }

  const handleProductSelect = (product: LoanProduct) => {
    setSelectedProduct(product)
    setCurrentStep(2)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!selectedProduct) errors.product = "Please select a loan product"
    if (!loanAmount || Number.parseFloat(loanAmount) <= 0) {
      errors.amount = "Please enter a valid loan amount"
    } else if (selectedProduct) {
      const amount = Number.parseFloat(loanAmount)
      if (amount < selectedProduct.minAmount || amount > selectedProduct.maxAmount) {
        errors.amount = `Amount must be between UGX ${selectedProduct.minAmount.toLocaleString()} and UGX ${selectedProduct.maxAmount.toLocaleString()}`
      }
    }
    if (!tenure) errors.tenure = "Please select a tenure"
    if (!purpose || purpose.trim().length < 10) {
      errors.purpose = "Purpose must be at least 10 characters"
    }
    if (!monthlyIncome || Number.parseFloat(monthlyIncome) <= 0) {
      errors.income = "Please enter a valid monthly income"
    }
    if (requiresGuarantors && selectedGuarantors.length === 0) {
      errors.guarantors = "At least one guarantor is required"
    }
    if (requiresCollateral && (!collateralDescription || collateralDescription.trim().length < 20)) {
      errors.collateral = "Collateral description must be at least 20 characters"
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmitApplication = async () => {
    if (!validateForm()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fix the errors before submitting",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        loan_product_id: selectedProduct!.id,
        principal_amount: Number.parseFloat(loanAmount),
        tenure_months: Number.parseInt(tenure),
        purpose: purpose.trim(),
        monthly_income: Number.parseFloat(monthlyIncome),
        ...(requiresCollateral && { collateral_description: collateralDescription.trim() }),
        ...(requiresGuarantors && { guarantor_ids: selectedGuarantors.map(g => g.id) }),
      }

      const res = await fetch("/api/client/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setSubmittedLoanId(data.loanId)
        setSubmittedApplicationId(data.applicationId)
        setCurrentStep(4) // Success step
        toast({
          title: "Success!",
          description: "Your loan application has been submitted successfully",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: data.error || "Failed to submit loan application",
        })
      }
    } catch (error) {
      console.error("Loan submission error:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const loanDetails = calculateLoanDetails()

  return (
    <div className="space-y-6">
      <ClientPortalPageHeader
        title="Apply for Loan"
        description="Quick and secure loan application"
        backHref="/client-portal"
      />

        {/* Progress Indicator */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Step {currentStep} of 4</span>
              <span className="text-sm text-muted-foreground">{Math.round((currentStep / 4) * 100)}% Complete</span>
            </div>
            <Progress value={(currentStep / 4) * 100} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Select Product</span>
              <span>Loan Details</span>
              <span>Review</span>
              <span>Submit</span>
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Product Selection */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Choose Loan Product</h2>
            <p className="text-muted-foreground">Select the loan product that best fits your needs</p>

            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : loanProducts.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No loan products available at this time</p>
              </Card>
            ) : null}

            {loanProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleProductSelect(product)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <Badge variant="outline">{product.interestRate}% interest</Badge>
                  </div>
                  <CardDescription>{product.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Amount Range</p>
                      <p className="font-medium">
                        UGX {(product.minAmount / 1000).toFixed(0)}K - {(product.maxAmount / 1000000).toFixed(1)}M
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenure</p>
                      <p className="font-medium">
                        {product.minTenure} - {product.maxTenure} months
                      </p>
                    </div>
                  </div>
                  {product.description && (
                    <div>
                      <p className="text-muted-foreground text-sm">Description</p>
                      <p className="text-sm">{product.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Step 2: Loan Details */}
        {currentStep === 2 && selectedProduct && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Loan Details</h2>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)}>
                Change Product
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selectedProduct.name}</CardTitle>
                <CardDescription>Fill in your loan requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Loan Amount (UGX)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Enter amount"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      min={selectedProduct.minAmount}
                      max={selectedProduct.maxAmount}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Min: UGX {(selectedProduct.minAmount / 1000).toFixed(0)}K, Max: UGX{" "}
                      {(selectedProduct.maxAmount / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="tenure">Repayment Period (Months)</Label>
                    <Select value={tenure} onValueChange={setTenure}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tenure" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: selectedProduct.maxTenure - selectedProduct.minTenure + 1 }, (_, i) => {
                          const months = selectedProduct.minTenure + i
                          return (
                            <SelectItem key={months} value={months.toString()}>
                              {months} months
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="purpose">Loan Purpose</Label>
                  <Textarea
                    id="purpose"
                    placeholder="Describe how you plan to use this loan"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="income">Monthly Income (UGX)</Label>
                  <Input
                    id="income"
                    type="number"
                    placeholder="Enter your monthly income"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                  />
                  {validationErrors.income && (
                    <p className="text-xs text-destructive mt-1">{validationErrors.income}</p>
                  )}
                </div>

                {/* Collateral for Money Lenders */}
                {requiresCollateral && (
                  <div>
                    <Label htmlFor="collateral">Collateral Description</Label>
                    <Textarea
                      id="collateral"
                      placeholder="Describe your collateral in detail (e.g., Car - Toyota Corolla 2015, Logbook available)"
                      value={collateralDescription}
                      onChange={(e) => setCollateralDescription(e.target.value)}
                      rows={4}
                    />
                    {validationErrors.collateral && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.collateral}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum 20 characters required
                    </p>
                  </div>
                )}

                {/* Loan Calculator */}
                {loanDetails && selectedProduct && (
                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center">
                        <Calculator className="h-4 w-4 mr-2" />
                        Loan Calculation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Monthly Payment:</span>
                        <span className="font-semibold">UGX {(loanDetails.monthlyPayment / 1000).toFixed(0)}K</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Interest:</span>
                        <span className="font-semibold">UGX {(loanDetails.totalInterest / 1000).toFixed(0)}K</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Repayment:</span>
                        <span className="font-semibold">UGX {(loanDetails.totalPayment / 1000).toFixed(0)}K</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button
                  onClick={() => setCurrentStep(3)}
                  className="w-full"
                  disabled={!loanAmount || !tenure || !purpose || !monthlyIncome}
                >
                  Continue to Review
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Guarantors & Review */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{requiresGuarantors ? "Guarantors & Review" : "Review Application"}</h2>

            {/* Guarantors for SACCO only */}
            {requiresGuarantors && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Select Guarantors</CardTitle>
                  <CardDescription>
                    Search and select fellow members to guarantee your loan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GuarantorSearch
                    selectedGuarantors={selectedGuarantors}
                    onGuarantorsChange={setSelectedGuarantors}
                    minGuarantors={1}
                    maxGuarantors={3}
                  />
                  {validationErrors.guarantors && (
                    <p className="text-sm text-destructive mt-2">{validationErrors.guarantors}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Application Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Loan Product:</span>
                  <span className="font-medium">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">UGX {(Number.parseFloat(loanAmount) / 1000).toFixed(0)}K</span>
                </div>
                <div className="flex justify-between">
                  <span>Tenure:</span>
                  <span className="font-medium">{tenure} months</span>
                </div>
                <div className="flex justify-between">
                  <span>Interest Rate:</span>
                  <span className="font-medium">{selectedProduct?.interestRate}%</span>
                </div>
                {loanDetails && (
                  <div className="flex justify-between">
                    <span>Monthly Payment:</span>
                    <span className="font-medium">UGX {(loanDetails.monthlyPayment / 1000).toFixed(0)}K</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Purpose:</span>
                  <span className="font-medium text-sm">{purpose.slice(0, 50)}{purpose.length > 50 ? "..." : ""}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleSubmitApplication} 
                className="flex-1" 
                disabled={isSubmitting || (requiresGuarantors && selectedGuarantors.length === 0)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Application"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {currentStep === 4 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Application Submitted!</h2>
            <p className="text-muted-foreground">
              Your loan application has been successfully submitted. You will receive updates via SMS and in your
              portal.
            </p>

            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Application ID:</span>
                    <span className="font-medium">{submittedApplicationId || "Pending..."}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Loan Amount:</span>
                    <span className="font-medium">UGX {(Number.parseFloat(loanAmount) / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <Badge variant="outline">Under Review</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex space-x-3">
              <Button 
                onClick={() => {
                  if (submittedLoanId) {
                    router.push(`/client-portal/loan-details/${submittedLoanId}`)
                  } else {
                    router.push("/client-portal/loans")
                  }
                }} 
                className="flex-1"
              >
                View Loan Details
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/client-portal")}
                className="flex-1"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}
    </div>
  )
}
