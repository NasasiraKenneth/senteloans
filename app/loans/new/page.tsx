"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import AppLayout from "@/components/layout/app-layout"
import { ArrowLeft, Search, CreditCard, DollarSign, FileText, CheckCircle, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"

type Step = "search" | "product" | "details" | "confirmation"

export default function NewLoanApplicationPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState<Step>("search")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [memberResults, setMemberResults] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    memberId: "",
    loanProduct: "", // product ID
    principalAmount: "",
    tenure: "",
    purpose: "",
    collateral: "",
    guarantor1: "",
    guarantor2: "",
  })

  // Live data: products and clients for guarantor dropdowns
  const [products, setProducts] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false)
  const [clientOptions, setClientOptions] = useState<any[]>([])
  const [loadingClients, setLoadingClients] = useState<boolean>(false)

  // Selected product from live list
  const selectedProduct = products.find((p) => p.id === formData.loanProduct)

  // Live member search (debounced)
  useEffect(() => {
    let timer: any
    let abort = false
    const doSearch = async () => {
      const q = searchQuery.trim()
      if (q.length < 2) {
        setMemberResults([])
        return
      }
      setLoadingMembers(true)
      try {
        const res = await fetch(`/api/institution/clients?search=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to search members")
        if (!abort) setMemberResults(data.clients || [])
      } catch {
        if (!abort) setMemberResults([])
      } finally {
        if (!abort) setLoadingMembers(false)
      }
    }
    timer = setTimeout(doSearch, 300)
    return () => {
      abort = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  // Load loan products
  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoadingProducts(true)
      try {
        const res = await fetch(`/api/institution/loan-products?status=Active&limit=200`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load products")
        if (!abort) setProducts(Array.isArray(data.items) ? data.items : [])
      } catch (e: any) {
        if (!abort) {
          setProducts([])
          toast({ variant: "warning", title: "Products unavailable", description: e?.message || "Try again later" })
        }
      } finally {
        if (!abort) setLoadingProducts(false)
      }
    })()
    return () => { abort = true }
  }, [toast])

  // Preload some clients for guarantor selector
  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoadingClients(true)
      try {
        const res = await fetch(`/api/institution/clients?limit=50`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to load clients")
        if (!abort) setClientOptions(data.clients || [])
      } catch {
        if (!abort) setClientOptions([])
      } finally {
        if (!abort) setLoadingClients(false)
      }
    })()
    return () => { abort = true }
  }, [])

  const handleMemberSelect = (member: any) => {
    const normalized = {
      id: member.id,
      fullName: member.full_name || member.fullName,
      memberNumber: member.client_number || member.memberNumber,
      phoneNumber: member.phone_number || member.phoneNumber,
      email: member.email,
      status: member.status,
    }
    setSelectedMember(normalized)
    setFormData((prev) => ({ ...prev, memberId: normalized.id }))
    setCurrentStep("product")
  }

  const handleProductSelect = (productId: string) => {
    setFormData((prev) => ({ ...prev, loanProduct: productId }))
    setCurrentStep("details")
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e && typeof (e as any).preventDefault === "function") (e as any).preventDefault()
    // Client-side validation
    if (!selectedMember || !formData.memberId) {
      toast({ variant: "destructive", title: "Select member", description: "Please select a member first." })
      return
    }
    const product = selectedProduct
    if (!product) {
      toast({ variant: "destructive", title: "Select product", description: "Please choose a loan product." })
      return
    }
    const principal = Number(formData.principalAmount)
    const tenure = Number.parseInt(formData.tenure || "0", 10)
    if (!Number.isFinite(principal) || principal <= 0) {
      toast({ variant: "warning", title: "Invalid amount", description: "Enter a principal amount greater than zero." })
      return
    }
    if (!Number.isInteger(tenure) || tenure <= 0) {
      toast({ variant: "warning", title: "Invalid tenure", description: "Enter a valid number of months." })
      return
    }
    const minAmt = Number(product.minimum_amount ?? 0)
    const maxAmt = Number(product.maximum_amount ?? Number.MAX_SAFE_INTEGER)
    if (principal < minAmt) {
      toast({ variant: "warning", title: "Below minimum", description: `Minimum amount is UGX ${minAmt.toLocaleString()}.` })
      return
    }
    if (principal > maxAmt) {
      toast({ variant: "warning", title: "Above maximum", description: `Maximum amount is UGX ${maxAmt.toLocaleString()}.` })
      return
    }
    const maxTen = Number(product.maximum_tenure_months ?? 0)
    const minTen = Number(product.minimum_tenure_months ?? 1)
    if (tenure < minTen || (maxTen > 0 && tenure > maxTen)) {
      toast({ variant: "warning", title: "Invalid tenure", description: `Tenure must be between ${minTen} and ${maxTen} months.` })
      return
    }
    const purpose = String(formData.purpose || "").trim()
    if (!purpose) {
      toast({ variant: "warning", title: "Purpose required", description: "Please provide the loan purpose." })
      return
    }
    if (product.collateral_required && !String(formData.collateral || "").trim()) {
      toast({ variant: "warning", title: "Collateral required", description: "This product requires collateral." })
      return
    }
    const gReq = Number(product.guarantors_required || 0)
    const guarIds = [formData.guarantor1, formData.guarantor2].filter(Boolean)
    const uniqueGuars = Array.from(new Set(guarIds)).filter((id) => id !== formData.memberId)
    if (gReq > 0 && uniqueGuars.length < gReq) {
      toast({ variant: "warning", title: "Guarantors required", description: `Select at least ${gReq} guarantor(s).` })
      return
    }

    const payload: any = {
      client_id: formData.memberId,
      loan_product_id: formData.loanProduct,
      principal_amount: principal,
      tenure_months: tenure,
      purpose,
    }
    if (String(formData.collateral || "").trim()) payload.collateral_description = String(formData.collateral).trim()
    if (uniqueGuars.length > 0) payload.guarantor_ids = uniqueGuars

    setSubmitting(true)
    try {
      const res = await fetch("/api/institution/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to submit application")
      toast({ variant: "success", title: "Application submitted", description: `Application ${data.application_id} created.` })
      if (data?.id) router.push(`/loans/${data.id}`)
      else router.push("/loans")
    } catch (e: any) {
      toast({ variant: "destructive", title: "Submit failed", description: e?.message || "Unexpected error" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const calculateMonthlyPayment = () => {
    if (!formData.principalAmount || !formData.tenure || !selectedProduct) return 0
    const principal = Number.parseFloat(formData.principalAmount)
    const rate = Number(selectedProduct.interest_rate || 0) / 100 / 12
    const tenure = Number.parseInt(formData.tenure)
    const monthlyPayment = rate > 0 && tenure > 0 ? (principal * rate * Math.pow(1 + rate, tenure)) / (Math.pow(1 + rate, tenure) - 1) : 0
    return Number.isFinite(monthlyPayment) ? monthlyPayment : 0
  }

  const canProceedToConfirmation = () => {
    return formData.principalAmount && formData.tenure && formData.purpose
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href="/loans">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-balance">New Loan Application</h1>
                <p className="text-muted-foreground text-pretty">Process a new loan application for a SACCO member.</p>
              </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center space-x-4 mb-8">
              {(() => {
                const step1Active = currentStep === "search"
                const step1Done = (["product", "details", "confirmation"] as Step[]).includes(currentStep)
                return (
                  <div className={`flex items-center space-x-2 ${step1Active ? "text-primary" : step1Done ? "text-green-600" : "text-muted-foreground"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step1Active ? "bg-primary text-white" : step1Done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}>
                      {step1Done ? <CheckCircle className="h-4 w-4" /> : "1"}
                    </div>
                    <span className="font-medium">Find Member</span>
                  </div>
                )
              })()}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div
                className={`flex items-center space-x-2 ${currentStep === "product" ? "text-primary" : ["details", "confirmation"].includes(currentStep) ? "text-green-600" : "text-muted-foreground"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "product" ? "bg-primary text-white" : ["details", "confirmation"].includes(currentStep) ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {["details", "confirmation"].includes(currentStep) ? <CheckCircle className="h-4 w-4" /> : "2"}
                </div>
                <span className="font-medium">Select Product</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div
                className={`flex items-center space-x-2 ${currentStep === "details" ? "text-primary" : currentStep === "confirmation" ? "text-green-600" : "text-muted-foreground"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "details" ? "bg-primary text-white" : currentStep === "confirmation" ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {currentStep === "confirmation" ? <CheckCircle className="h-4 w-4" /> : "3"}
                </div>
                <span className="font-medium">Loan Details</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div
                className={`flex items-center space-x-2 ${currentStep === "confirmation" ? "text-primary" : "text-muted-foreground"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "confirmation" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
                >
                  4
                </div>
                <span className="font-medium">Confirm</span>
              </div>
            </div>

            {/* Step 1: Member Search */}
            {currentStep === "search" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Search className="h-5 w-5" />
                    <span>Find Member</span>
                  </CardTitle>
                  <CardDescription>Search for the member who wants to apply for a loan</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search by name, member number, or phone</Label>
                    <Input
                      id="search"
                      type="text"
                      placeholder="Enter member name, number, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="text-lg p-4"
                      autoFocus
                    />
                  </div>

                  {searchQuery && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {memberResults.length > 0 ? (
                        memberResults.map((member) => (
                          <Card
                            key={member.id}
                            className="cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => handleMemberSelect(member)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-semibold">{member.full_name || member.fullName}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {(member.client_number || member.memberNumber) ?? ""} • {(member.phone_number || member.phoneNumber) ?? ""}
                                  </p>
                                  <p className="text-sm text-muted-foreground">{member.email}</p>
                                </div>
                                <Badge variant="secondary">{member.status}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">{loadingMembers ? "Searching…" : "No members found matching your search."}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Product Selection */}
            {currentStep === "product" && selectedMember && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Selected Member</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{selectedMember.fullName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedMember.memberNumber} • {selectedMember.phoneNumber}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setCurrentStep("search")}>
                        Change Member
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CreditCard className="h-5 w-5" />
                      <span>Select Loan Product</span>
                    </CardTitle>
                    <CardDescription>Choose the appropriate loan product for this application</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      {products.map((product) => (
                        <Card
                          key={product.id}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => handleProductSelect(product.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold">{product.product_name}</h3>
                                <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
                                <div className="flex space-x-4 text-sm">
                                  <span>
                                    <strong>Rate:</strong> {Number(product.interest_rate)}%
                                  </span>
                                  <span>
                                    <strong>Max Tenure:</strong> {Number(product.maximum_tenure_months || 0)} months
                                  </span>
                                </div>
                              </div>
                              <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Loan Details */}
            {currentStep === "details" && selectedMember && selectedProduct && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Application Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Member:</span> {selectedMember.fullName}
                      </div>
                      <div>
                        <span className="font-medium">Product:</span> {selectedProduct.product_name}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setCurrentStep("confirmation")
                  }}
                  className="space-y-6"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <DollarSign className="h-5 w-5" />
                        <span>Loan Amount & Terms</span>
                      </CardTitle>
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
                            className="text-lg p-4"
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
                            max={Number(selectedProduct.maximum_tenure_months || 0)}
                            className="text-lg p-4"
                            required
                          />
                        </div>
                      </div>

                      {formData.principalAmount && formData.tenure && (
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                          <h4 className="font-medium mb-2">Loan Calculation</h4>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <span>Additional Details</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="purpose">Loan Purpose *</Label>
                        <Textarea
                          id="purpose"
                          value={formData.purpose}
                          onChange={(e) => handleInputChange("purpose", e.target.value)}
                          placeholder="Describe the purpose of this loan..."
                          className="min-h-[100px]"
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
                          className="min-h-[80px]"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="guarantor1">Guarantor 1</Label>
                          <Select
                            value={formData.guarantor1}
                            onValueChange={(value) => handleInputChange("guarantor1", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select guarantor" />
                            </SelectTrigger>
                            <SelectContent>
                              {clientOptions
                                .filter((m: any) => m.id !== formData.memberId)
                                .map((m: any) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {(m.full_name || m.fullName)} ({m.client_number || m.memberNumber})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guarantor2">Guarantor 2</Label>
                          <Select
                            value={formData.guarantor2}
                            onValueChange={(value) => handleInputChange("guarantor2", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select guarantor" />
                            </SelectTrigger>
                            <SelectContent>
                              {clientOptions
                                .filter((m: any) => m.id !== formData.memberId && m.id !== formData.guarantor1)
                                .map((m: any) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {(m.full_name || m.fullName)} ({m.client_number || m.memberNumber})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setCurrentStep("product")}>
                      Back to Products
                    </Button>
                    <Button type="submit" disabled={!canProceedToConfirmation()}>
                      Review Application
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Step 4: Confirmation */}
            {currentStep === "confirmation" && selectedMember && selectedProduct && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span>Review Loan Application</span>
                    </CardTitle>
                    <CardDescription>Please review all details before submitting the application</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground">MEMBER DETAILS</h4>
                          <p className="font-semibold">{selectedMember.fullName}</p>
                          <p className="text-sm text-muted-foreground">{selectedMember.memberNumber}</p>
                          <p className="text-sm text-muted-foreground">{selectedMember.phoneNumber}</p>
                        </div>
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground">LOAN PRODUCT</h4>
                          <p className="font-semibold">{selectedProduct.product_name}</p>
                          <p className="text-sm text-muted-foreground">{Number(selectedProduct.interest_rate)}% interest rate</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground">LOAN AMOUNT</h4>
                          <p className="font-semibold text-lg">
                            {new Intl.NumberFormat("en-UG", {
                              style: "currency",
                              currency: "UGX",
                              minimumFractionDigits: 0,
                            }).format(Number.parseFloat(formData.principalAmount))}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground">REPAYMENT</h4>
                          <p className="font-semibold">
                            {new Intl.NumberFormat("en-UG", {
                              style: "currency",
                              currency: "UGX",
                              minimumFractionDigits: 0,
                            }).format(calculateMonthlyPayment())}{" "}
                            / month
                          </p>
                          <p className="text-sm text-muted-foreground">for {formData.tenure} months</p>
                        </div>
                      </div>
                    </div>

                    {formData.purpose && (
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">LOAN PURPOSE</h4>
                        <p className="text-sm">{formData.purpose}</p>
                      </div>
                    )}

                    <div className="flex justify-between pt-6 border-t">
                      <Button type="button" variant="outline" onClick={() => setCurrentStep("details")}>
                        Edit Details
                      </Button>
                      <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700" disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit Application"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
    </AppLayout>
  )
}
