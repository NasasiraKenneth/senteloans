"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { User, Phone, MapPin, Briefcase, Users, AlertCircle, Check, UserPlus, PiggyBank } from "lucide-react"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"
import Popover from "@mui/material/Popover"
import ReeveDatePicker, { parseDateOnly } from "@/components/newUI/date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"
import { useToast } from "@/components/ui/toast"

interface MemberRegistrationFormProps {
  onClose?: () => void
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

type SelectOption = { value: string; label: string }

function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: SelectOption[]
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = Boolean(anchor)
  const selectedLabel = options.find((o) => o.value === value)?.label

  return (
    <>
      <div
        onClick={(e) => {
          if (disabled) return
          setAnchor(e.currentTarget)
        }}
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 ${
          disabled
            ? "bg-muted/50 text-gray-500 cursor-not-allowed border-gray-200"
            :
          open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{selectedLabel || placeholder}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            width: anchor?.offsetWidth || 200,
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {options.map((opt) => {
            const isSelected = value === opt.value
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setAnchor(null)
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div
                  className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                    isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-800">{opt.label}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

export function MemberRegistrationForm({ onClose }: MemberRegistrationFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<any>(null)
  const permissionToastShown = useRef(false)

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
    monthlySavings: "",
    savingsAccountType: "Voluntary",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState("UGX")
  const [canCreateMember, setCanCreateMember] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
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

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/institution/members/permissions", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        const allowed = !!data?.permissions?.createMember
        setCanCreateMember(allowed)
        if (!allowed && !permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to create members.",
          })
          permissionToastShown.current = true
        }
      } catch {
        setCanCreateMember(false)
      }
    }
    loadPermissions()
  }, [toast])

  const validateForm = (): boolean => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const requiredText = (v: string) => v && v.trim().length >= 2
    if (!requiredText(formData.fullName)) {
      setError("Full Name is required"); scrollToError(); return false
    }
    if (!formData.nationalId || formData.nationalId.trim().length < 10) {
      setError("Enter a valid National ID"); scrollToError(); return false
    }
    if (!formData.dateOfBirth) {
      setError("Date of Birth is required"); scrollToError(); return false
    }
    try {
      const dob = parseDateOnly(formData.dateOfBirth)
      if (!dob) throw new Error("invalid_dob")
      const now = new Date()
      const age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
      if (age < 18) {
        setError("Member must be at least 18 years old"); scrollToError(); return false
      }
    } catch {
      setError("Enter a valid Date of Birth"); scrollToError(); return false
    }
    if (!formData.gender) {
      setError("Gender is required"); scrollToError(); return false
    }
    if (!formData.memberType) {
      setError("Member Type is required"); scrollToError(); return false
    }
    if (!formData.phoneNumber) {
      setError("Phone Number is required"); scrollToError(); return false
    }
    if (formData.email && !emailRe.test(formData.email)) {
      setError("Enter a valid email address"); scrollToError(); return false
    }
    return true
  }

  const buildCreatePayload = (): Record<string, unknown> => {
    let phone = formData.phoneNumber.trim()
    if (phone.startsWith("0")) phone = "+256" + phone.slice(1)
    const payload: Record<string, unknown> = {
      fullName: formData.fullName.trim(),
      phoneNumber: phone,
      nationalId: formData.nationalId.trim(),
      dateOfBirth: formData.dateOfBirth,
      gender: formData.gender,
      memberType: formData.memberType,
    }
    if (formData.email) payload.email = formData.email.trim()
    if (formData.maritalStatus) payload.maritalStatus = formData.maritalStatus
    if (formData.district) payload.district = formData.district
    if (formData.village) payload.village = formData.village
    if (formData.occupation) payload.occupation = formData.occupation
    if (formData.monthlyIncome) payload.monthlyIncome = Number(formData.monthlyIncome)
    if (formData.monthlySavings) payload.monthlySavings = Number(formData.monthlySavings)
    if (formData.savingsAccountType) payload.savingsAccountType = formData.savingsAccountType
    if (formData.nextOfKinName) payload.nextOfKinName = formData.nextOfKinName.trim()
    if (formData.nextOfKinRelationship) payload.nextOfKinRelationship = formData.nextOfKinRelationship
    if (formData.nextOfKinPhone) payload.nextOfKinPhone = formData.nextOfKinPhone.trim()
    return payload
  }

  const createMember = async (): Promise<{ id: string; member_number: string } | null> => {
    const res = await fetch("/api/institution/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCreatePayload()),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 403 && data?.error === "missing_permission:create_member") {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to create members.",
      })
      return null
    }
    if (res.status === 403 && data?.error === "branch_inactive") {
      const statusLabel = typeof data?.branch_status === "string" ? data.branch_status.toLowerCase() : "inactive"
      toast({
        variant: "destructive",
        title: "Branch not active",
        description: `Your branch is currently ${statusLabel}. Activate it from Settings → Branches before registering new members.`,
      })
      return null
    }
    if (res.status === 403 && data?.error === "branch_not_found") {
      toast({
        variant: "destructive",
        title: "Branch unavailable",
        description: "Your assigned branch could not be found. Contact your administrator.",
      })
      return null
    }
    if (res.status === 409 && data?.error === "duplicate_national_id") {
      toast({
        variant: "destructive",
        title: "National ID already exists",
        description: `A ${clientTerminology.toLowerCase()} with National ID "${formData.nationalId.trim()}" is already registered in this institution.`,
      })
      return null
    }
    if (
      res.status === 409 &&
      (data?.error === "duplicate_member_number" || data?.error === "duplicate_savings_account_number")
    ) {
      toast({
        variant: "destructive",
        title: "Duplicate identifier",
        description: "An auto-generated ID clashed with an existing record. Please try again.",
      })
      return null
    }
    if (!res.ok) {
      setError(data?.error || "Failed to create member")
      scrollToError()
      return null
    }
    return { id: data.id as string, member_number: data.member_number as string }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!canCreateMember) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to create members.",
      })
      return
    }
    if (!validateForm()) return

    setSubmitting(true)
    try {
      const created = await createMember()
      if (!created) return
      toast({
        variant: "success",
        title: `${clientTerminology} registered`,
        description: `${formData.fullName.trim()} (${created.member_number}) has been added successfully.`,
      })
      router.push(`/users/${created.id}`)
      router.refresh()
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

  const sections = [
    { id: "reg-personal", label: "Personal Info", icon: User },
    { id: "reg-contact", label: "Contact", icon: Phone },
    { id: "reg-location", label: "Location", icon: MapPin },
    { id: "reg-employment", label: "Employment", icon: Briefcase },
    { id: "reg-savings", label: "Monthly Savings", icon: PiggyBank },
    { id: "reg-nok", label: "Next of Kin", icon: Users },
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
                <input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  placeholder="e.g., John Doe Mukasa"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID Number <span className="text-red-500">*</span></Label>
                <input
                  id="nationalId"
                  value={formData.nationalId}
                  onChange={(e) => handleInputChange("nationalId", e.target.value)}
                  placeholder="e.g., CM1234567890123"
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                <ReeveDatePicker
                  value={formData.dateOfBirth}
                  onChange={(value) => handleInputChange("dateOfBirth", value)}
                  placeholder="Select date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender <span className="text-red-500">*</span></Label>
                <StyledSelect
                  value={formData.gender}
                  onChange={(value) => handleInputChange("gender", value)}
                  placeholder="Select gender"
                  options={[
                    { value: "Male", label: "Male" },
                    { value: "Female", label: "Female" },
                    { value: "Other", label: "Other" },
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maritalStatus">Marital Status</Label>
                <StyledSelect
                  value={formData.maritalStatus}
                  onChange={(value) => handleInputChange("maritalStatus", value)}
                  placeholder="Select marital status"
                  options={[
                    { value: "Single", label: "Single" },
                    { value: "Married", label: "Married" },
                    { value: "Divorced", label: "Divorced" },
                    { value: "Widowed", label: "Widowed" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberType">{clientTerminology} Type <span className="text-red-500">*</span></Label>
                <StyledSelect
                  value={formData.memberType}
                  onChange={(value) => handleInputChange("memberType", value)}
                  placeholder={`Select ${clientTerminology.toLowerCase()} type`}
                  options={[
                    { value: "Individual", label: "Individual" },
                    { value: "Group", label: "Group" },
                    { value: "Corporate", label: "Corporate" },
                  ]}
                />
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
                <input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  placeholder="e.g., +256701234567"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="e.g., member@email.com"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Used for the welcome message, KYC reminder, and invoice email. Leave blank if the {clientTerminology.toLowerCase()} has no email.
                </p>
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
                <StyledSelect
                  value={formData.district}
                  onChange={(value) => handleInputChange("district", value)}
                  placeholder="Select district"
                  options={[
                    { value: "Kampala", label: "Kampala" },
                    { value: "Wakiso", label: "Wakiso" },
                    { value: "Mukono", label: "Mukono" },
                    { value: "Entebbe", label: "Entebbe" },
                    { value: "Jinja", label: "Jinja" },
                    { value: "Mbarara", label: "Mbarara" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="village">Village / Area</Label>
                <input
                  id="village"
                  value={formData.village}
                  onChange={(e) => handleInputChange("village", e.target.value)}
                  placeholder="e.g., Nsambya Village"
                  className={inputClass}
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
                <StyledSelect
                  value={formData.occupation}
                  onChange={(value) => handleInputChange("occupation", value)}
                  placeholder="Select occupation"
                  options={[
                    { value: "Teacher", label: "Teacher" },
                    { value: "Farmer", label: "Farmer" },
                    { value: "Small Business Owner", label: "Small Business Owner" },
                    { value: "Civil Servant", label: "Civil Servant" },
                    { value: "Healthcare Worker", label: "Healthcare Worker" },
                    { value: "Student", label: "Student" },
                    { value: "Other", label: "Other" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyIncome">Monthly Income ({currency})</Label>
                <input
                  id="monthlyIncome"
                  type="number"
                  value={formData.monthlyIncome}
                  onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                  placeholder="e.g., 500,000"
                  className={inputClass}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Savings */}
        <Card id="reg-savings" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" />
              Monthly Savings
            </CardTitle>
            <CardDescription>The agreed monthly savings contribution for this {clientTerminology.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monthlySavings">Monthly Savings Amount ({currency})</Label>
                <input
                  id="monthlySavings"
                  type="number"
                  min={0}
                  value={formData.monthlySavings}
                  onChange={(e) => handleInputChange("monthlySavings", e.target.value)}
                  placeholder="e.g., 50,000"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  The amount the {clientTerminology.toLowerCase()} has agreed to save every month.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="savingsAccountType">Account Type</Label>
                <StyledSelect
                  value={formData.savingsAccountType}
                  onChange={(value) => handleInputChange("savingsAccountType", value)}
                  placeholder="Select account type"
                  options={[
                    { value: "Voluntary", label: "Voluntary" },
                    { value: "Fixed", label: "Fixed" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Voluntary lets the {clientTerminology.toLowerCase()} deposit/withdraw freely. Fixed locks contributions to the agreed monthly amount.
                </p>
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
                <input
                  id="nextOfKinName"
                  value={formData.nextOfKinName}
                  onChange={(e) => handleInputChange("nextOfKinName", e.target.value)}
                  placeholder="e.g., Mary Nakamya"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                <StyledSelect
                  value={formData.nextOfKinRelationship}
                  onChange={(value) => handleInputChange("nextOfKinRelationship", value)}
                  placeholder="Select relationship"
                  options={[
                    { value: "Spouse", label: "Spouse" },
                    { value: "Father", label: "Father" },
                    { value: "Mother", label: "Mother" },
                    { value: "Son", label: "Son" },
                    { value: "Daughter", label: "Daughter" },
                    { value: "Brother", label: "Brother" },
                    { value: "Sister", label: "Sister" },
                    { value: "Uncle", label: "Uncle" },
                    { value: "Aunt", label: "Aunt" },
                    { value: "Friend", label: "Friend" },
                    { value: "Other", label: "Other" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextOfKinPhone">Phone Number</Label>
                <input
                  id="nextOfKinPhone"
                  value={formData.nextOfKinPhone}
                  onChange={(e) => handleInputChange("nextOfKinPhone", e.target.value)}
                  placeholder="e.g., +256701234567"
                  className={inputClass}
                />
              </div>
            </div>
          </CardContent>
        </Card>

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
                {canCreateMember ? (
                  <Button type="submit" disabled={submitting}>
                    <Check className="h-4 w-4 mr-2" />
                    {submitting ? "Registering..." : `Register ${clientTerminology}`}
                  </Button>
                ) : (
                  <TooltipButton
                    tooltip="Missing create_member permission"
                    disabled
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-9 px-4 py-2 bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {`Register ${clientTerminology}`}
                  </TooltipButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
