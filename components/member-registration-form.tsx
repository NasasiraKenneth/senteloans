"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Phone, MapPin, Briefcase, Users, DollarSign, AlertCircle, Check, UserPlus, ClipboardList } from "lucide-react"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"

interface MemberRegistrationFormProps {
  onClose?: () => void
}

export function MemberRegistrationForm({ onClose }: MemberRegistrationFormProps) {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
  }, [])

  const [formData, setFormData] = useState({
    fullName: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    memberType: "",
    phoneNumber: "",
    email: "",
    nationalId: "",
    district: "",
    village: "",
    occupation: "",
    monthlyIncome: "",
    loanOfficer: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
    membershipFeeType: "full" as "full" | "custom",
    membershipFeeAmount: "",
    membershipFeeMode: "Cash",
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [institutionMembershipFee, setInstitutionMembershipFee] = useState(0)
  const [currency, setCurrency] = useState("UGX")

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (typeof data?.config?.membershipFee === "number") {
            setInstitutionMembershipFee(data.config.membershipFee)
          }
          if (data?.config?.currency) {
            setCurrency(data.config.currency)
          }
        }
      } catch {
        // ignore
      }
    }
    loadSettings()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const requiredText = (v: string) => v && v.trim().length >= 2
    if (!requiredText(formData.fullName)) {
      setError("Full Name is required"); scrollToError(); return
    }
    if (!formData.nationalId || formData.nationalId.trim().length < 10) {
      setError("Enter a valid National ID"); scrollToError(); return
    }
    if (!formData.dateOfBirth) {
      setError("Date of Birth is required"); scrollToError(); return
    }
    try {
      const dob = new Date(formData.dateOfBirth)
      const now = new Date()
      const age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
      if (age < 18) {
        setError("Member must be at least 18 years old"); scrollToError(); return
      }
    } catch {
      setError("Enter a valid Date of Birth"); scrollToError(); return
    }
    if (!formData.gender) {
      setError("Gender is required"); scrollToError(); return
    }
    if (!formData.memberType) {
      setError("Member Type is required"); scrollToError(); return
    }
    if (!formData.phoneNumber) {
      setError("Phone Number is required"); scrollToError(); return
    }
    if (formData.email && !emailRe.test(formData.email)) {
      setError("Enter a valid email address"); scrollToError(); return
    }
    if (institutionMembershipFee > 0 && formData.membershipFeeType === "custom") {
      const amt = Number(formData.membershipFeeAmount)
      if (amt > institutionMembershipFee) {
        setError(`Membership fee amount cannot exceed ${institutionMembershipFee.toLocaleString()}`); scrollToError(); return
      }
    }

    let phone = formData.phoneNumber.trim()
    if (phone.startsWith("0")) phone = "+256" + phone.slice(1)

    setSubmitting(true)
    try {
      const payload: any = {
        fullName: formData.fullName.trim(),
        phoneNumber: phone,
        nationalId: formData.nationalId.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        clientType: formData.memberType,
      }
      if (formData.email) payload.email = formData.email.trim()
      if (formData.maritalStatus) payload.maritalStatus = formData.maritalStatus
      if (formData.district) payload.district = formData.district
      if (formData.village) payload.village = formData.village
      if (formData.occupation) payload.occupation = formData.occupation
      if (formData.monthlyIncome) payload.monthlyIncome = Number(formData.monthlyIncome)
      if (formData.loanOfficer) payload.loanOfficer = formData.loanOfficer

      const feeAmount = formData.membershipFeeType === "full"
        ? institutionMembershipFee
        : Number(formData.membershipFeeAmount) || 0
      if (feeAmount > 0) {
        payload.membershipFeePaid = feeAmount
        payload.membershipFeeMode = formData.membershipFeeMode
      }

      const res = await fetch("/api/institution/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create member")

      router.push(`/users/${data.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Failed to create member")
      scrollToError()
    } finally {
      setSubmitting(false)
    }
  }

  const scrollToError = () => {
    const el = document.getElementById("reg-error")
    if (el) {
      const scrollContainer = el.closest("main")
      if (scrollContainer) {
        const offset = el.offsetTop - scrollContainer.offsetTop - 24
        scrollContainer.scrollTo({ top: offset, behavior: "smooth" })
      }
    }
  }

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const scrollContainer = el.closest("main")
    if (scrollContainer) {
      const offset = el.offsetTop - scrollContainer.offsetTop - 24
      scrollContainer.scrollTo({ top: offset, behavior: "smooth" })
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCancel = () => {
    if (onClose) {
      onClose()
    } else {
      router.push("/users")
    }
  }

  const clientTerminology = session?.institution?.config?.clientTerminology || "Member"
  const isMoneyLender = session?.institution?.type === "MONEY_LENDER"

  const sections = [
    { id: "reg-personal", label: "Personal Info", icon: User },
    { id: "reg-contact", label: "Contact", icon: Phone },
    { id: "reg-location", label: "Location", icon: MapPin },
    { id: "reg-employment", label: "Employment", icon: Briefcase },
    { id: "reg-nok", label: "Next of Kin", icon: Users },
    ...(institutionMembershipFee > 0 ? [{ id: "reg-fee", label: "Membership Fee", icon: DollarSign }] : []),
    ...(isMoneyLender ? [{ id: "reg-assignment", label: "Assignment", icon: ClipboardList }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-16 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
        <div className="px-6 pb-5">
          <div className="flex items-center gap-4 -mt-8">
            <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0 pb-0.5">
              <h1 className="text-xl font-bold tracking-tight">Register New {clientTerminology}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Fill in the details below. Fields marked with <span className="text-red-500">*</span> are required.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section navigation pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => { e.preventDefault(); scrollToSection(s.id) }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </a>
        ))}
      </div>

      {/* Error alert */}
      {error && (
        <div id="reg-error" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card id="reg-personal" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>Basic {clientTerminology.toLowerCase()} details and identification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  placeholder="e.g., John Doe Mukasa"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID Number <span className="text-red-500">*</span></Label>
                <Input
                  id="nationalId"
                  value={formData.nationalId}
                  onChange={(e) => handleInputChange("nationalId", e.target.value)}
                  placeholder="e.g., CM1234567890123"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender <span className="text-red-500">*</span></Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maritalStatus">Marital Status</Label>
                <Select value={formData.maritalStatus} onValueChange={(value) => handleInputChange("maritalStatus", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select marital status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single">Single</SelectItem>
                    <SelectItem value="Married">Married</SelectItem>
                    <SelectItem value="Divorced">Divorced</SelectItem>
                    <SelectItem value="Widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberType">{clientTerminology} Type <span className="text-red-500">*</span></Label>
                <Select value={formData.memberType} onValueChange={(value) => handleInputChange("memberType", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${clientTerminology.toLowerCase()} type`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Individual">Individual</SelectItem>
                    <SelectItem value="Group">Group</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card id="reg-contact" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Contact Information
            </CardTitle>
            <CardDescription>Phone number and email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number <span className="text-red-500">*</span></Label>
                <Input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  placeholder="e.g., +256701234567"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="e.g., member@email.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Information */}
        <Card id="reg-location" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Location Information
            </CardTitle>
            <CardDescription>Residence and address details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="district">District</Label>
                <Select value={formData.district} onValueChange={(value) => handleInputChange("district", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select district" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kampala">Kampala</SelectItem>
                    <SelectItem value="Wakiso">Wakiso</SelectItem>
                    <SelectItem value="Mukono">Mukono</SelectItem>
                    <SelectItem value="Entebbe">Entebbe</SelectItem>
                    <SelectItem value="Jinja">Jinja</SelectItem>
                    <SelectItem value="Mbarara">Mbarara</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="village">Village / Area</Label>
                <Input
                  id="village"
                  value={formData.village}
                  onChange={(e) => handleInputChange("village", e.target.value)}
                  placeholder="e.g., Nsambya Village"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment Information */}
        <Card id="reg-employment" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Employment Information
            </CardTitle>
            <CardDescription>Occupation and income details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Select value={formData.occupation} onValueChange={(value) => handleInputChange("occupation", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select occupation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Teacher">Teacher</SelectItem>
                    <SelectItem value="Farmer">Farmer</SelectItem>
                    <SelectItem value="Small Business Owner">Small Business Owner</SelectItem>
                    <SelectItem value="Civil Servant">Civil Servant</SelectItem>
                    <SelectItem value="Healthcare Worker">Healthcare Worker</SelectItem>
                    <SelectItem value="Student">Student</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyIncome">Monthly Income ({currency})</Label>
                <Input
                  id="monthlyIncome"
                  type="number"
                  value={formData.monthlyIncome}
                  onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                  placeholder="e.g., 500,000"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next of Kin */}
        <Card id="reg-nok" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Next of Kin
            </CardTitle>
            <CardDescription>Emergency contact and beneficiary details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="nextOfKinName">Full Name</Label>
                <Input
                  id="nextOfKinName"
                  value={formData.nextOfKinName}
                  onChange={(e) => handleInputChange("nextOfKinName", e.target.value)}
                  placeholder="e.g., Mary Nakamya"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                <Select
                  value={formData.nextOfKinRelationship}
                  onValueChange={(value) => handleInputChange("nextOfKinRelationship", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spouse">Spouse</SelectItem>
                    <SelectItem value="Father">Father</SelectItem>
                    <SelectItem value="Mother">Mother</SelectItem>
                    <SelectItem value="Son">Son</SelectItem>
                    <SelectItem value="Daughter">Daughter</SelectItem>
                    <SelectItem value="Brother">Brother</SelectItem>
                    <SelectItem value="Sister">Sister</SelectItem>
                    <SelectItem value="Uncle">Uncle</SelectItem>
                    <SelectItem value="Aunt">Aunt</SelectItem>
                    <SelectItem value="Friend">Friend</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextOfKinPhone">Phone Number</Label>
                <Input
                  id="nextOfKinPhone"
                  value={formData.nextOfKinPhone}
                  onChange={(e) => handleInputChange("nextOfKinPhone", e.target.value)}
                  placeholder="e.g., +256701234567"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Membership Fee */}
        {institutionMembershipFee > 0 && (
          <Card id="reg-fee" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Membership Fee
              </CardTitle>
              <CardDescription>
                Record membership fee payment ({currency} {institutionMembershipFee.toLocaleString()}).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Payment Type</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="membershipFeeType"
                      value="full"
                      checked={formData.membershipFeeType === "full"}
                      onChange={() => handleInputChange("membershipFeeType", "full")}
                      className="w-4 h-4 accent-[#f08c2b]"
                    />
                    <span className="text-sm">
                      Full Payment ({currency} {institutionMembershipFee.toLocaleString()})
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="membershipFeeType"
                      value="custom"
                      checked={formData.membershipFeeType === "custom"}
                      onChange={() => handleInputChange("membershipFeeType", "custom")}
                      className="w-4 h-4 accent-[#f08c2b]"
                    />
                    <span className="text-sm">Custom Amount (Partial Payment)</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="membershipFeeAmount">Amount ({currency})</Label>
                  {formData.membershipFeeType === "full" ? (
                    <Input
                      id="membershipFeeAmount"
                      value={institutionMembershipFee.toLocaleString()}
                      readOnly
                      className="bg-muted/50"
                    />
                  ) : (
                    <Input
                      id="membershipFeeAmount"
                      type="number"
                      value={formData.membershipFeeAmount}
                      onChange={(e) => handleInputChange("membershipFeeAmount", e.target.value)}
                      placeholder={`Max: ${institutionMembershipFee.toLocaleString()}`}
                      max={institutionMembershipFee}
                      min={0}
                    />
                  )}
                  {formData.membershipFeeType === "custom" && Number(formData.membershipFeeAmount) > institutionMembershipFee && (
                    <p className="text-xs text-red-500">Amount cannot exceed {currency} {institutionMembershipFee.toLocaleString()}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="membershipFeeMode">Payment Mode</Label>
                  <Select
                    value={formData.membershipFeeMode}
                    onValueChange={(value) => handleInputChange("membershipFeeMode", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Summary */}
              {(() => {
                const payAmount = formData.membershipFeeType === "full"
                  ? institutionMembershipFee
                  : Number(formData.membershipFeeAmount) || 0
                const percentage = institutionMembershipFee > 0 ? (payAmount / institutionMembershipFee) * 100 : 0
                const isValid = payAmount > 0 && payAmount <= institutionMembershipFee

                if (!isValid && formData.membershipFeeType === "custom" && !formData.membershipFeeAmount) return null

                return (
                  <div className={`p-3 rounded-lg border ${isValid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Payment Summary</span>
                      <span className={`text-sm font-semibold ${isValid ? "text-green-700" : "text-red-700"}`}>
                        {currency} {payAmount.toLocaleString()} / {institutionMembershipFee.toLocaleString()} ({Math.round(percentage)}%)
                      </span>
                    </div>
                    <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${percentage >= 100 ? "bg-green-500" : "bg-orange-500"}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}

        {/* Assignment - Only show for Money Lenders */}
        {isMoneyLender && (
          <Card id="reg-assignment" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Assignment
              </CardTitle>
              <CardDescription>
                Assign a loan officer to this {clientTerminology.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-md space-y-2">
                <Label htmlFor="loanOfficer">Loan Officer <span className="text-red-500">*</span></Label>
                <Select value={formData.loanOfficer} onValueChange={(value) => handleInputChange("loanOfficer", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select loan officer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Annet Mukasa">Annet Mukasa</SelectItem>
                    <SelectItem value="Samuel Kato">Samuel Kato</SelectItem>
                    <SelectItem value="Grace Namugga">Grace Namugga</SelectItem>
                    <SelectItem value="David Ssemakula">David Ssemakula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sticky Save Bar */}
        <div className="sticky bottom-0 z-10 -mx-1 px-1">
          <div className="bg-background/95 backdrop-blur-sm border rounded-xl px-6 py-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground hidden sm:block">
                Complete all required fields before submitting.
              </p>
              <div className="flex items-center gap-3 ml-auto">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  <Check className="h-4 w-4 mr-2" />
                  {submitting ? "Registering..." : `Register ${clientTerminology}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
