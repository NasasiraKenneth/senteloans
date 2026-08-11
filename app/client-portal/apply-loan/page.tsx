"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  CheckCircle,
  Calculator,
  Loader2,
  Calendar,
  Wallet,
  Sparkles,
  Info,
  Shield,
  ArrowRight,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import StyledSelect from "@/components/newUI/styled_select"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import { useToast } from "@/hooks/use-toast"
import { useClientSession } from "@/components/client-session-provider"
import { cn } from "@/lib/utils"
import { calculateLoanTerms } from "@/lib/loans/calculations"

interface LoanProduct {
  id: string
  name: string
  description: string
  interestRate: number
  interestCalculationMethod?: string
  maxAmount: number
  minAmount: number
  maxTenure: number
  minTenure: number
  processingFeePercentage?: number
  collateralRequired?: boolean
}

interface ExistingLoan {
  id: string
  applicationId: string
  loanProduct: string
  principalAmount: number
  outstandingBalance: number
  status: string
  interestRate?: number
}

interface Guarantor {
  id: string
  full_name: string
  phone_number: string
  member_number: string
}

export default function ApplyLoanPage() {
  const { data, isLoading: isSessionLoading, formatMoney } = useClientSession()
  const session = data ? { institution: data.institution, client: data.client } : null
  const [currentStep, setCurrentStep] = useState(1)
  const [creditType, setCreditType] = useState<"normal" | "top up">("normal")
  const [existingLoans, setExistingLoans] = useState<ExistingLoan[]>([])
  const [isLoadingExistingLoans, setIsLoadingExistingLoans] = useState(false)
  const [selectedExistingLoanId, setSelectedExistingLoanId] = useState("")

  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null)
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [productPage, setProductPage] = useState(1)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right")
  const PRODUCTS_PER_PAGE = 4

  const totalProductPages = useMemo(() => {
    return Math.ceil(loanProducts.length / PRODUCTS_PER_PAGE)
  }, [loanProducts])

  const visibleProducts = useMemo(() => {
    return loanProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE)
  }, [loanProducts, productPage])

  const handlePrevProductPage = () => {
    setSlideDirection("left")
    setProductPage((prev) => Math.max(prev - 1, 1))
  }

  const handleNextProductPage = () => {
    setSlideDirection("right")
    setProductPage((prev) => Math.min(prev + 1, totalProductPages))
  }

  const [loanAmount, setLoanAmount] = useState("")
  const [tenure, setTenure] = useState("")
  const [purpose, setPurpose] = useState("")
  const [collateralDescription, setCollateralDescription] = useState("")
  const [selectedGuarantors, setSelectedGuarantors] = useState<Guarantor[]>([])
  const [availableGuarantors, setAvailableGuarantors] = useState<Guarantor[]>([])
  const [isLoadingGuarantors, setIsLoadingGuarantors] = useState(false)
  const [selectedGuarantorSelectValue, setSelectedGuarantorSelectValue] = useState("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedLoanId, setSubmittedLoanId] = useState("")
  const [submittedApplicationId, setSubmittedApplicationId] = useState("")
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchLoanProducts()
    fetchExistingLoans()
    fetchAvailableGuarantors()
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

  const fetchExistingLoans = async () => {
    try {
      setIsLoadingExistingLoans(true)
      const res = await fetch("/api/client/loans")
      const data = await res.json()

      if (data && Array.isArray(data.loans)) {
        const eligible = data.loans.filter(
          (l: { status?: string }) => !["rejected", "closed", "paid"].includes(String(l.status || "").toLowerCase())
        )
        setExistingLoans(eligible)
      }
    } catch (error) {
      console.error("Error fetching existing loans:", error)
    } finally {
      setIsLoadingExistingLoans(false)
    }
  }

  const fetchAvailableGuarantors = async () => {
    try {
      setIsLoadingGuarantors(true)
      const res = await fetch("/api/client/search-guarantors")
      const data = await res.json()
      if (data.ok && Array.isArray(data.guarantors)) {
        setAvailableGuarantors(data.guarantors)
      }
    } catch (error) {
      console.error("Error fetching available guarantors:", error)
    } finally {
      setIsLoadingGuarantors(false)
    }
  }

  const creditTypeOptions = [
    { value: "normal", label: "Normal Loan", description: "Standard credit facility for members" },
    { value: "top up", label: "Top Up Loan", description: "Top up or refinance an existing active loan" },
  ]

  const existingLoanOptions = useMemo(() => {
    return existingLoans.map((l) => ({
      value: l.id,
      label: `${l.applicationId} — ${l.loanProduct} (${formatMoney(Number(l.outstandingBalance || 0))} balance)`,
      description: `Principal: ${formatMoney(Number(l.principalAmount || 0))} • Status: ${l.status}`,
    }))
  }, [existingLoans, formatMoney])

  const selectedExistingLoan = useMemo(() => {
    return existingLoans.find((l) => l.id === selectedExistingLoanId) || null
  }, [existingLoans, selectedExistingLoanId])

  const guarantorOptions = useMemo(() => {
    const selectedIds = new Set(selectedGuarantors.map((g) => g.id))
    return availableGuarantors
      .filter((g) => !selectedIds.has(g.id))
      .map((g) => ({
        value: g.id,
        label: `${g.full_name} (${g.member_number || "No Member #"})`,
        description: `Phone: ${g.phone_number || "—"}`,
      }))
  }, [availableGuarantors, selectedGuarantors])

  const handleAddGuarantor = (guarantorId: string) => {
    if (!guarantorId) return
    const found = availableGuarantors.find((g) => g.id === guarantorId)
    if (found && selectedGuarantors.length < 3) {
      setSelectedGuarantors((prev) => [...prev, found])
      setSelectedGuarantorSelectValue("")
    }
  }

  const handleRemoveGuarantor = (guarantorId: string) => {
    setSelectedGuarantors((prev) => prev.filter((g) => g.id !== guarantorId))
  }

  if (isSessionLoading || !session) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#f08c2b]" />
      </div>
    )
  }

  const institution = session.institution
  const institutionType = institution?.type || "SACCO"
  const requiresGuarantors = institutionType === "SACCO"
  const requiresCollateral = institutionType === "Money Lender" || Boolean(selectedProduct?.collateralRequired)

  const calculateLoanDetails = () => {
    if (!selectedProduct || !loanAmount || !tenure) return null

    const principal = Number.parseFloat(loanAmount)
    const months = Number.parseInt(tenure)

    if (isNaN(principal) || isNaN(months) || months <= 0 || principal <= 0) return null

    const terms = calculateLoanTerms(
      principal,
      Number(selectedProduct.interestRate || 0),
      months,
      selectedProduct.interestCalculationMethod || "reducing_balance"
    )

    const monthlyPayment = terms.monthlyPayment
    const totalPayment = terms.totalAmount
    const totalInterest = Math.max(0, totalPayment - principal)

    const processingFeePercentage = Number(selectedProduct.processingFeePercentage || 0)
    const processingFeeAmount = Math.round(((principal * processingFeePercentage) / 100) * 100) / 100
    const settlementAmount = creditType === "top up" ? Math.max(0, Number(selectedExistingLoan?.outstandingBalance || 0)) : 0
    const disbursableAmount = Math.max(0, Math.round((principal - processingFeeAmount - settlementAmount) * 100) / 100)

    return {
      principal,
      monthlyPayment: Math.round(monthlyPayment),
      totalPayment: Math.round(totalPayment),
      totalInterest: Math.round(totalInterest),
      processingFeePercentage,
      processingFeeAmount,
      settlementAmount,
      disbursableAmount,
    }
  }

  const handleProductSelect = (product: LoanProduct) => {
    if (creditType === "top up" && !selectedExistingLoanId) {
      toast({
        variant: "destructive",
        title: "Existing Loan Required",
        description: "Please select the active loan facility you want to top up before proceeding.",
      })
      return
    }
    setSelectedProduct(product)
    setCurrentStep(2)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (creditType === "top up" && !selectedExistingLoanId) {
      errors.existingLoan = "Please select an existing loan to top up"
    }
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
        monthly_income: session.client.monthlyIncome || 1000000,
        loan_type: creditType,
        existing_loan_id: creditType === "top up" ? selectedExistingLoanId : undefined,
        previous_loan_id: creditType === "top up" ? selectedExistingLoanId : undefined,

        ...(requiresCollateral && { collateral_description: collateralDescription.trim() }),
        ...(requiresGuarantors && { guarantor_ids: selectedGuarantors.map((g) => g.id) }),
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

  // Sacco edit label class
  const inputLabelClass = "text-[9px] uppercase font-bold tracking-widest text-[#f08c2b]/90 mb-1 block"
  const formInputClass = "bg-background border-border/80 focus-visible:ring-[#f08c2b] focus-visible:border-[#f08c2b]/50 transition-all duration-200"
  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Apply for Loan"
        description="Quick, borderless, and secure digital credit application process."
        backHref="/client-portal/loans"
      />

      {/* Progress Indicator Card */}
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              Step {currentStep} of 4
            </span>
            <span className="text-[10px] font-bold font-mono text-muted-foreground">
              {Math.round((currentStep / 4) * 100)}% Complete
            </span>
          </div>
          <Progress value={(currentStep / 4) * 100} className="h-1.5 bg-muted" indicatorClassName="bg-primary" />
          <div className="grid grid-cols-4 mt-3 text-[9px] font-bold uppercase tracking-wider text-center text-muted-foreground">
            <span className={cn(currentStep >= 1 && "text-[#f08c2b]")}>Select Credit</span>
            <span className={cn(currentStep >= 2 && "text-[#f08c2b]")}>Fill Details</span>
            <span className={cn(currentStep >= 3 && "text-[#f08c2b]")}>Review & Sign</span>
            <span className={cn(currentStep >= 4 && "text-[#f08c2b]")}>Disbursement</span>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {/* Step 1: Product Selection */}
        {currentStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Credit Facility Type Selector Card */}
            <Card className="border-border/80 shadow-xs overflow-hidden">
              <CardHeader className="pb-3 bg-muted/10 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#f08c2b]" />
                  <CardTitle className="text-sm font-bold text-foreground">Credit Facility Type</CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Choose whether you are applying for a new standard facility or topping up an existing active facility.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">Credit Type</label>
                    <StyledSelect
                      value={creditType}
                      onChange={(val) => {
                        const newType = val as "normal" | "top up"
                        setCreditType(newType)
                        if (newType === "normal") {
                          setSelectedExistingLoanId("")
                        }
                      }}
                      placeholder="Choose credit type"
                      options={creditTypeOptions}
                    />
                  </div>

                  {creditType === "top up" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-[#f08c2b]">
                          Existing Loan to Top Up
                        </label>
                        {selectedExistingLoan && (
                          <Badge variant="outline" className="text-[9px] bg-[#f08c2b]/10 text-[#f08c2b] border-[#f08c2b]/30">
                            {selectedExistingLoan.status}
                          </Badge>
                        )}
                      </div>
                      <StyledSelect
                        value={selectedExistingLoanId}
                        onChange={setSelectedExistingLoanId}
                        placeholder={
                          isLoadingExistingLoans
                            ? "Loading your active loans..."
                            : existingLoanOptions.length
                              ? "Select active loan to top up"
                              : "No active loans found"
                        }
                        options={existingLoanOptions}
                        searchable
                      />
                    </div>
                  )}
                </div>

                {creditType === "top up" && (
                  <>
                    {selectedExistingLoan ? (
                      <div className="rounded-lg border border-[#f08c2b]/30 bg-[#fff8f2] dark:bg-[#f08c2b]/5 p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-muted-foreground block">Application ID</span>
                          <span className="font-mono font-bold text-foreground">{selectedExistingLoan.applicationId}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-muted-foreground block">Facility</span>
                          <span className="font-medium text-foreground truncate block">{selectedExistingLoan.loanProduct}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-muted-foreground block">Outstanding Balance</span>
                          <span className="font-mono font-bold text-[#f08c2b]">{formatMoney(selectedExistingLoan.outstandingBalance)}</span>
                        </div>
                      </div>
                    ) : existingLoans.length === 0 && !isLoadingExistingLoans ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                        You do not currently have any active loans eligible for top up. Please select <strong>Normal Loan</strong> to proceed.
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between px-0.5 pt-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Available Credit Products
              </h2>
              {loanProducts.length > PRODUCTS_PER_PAGE && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 bg-transparent border-border hover:bg-muted/40 text-foreground"
                    disabled={productPage === 1}
                    onClick={handlePrevProductPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    {productPage} / {totalProductPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 bg-transparent border-border hover:bg-muted/40 text-foreground"
                    disabled={productPage === totalProductPages}
                    onClick={handleNextProductPage}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#f08c2b]" />
              </div>
            ) : loanProducts.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-border">
                <p className="text-xs text-muted-foreground">No loan products available at this time</p>
              </Card>
            ) : (
              <div className="overflow-hidden relative w-full min-h-[220px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={productPage}
                    initial={{ x: slideDirection === "right" ? 120 : -120, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: slideDirection === "right" ? -120 : 120, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="grid gap-4 md:grid-cols-2"
                  >
                    {visibleProducts.map((product) => (
                      <Card
                        key={product.id}
                        className="cursor-pointer hover:shadow-md hover:border-[#f08c2b]/50 border-border/80 border-t-2 border-t-[#f08c2b] transition-all duration-200 flex flex-col justify-between"
                        onClick={() => handleProductSelect(product)}
                      >
                        <CardHeader className="pb-3 bg-muted/10 border-b border-border/40">
                          <div className="flex items-start justify-between gap-4">
                            <CardTitle className="text-sm font-bold text-foreground">{product.name}</CardTitle>
                            <Badge className="text-[9px] font-bold px-2 py-0.5 bg-[#f08c2b]/10 text-[#f08c2b] border-[#f08c2b]/20" variant="outline">
                              {product.interestRate}% Interest
                            </Badge>
                          </div>
                          <CardDescription className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {product.description || "Cooperative credit facility for registered Sacco members."}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Borrow Limits</p>
                              <p className="font-bold text-foreground mt-0.5">
                                {formatMoney(product.minAmount)} - {formatMoney(product.maxAmount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Tenure Window</p>
                              <p className="font-bold text-foreground mt-0.5">
                                {product.minTenure} - {product.maxTenure} Months
                              </p>
                            </div>
                            {Number(product.processingFeePercentage || 0) > 0 && (
                              <div className="col-span-2 pt-2 border-t border-border/40 flex items-center justify-between">
                                <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Processing Fee</span>
                                <Badge variant="outline" className="text-[9px] font-bold text-[#f08c2b] border-[#f08c2b]/30 bg-[#f08c2b]/10">
                                  {product.processingFeePercentage}%
                                </Badge>
                              </div>
                            )}
                            {product.collateralRequired && (
                              <div className="col-span-2 pt-2 border-t border-border/40 flex items-center justify-between">
                                <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Security Required</span>
                                <Badge variant="outline" className="text-[9px] font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                                  Collateral
                                </Badge>
                              </div>
                            )}
                          </div>
                          <Button className="w-full text-xs font-semibold uppercase tracking-wider mt-4">
                            Select Facility
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 2: Loan Details */}
        {currentStep === 2 && selectedProduct && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start"
          >
            {/* Form Input Columns */}
            <div className="space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between px-0.5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fill Requirements</h2>
                <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)} className="h-7 text-[10px] uppercase font-bold tracking-wider">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Change Product
                </Button>
              </div>

              {creditType === "top up" && selectedExistingLoan && (
                <div className="rounded-lg border border-[#f08c2b]/30 bg-[#fff8f2] dark:bg-[#f08c2b]/5 p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[#f08c2b] block">Top Up Applied Against</span>
                    <span className="font-mono font-bold text-foreground">{selectedExistingLoan.applicationId}</span>
                    <span className="text-muted-foreground ml-1">({selectedExistingLoan.loanProduct})</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block">Balance to Settle</span>
                    <span className="font-mono font-bold text-[#f08c2b]">{formatMoney(selectedExistingLoan.outstandingBalance)}</span>
                  </div>
                </div>
              )}

              <Card className="border-border/80 border-t-2 border-t-[#f08c2b] shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/10">
                  <CardTitle className="text-sm font-bold text-foreground">{selectedProduct.name}</CardTitle>
                  <CardDescription className="text-xs">Specify loan size, monthly duration, and credit purpose.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amount" className={inputLabelClass}>Loan Amount (UGX)</Label>
                      <input
                        id="amount"
                        type="number"
                        placeholder="Enter amount"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        min={selectedProduct.minAmount}
                        max={selectedProduct.maxAmount}
                        className={inputClass(!!validationErrors.amount)}
                      />
                      {validationErrors.amount && (
                        <p className="text-[10px] text-rose-600 mt-1 font-semibold">{validationErrors.amount}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground mt-1">
                        Min: {formatMoney(selectedProduct.minAmount)}, Max: {formatMoney(selectedProduct.maxAmount)}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="tenure" className={inputLabelClass}>Repayment Period (Months)</Label>
                      <input
                        id="tenure"
                        type="number"
                        placeholder="Enter tenure in months"
                        value={tenure}
                        onChange={(e) => setTenure(e.target.value)}
                        min={selectedProduct.minTenure}
                        max={selectedProduct.maxTenure}
                        className={inputClass(!!validationErrors.tenure)}
                      />
                      {validationErrors.tenure && (
                        <p className="text-[10px] text-rose-600 mt-1 font-semibold">{validationErrors.tenure}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="purpose" className={inputLabelClass}>Credit Purpose</Label>
                    <textarea
                      id="purpose"
                      placeholder="Detail how these Sacco funds will be utilized (e.g. Business extension, land acquisition)"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      rows={3}
                      className={inputClass(!!validationErrors.purpose)}
                    />
                    {validationErrors.purpose && (
                      <p className="text-[10px] text-rose-600 mt-1 font-semibold">{validationErrors.purpose}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      // Perform simple local validate step 2
                      const amountNum = Number(loanAmount)
                      if (!loanAmount || isNaN(amountNum) || amountNum < selectedProduct.minAmount || amountNum > selectedProduct.maxAmount) {
                        toast({ variant: "destructive", title: "Amount limit error", description: `Please enter an amount between ${formatMoney(selectedProduct.minAmount)} and ${formatMoney(selectedProduct.maxAmount)}.` })
                        return
                      }
                      if (!tenure) {
                        toast({ variant: "destructive", title: "Tenure required", description: "Please select a repayment duration." })
                        return
                      }
                      if (!purpose || purpose.trim().length < 10) {
                        toast({ variant: "destructive", title: "Purpose required", description: "Please specify a clear purpose (min 10 characters)." })
                        return
                      }
                      setCurrentStep(3)
                    }}
                    className="w-full text-xs font-semibold uppercase tracking-wider"
                  >
                    Continue to Review & Sign
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Live Calculation Sidebar */}
            <div className="space-y-4 lg:col-span-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">Live Breakdown</h2>
              
              {loanDetails ? (
                <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
                  <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
                    <Calculator className="h-4.5 w-4.5 text-[#f08c2b]" />
                    <CardTitle className="text-sm font-semibold">Repayment Estimates</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monthly Payment:</span>
                      <span className="font-bold text-foreground font-mono">{formatMoney(loanDetails.monthlyPayment)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/40 pt-2.5">
                      <span className="text-muted-foreground">Interest Cost:</span>
                      <span className="font-bold text-[#f08c2b] font-mono">+{formatMoney(loanDetails.totalInterest)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/40 pt-2.5">
                      <span className="text-muted-foreground">Total Repayable:</span>
                      <span className="font-bold text-emerald-600 font-mono">{formatMoney(loanDetails.totalPayment)}</span>
                    </div>

                    {loanDetails.processingFeePercentage > 0 && (
                      <div className="flex justify-between border-t border-border/40 pt-2.5 text-amber-600 dark:text-amber-400">
                        <span>Processing Fee ({loanDetails.processingFeePercentage}%):</span>
                        <span className="font-mono font-bold">-{formatMoney(loanDetails.processingFeeAmount)}</span>
                      </div>
                    )}

                    {loanDetails.settlementAmount > 0 && (
                      <div className="flex justify-between border-t border-border/40 pt-2.5 text-amber-600 dark:text-amber-400">
                        <span>Top Up Settlement:</span>
                        <span className="font-mono font-bold">-{formatMoney(loanDetails.settlementAmount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-border/40 pt-2.5 text-foreground bg-emerald-500/10 dark:bg-emerald-500/15 -mx-4 px-4 py-2.5 mt-1 border-t border-b border-emerald-500/20">
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">Disbursable Amount:</span>
                      <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300">{formatMoney(loanDetails.disbursableAmount)}</span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/80 border-dashed shadow-sm text-center p-6 text-xs text-muted-foreground">
                  Specify amount and tenure to view monthly calculations.
                </Card>
              )}

              {/* Borrow Policy Box */}
              <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
                <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
                  <Info className="h-4.5 w-4.5 text-[#f08c2b]" />
                  <CardTitle className="text-sm font-semibold">Guarantors Policy</CardTitle>
                </CardHeader>
                <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    As a registered SACCO member, your application requires **at least 1 active Sacco member** to sign as a guarantor.
                  </p>
                  <p className="border-t border-border/40 pt-2.5">
                    Guarantors will receive an automated request to sign via their client portals immediately upon submission.
                  </p>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* Step 3: Guarantors & Review */}
        {currentStep === 3 && selectedProduct && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {requiresGuarantors && requiresCollateral
                  ? "Security, Guarantors & Review"
                  : requiresCollateral
                    ? "Collateral Security & Review"
                    : "Guarantors & Review"}
              </h2>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)} className="h-7 text-[10px] uppercase font-bold tracking-wider">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Edit Details
              </Button>
            </div>

            {/* Guarantor selection for SACCO using StyledSelect */}
            {requiresGuarantors && (
              <Card className="border-border/80 border-t-2 border-t-[#f08c2b] shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-foreground">Sacco Guarantors</CardTitle>
                      <CardDescription className="text-xs">
                        Select fellow verified Sacco members to guarantee this credit facility (Min 1, Max 3).
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold bg-[#f08c2b]/10 text-[#f08c2b] border-[#f08c2b]/30">
                      {selectedGuarantors.length} / 3 Added
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {selectedGuarantors.length < 3 ? (
                    <div className="space-y-1.5">
                      <Label className={inputLabelClass}>
                        Select Guarantor ({3 - selectedGuarantors.length} remaining)
                      </Label>
                      <StyledSelect
                        value={selectedGuarantorSelectValue}
                        onChange={handleAddGuarantor}
                        placeholder={
                          isLoadingGuarantors
                            ? "Loading verified members..."
                            : guarantorOptions.length > 0
                              ? "Search and select a fellow Sacco member..."
                              : "No other available members found"
                        }
                        options={guarantorOptions}
                        searchable
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      Maximum of 3 guarantors selected. You can remove a member below to choose someone else.
                    </div>
                  )}

                  {validationErrors.guarantors && (
                    <p className="text-[10px] text-rose-600 font-semibold">{validationErrors.guarantors}</p>
                  )}

                  {/* Selected Guarantors List */}
                  {selectedGuarantors.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground block">
                        Selected Guarantors ({selectedGuarantors.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {selectedGuarantors.map((guarantor) => (
                          <div
                            key={guarantor.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/15 hover:bg-muted/25 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-[#f08c2b]/15 text-[#f08c2b] flex items-center justify-center font-bold text-xs shrink-0">
                                {guarantor.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-xs text-foreground truncate">
                                  {guarantor.full_name}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">
                                  {guarantor.member_number || guarantor.phone_number}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 shrink-0 ml-2"
                              onClick={() => handleRemoveGuarantor(guarantor.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Collateral Security Card if required */}
            {requiresCollateral && (
              <Card className="border-border/80 border-t-2 border-t-[#f08c2b] shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-foreground">Collateral Security</CardTitle>
                      <CardDescription className="text-xs">
                        This credit facility requires asset or collateral security backing.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold bg-[#f08c2b]/10 text-[#f08c2b] border-[#f08c2b]/30">
                      Security Required
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  <Label htmlFor="collateral-step3" className={inputLabelClass}>
                    Collateral Asset Description
                  </Label>
                  <textarea
                    id="collateral-step3"
                    placeholder="Detail collateral items (e.g. Vehicle model, registration number, logbook details, land title reference, estimated market valuation)..."
                    value={collateralDescription}
                    onChange={(e) => setCollateralDescription(e.target.value)}
                    rows={3}
                    className={inputClass(!!validationErrors.collateral)}
                  />
                  {validationErrors.collateral && (
                    <p className="text-[10px] text-rose-600 font-semibold">{validationErrors.collateral}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Please provide detailed asset descriptions and estimated valuation (minimum 20 characters).
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Application Summary */}
            <Card className="border-border/80 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40 bg-muted/10 flex flex-row items-center gap-2">
                <Shield className="h-4.5 w-4.5 text-[#f08c2b]" />
                <CardTitle className="text-sm font-semibold">Application Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan Product:</span>
                  <span className="font-bold text-foreground">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Credit Facility Type:</span>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold text-[#f08c2b] border-[#f08c2b]/30 bg-[#f08c2b]/10">
                    {creditType === "top up" ? "Top Up Loan" : "Normal Loan"}
                  </Badge>
                </div>
                {creditType === "top up" && selectedExistingLoan && (
                  <div className="flex justify-between border-t border-border/40 pt-2.5">
                    <span className="text-muted-foreground">Settling Active Loan:</span>
                    <span className="font-bold text-foreground font-mono">
                      {selectedExistingLoan.applicationId} ({formatMoney(selectedExistingLoan.outstandingBalance)})
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Requested Amount:</span>
                  <span className="font-bold text-foreground font-mono">{formatMoney(Number(loanAmount))}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Tenure Period:</span>
                  <span className="font-bold text-foreground">{tenure} Months</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Interest Rate:</span>
                  <span className="font-bold text-[#f08c2b]">{selectedProduct.interestRate}% Year</span>
                </div>
                {loanDetails && (
                  <div className="flex justify-between border-t border-[#f08c2b]/20 bg-[#f08c2b]/2 p-2 rounded border border-border/45">
                    <span className="text-[#f08c2b] font-bold">Estimated Installment (Month):</span>
                    <span className="font-bold text-[#f08c2b] font-mono">{formatMoney(loanDetails.monthlyPayment)}</span>
                  </div>
                )}
                {loanDetails && loanDetails.processingFeePercentage > 0 && (
                  <div className="flex justify-between border-t border-border/40 pt-2.5 text-amber-600 dark:text-amber-400">
                    <span>Processing Fee ({loanDetails.processingFeePercentage}%):</span>
                    <span className="font-mono font-bold">-{formatMoney(loanDetails.processingFeeAmount)}</span>
                  </div>
                )}
                {loanDetails && loanDetails.settlementAmount > 0 && (
                  <div className="flex justify-between border-t border-border/40 pt-2.5 text-amber-600 dark:text-amber-400">
                    <span>Top Up Settlement:</span>
                    <span className="font-mono font-bold">-{formatMoney(loanDetails.settlementAmount)}</span>
                  </div>
                )}
                {loanDetails && (
                  <div className="flex justify-between border-t border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-500/15 p-2 rounded">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">Disbursable Amount:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-300 font-mono">{formatMoney(loanDetails.disbursableAmount)}</span>
                  </div>
                )}
                {requiresGuarantors && selectedGuarantors.length > 0 && (
                  <div className="flex justify-between border-t border-border/40 pt-2.5">
                    <span className="text-muted-foreground">Sacco Guarantors:</span>
                    <span className="font-bold text-foreground text-right truncate max-w-xs">
                      {selectedGuarantors.map((g) => g.full_name).join(", ")}
                    </span>
                  </div>
                )}
                {requiresCollateral && collateralDescription && (
                  <div className="flex justify-between border-t border-border/40 pt-2.5">
                    <span className="text-muted-foreground">Collateral Security:</span>
                    <span className="font-bold text-foreground text-right truncate max-w-xs font-mono">
                      {collateralDescription}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Usage Purpose:</span>
                  <span className="font-bold text-foreground truncate max-w-sm">{purpose}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="flex-1 text-xs font-semibold uppercase tracking-wider">
                Back to details
              </Button>
              <Button
                onClick={handleSubmitApplication}
                className="flex-1 text-xs font-semibold uppercase tracking-wider"
                disabled={
                  isSubmitting ||
                  (requiresGuarantors && selectedGuarantors.length === 0) ||
                  (requiresCollateral && (!collateralDescription || collateralDescription.trim().length < 20))
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting Application...
                  </>
                ) : (
                  "Confirm & Submit Application"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Success Screen */}
        {currentStep === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-6 text-center max-w-md mx-auto py-4"
          >
            <div className="mx-auto w-14 h-14 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex items-center justify-center text-emerald-500 shadow-sm animate-bounce">
              <CheckCircle className="h-7 w-7" />
            </div>
            
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-foreground">Loan Application Submitted!</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your loan application has been registered successfully. The appraisal process has initiated, and status changes will reflect below.
              </p>
            </div>

            <Card className="border-border/80 shadow-sm text-left overflow-hidden">
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Application ID:</span>
                  <span className="font-bold text-foreground font-mono">{submittedApplicationId || "—"}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Facility Type:</span>
                  <Badge variant="outline" className="text-[9px] uppercase font-bold text-[#f08c2b] border-[#f08c2b]/30 bg-[#f08c2b]/10">
                    {creditType === "top up" ? "Top Up Loan" : "Normal Loan"}
                  </Badge>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Requested Amount:</span>
                  <span className="font-bold text-foreground font-mono">{formatMoney(Number(loanAmount))}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Repayment Period:</span>
                  <span className="font-bold text-foreground">{tenure} Months</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted-foreground">Approval Status:</span>
                  <Badge className="text-[9px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-600 border-amber-500/25 uppercase tracking-wider" variant="outline">
                    Under Review
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (submittedLoanId) {
                    router.push(`/client-portal/loan-details/${submittedLoanId}`)
                  } else {
                    router.push("/client-portal/loans")
                  }
                }}
                className="flex-1 text-xs font-semibold uppercase tracking-wider"
              >
                View Loan details
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/client-portal")}
                className="flex-1 text-xs font-semibold uppercase tracking-wider"
              >
                Back to Dashboard
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
