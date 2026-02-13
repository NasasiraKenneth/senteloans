"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Building2, Settings, CheckCircle, Shapes } from "lucide-react"
import { type InstitutionType, institutionTypeConfigs } from "@/lib/config"
import Link from "next/link"

type Step = "basic" | "type" | "config" | "confirm"

export default function NewInstitutionPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>("basic")
  const [formData, setFormData] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    registrationNumber: "",
    licenseNumber: "",
    type: "" as InstitutionType,
    modules: {
      savings: true,
      shares: true,
      loans: true,
    },
    features: {
      membershipNumbers: true,
      dividends: true,
      collateralTracking: false,
    },
  })

  const [errors, setErrors] = useState<{ [k: string]: string }>({})

  function validateBasic() {
    const e: { [k: string]: string } = {}
    if (!formData.name.trim()) e.name = "Institution name is required"
    if (!formData.contactPerson.trim()) e.contactPerson = "Contact person is required"
    if (!formData.email.trim()) {
      e.email = "Email is required"
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) e.email = "Enter a valid email address"
    }
    if (!formData.phone.trim()) e.phone = "Phone number is required"
    if (!formData.address.trim()) e.address = "Physical address is required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateType() {
    const e: { [k: string]: string } = {}
    if (!formData.type) e.type = "Please select an institution type"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const steps = [
    { id: "basic", title: "Basic Details", icon: Building2 },
    { id: "type", title: "Institution Type", icon: Shapes },
    { id: "config", title: "Configuration", icon: Settings },
    { id: "confirm", title: "Confirm", icon: CheckCircle },
  ]

  const handleNext = () => {
    const stepOrder: Step[] = ["basic", "type", "config", "confirm"]
    const currentIndex = stepOrder.indexOf(currentStep)
    if (currentIndex < stepOrder.length - 1) {
      // Validate current step before advancing
      if (currentStep === "basic" && !validateBasic()) return
      if (currentStep === "type" && !validateType()) return
      const nextStep = stepOrder[currentIndex + 1]
      setErrors({})
      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    const stepOrder: Step[] = ["basic", "type", "config", "confirm"]
    const currentIndex = stepOrder.indexOf(currentStep)
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1])
    }
  }

  const handleTypeSelection = (type: InstitutionType) => {
    const config = institutionTypeConfigs[type]
    setFormData({
      ...formData,
      type,
      modules: { ...config.modules! },
      features: { ...config.features! },
    })
  }

  const handleSubmit = async () => {
    // Final guard: ensure required fields remain valid
    if (!validateBasic() || !validateType()) return
    const payload = {
      name: formData.name,
      type: formData.type, // maps to enum: 'SACCO' | 'MFI' | 'Money Lender' (API normalizes dashed variants)
      contactPerson: formData.contactPerson,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      registrationNumber: formData.registrationNumber,
      licenseNumber: formData.licenseNumber,
      website: undefined, // not collected yet in UI
      status: "Active",
      modules: formData.modules,
      features: formData.features,
      clientTerminology: institutionTypeConfigs[formData.type]?.clientTerminology ?? "Client",
    }

    const res = await fetch("/api/admin/institutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const { error } = await res.json()
      throw new Error(error || "Failed to create institution")
    }
    const { id } = await res.json()
    router.push(id ? `/admin/institutions/${id}` : "/admin/institutions")
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = steps.findIndex((s) => s.id === currentStep) > index

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                isActive
                  ? "bg-primary border-primary text-white"
                  : isCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-gray-300 text-gray-400"
              }`}
            >
              <step.icon className="w-5 h-5" />
            </div>
            {index < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${isCompleted ? "bg-green-500" : "bg-gray-300"}`} />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <Link href="/admin/institutions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Institutions
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-primary">Add New Institution</h1>
          <p className="text-muted-foreground">Onboard a new SACCO, MFI, or Money Lender</p>
        </div>
      </div>

      {renderStepIndicator()}

      <Card className="shadow-none ring-1 ring-border">
        <CardContent className="p-6">
          {currentStep === "basic" && (
            <div className="space-y-6">
              <CardHeader className="px-0 border-b">
                <CardTitle className="flex items-center">
                  <Building2 className="mr-2 h-5 w-5" />
                  Basic Institution Details
                </CardTitle>
              </CardHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Institution Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Kampala Central SACCO"
                  />
                  {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person *</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="e.g., John Mukasa"
                  />
                  {errors.contactPerson && <p className="text-xs text-red-600">{errors.contactPerson}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="admin@institution.ug"
                  />
                  {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+256701234567"
                  />
                  {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Physical Address *</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Plot 15, Kampala Road, Kampala"
                />
                {errors.address && <p className="text-xs text-red-600">{errors.address}</p>}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input
                    id="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                    placeholder="SACCO/2023/001"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    placeholder="ML/2023/045"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === "type" && (
            <div className="space-y-6">
              <CardHeader className="px-0 border-b">
                <CardTitle>Select Institution Type</CardTitle>
                <p className="text-muted-foreground">
                  This determines the features and modules available to the institution
                </p>
              </CardHeader>

              <div className="grid gap-4 md:grid-cols-3">
                {Object.entries(institutionTypeConfigs).map(([type, config]) => (
                  <Card
                    key={type}
                    className={`cursor-pointer transition-all ${
                      formData.type === type ? "ring-2 ring-primary" : "hover:shadow-md"
                    }`}
                    onClick={() => handleTypeSelection(type as InstitutionType)}
                  >
                    <CardContent className="p-4">
                      <div className="text-center space-y-2">
                        <Building2 className="h-8 w-8 mx-auto text-primary" />
                        <h3 className="font-semibold capitalize">
                          {type === "money-lender" ? "Money Lender" : type.toUpperCase()}
                        </h3>
                        <p className="text-sm text-muted-foreground">Client Term: {config.clientTerminology}</p>
                        <div className="text-xs space-y-1">
                          <div>Modules:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(config.modules!).map(
                              ([module, enabled]) =>
                                enabled && (
                                  <span key={module} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                                    {module}
                                  </span>
                                ),
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {errors.type && <p className="text-xs text-red-600">{errors.type}</p>}
            </div>
          )}

          {currentStep === "config" && (
            <div className="space-y-6">
              <CardHeader className="px-0 border-b">
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 h-5 w-5" />
                  System Configuration
                </CardTitle>
                <p className="text-muted-foreground">
                  Customize modules and features for this {formData.type} institution
                </p>
              </CardHeader>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="font-semibold">Available Modules</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="loans-module">Loans Management</Label>
                        <p className="text-sm text-muted-foreground">
                          Loan applications, disbursements, and repayments
                        </p>
                      </div>
                      <input
                        id="loans-module"
                        type="checkbox"
                        checked={formData.modules.loans}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            modules: { ...formData.modules, loans: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="savings-module">Savings Management</Label>
                        <p className="text-sm text-muted-foreground">Savings accounts, deposits, and withdrawals</p>
                      </div>
                      <input
                        id="savings-module"
                        type="checkbox"
                        checked={formData.modules.savings}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            modules: { ...formData.modules, savings: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="shares-module">Shares Management</Label>
                        <p className="text-sm text-muted-foreground">Share purchases, transfers, and dividends</p>
                      </div>
                      <input
                        id="shares-module"
                        type="checkbox"
                        checked={formData.modules.shares}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            modules: { ...formData.modules, shares: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Additional Features</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="membership-numbers">Membership Numbers</Label>
                        <p className="text-sm text-muted-foreground">Auto-generate unique member IDs</p>
                      </div>
                      <input
                        id="membership-numbers"
                        type="checkbox"
                        checked={formData.features.membershipNumbers}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            features: { ...formData.features, membershipNumbers: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="dividends">Dividend Management</Label>
                        <p className="text-sm text-muted-foreground">Calculate and distribute dividends</p>
                      </div>
                      <input
                        id="dividends"
                        type="checkbox"
                        checked={formData.features.dividends}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            features: { ...formData.features, dividends: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="collateral-tracking">Collateral Tracking</Label>
                        <p className="text-sm text-muted-foreground">Track loan collateral and security</p>
                      </div>
                      <input
                        id="collateral-tracking"
                        type="checkbox"
                        checked={formData.features.collateralTracking}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            features: { ...formData.features, collateralTracking: e.target.checked },
                          })
                        }
                        className="h-4 w-4"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> These settings are pre-configured based on your selected institution type (
                  {formData.type}). You can customize them to match your specific operational needs.
                </p>
              </div>
            </div>
          )}

          

          {currentStep === "confirm" && (
            <div className="space-y-6">
              <CardHeader className="px-0 border-b">
                <CardTitle className="flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Confirm Institution Setup
                </CardTitle>
              </CardHeader>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="font-semibold">Institution Details</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <strong>Name:</strong> {formData.name}
                    </div>
                    <div>
                      <strong>Type:</strong> {formData.type?.toUpperCase()}
                    </div>
                    <div>
                      <strong>Contact:</strong> {formData.contactPerson}
                    </div>
                    <div>
                      <strong>Email:</strong> {formData.email}
                    </div>
                    <div>
                      <strong>Phone:</strong> {formData.phone}
                    </div>
                  </div>
                </div>

                
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Configuration</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Enabled Modules</h4>
                    <div className="space-y-1">
                      {Object.entries(formData.modules).map(([module, enabled]) => (
                        <div key={module} className="flex items-center text-sm">
                          <span className={`w-2 h-2 rounded-full mr-2 ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                          {module.charAt(0).toUpperCase() + module.slice(1)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Features</h4>
                    <div className="space-y-1">
                      {Object.entries(formData.features).map(([feature, enabled]) => (
                        <div key={feature} className="flex items-center text-sm">
                          <span className={`w-2 h-2 rounded-full mr-2 ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                          {feature.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === "basic"}>
              Back
            </Button>

            {currentStep === "confirm" ? (
              <Button onClick={handleSubmit}>Create Institution</Button>
            ) : (
              <Button onClick={handleNext}>Next</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
