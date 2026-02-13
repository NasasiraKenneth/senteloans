"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Phone, MapPin, Briefcase, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"

interface MemberRegistrationFormProps {
  onClose?: () => void // Made onClose prop optional for use in dedicated page
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
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    // Debug: trace submit start
    // eslint-disable-next-line no-console
    console.log("[member-registration] submit clicked", { formData })

    // Client-side validation per onboarding rules
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const requiredText = (v: string) => v && v.trim().length >= 2
    if (!requiredText(formData.fullName)) {
      setError("Full Name is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (!formData.nationalId || formData.nationalId.trim().length < 10) {
      setError("Enter a valid National ID");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (!formData.dateOfBirth) {
      setError("Date of Birth is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    // Age check: >= 18
    try {
      const dob = new Date(formData.dateOfBirth)
      const now = new Date()
      const age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
      if (age < 18) {
        setError("Member must be at least 18 years old");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return
      }
    } catch {
      setError("Enter a valid Date of Birth");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (!formData.gender) {
      setError("Gender is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (!formData.memberType) {
      setError("Member Type is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (!formData.phoneNumber) {
      setError("Phone Number is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }
    if (formData.email && !emailRe.test(formData.email)) {
      setError("Enter a valid email address");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return
    }

    // Normalize phone to +256 format if starting with 0
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

      // Debug: request payload
      // eslint-disable-next-line no-console
      console.log("[member-registration] POST /api/institution/clients", payload)
      const res = await fetch("/api/institution/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      // Debug: response
      // eslint-disable-next-line no-console
      console.log("[member-registration] response", { status: res.status, data })
      if (!res.ok) throw new Error(data.error || "Failed to create member")

      // Redirect to profile so the onboarding checklist can be completed
      router.push(`/users/${data.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Failed to create member")
      // eslint-disable-next-line no-console
      console.error("[member-registration] submit error", err)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (_field: string, _file: File | null) => {}

  const handleCancel = () => {
    if (onClose) {
      onClose()
    } else {
      router.push("/users")
    }
  }

  const clientTerminology = session?.institution?.config?.clientTerminology || "Member"
  const isMoneyLender = session?.institution?.type === "MONEY_LENDER"

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Add New {clientTerminology}</h1>
        <p className="text-gray-600">Fill in the details for the new {clientTerminology.toLowerCase()} registration.</p>
      </div>

      <form noValidate onSubmit={handleSubmit} className="space-y-8">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</div>}
        {/* Personal Information */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Personal Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Basic {clientTerminology.toLowerCase()} details and identification
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">
                Full Name
              </Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => handleInputChange("fullName", e.target.value)}
                placeholder="e.g., John Doe Mukasa"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationalId" className="text-sm font-medium text-gray-700">
                National ID Number *
              </Label>
              <Input
                id="nationalId"
                value={formData.nationalId}
                onChange={(e) => handleInputChange("nationalId", e.target.value)}
                placeholder="e.g., CM1234567890123"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
          </div>
          {/* Demographic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth" className="text-sm font-medium text-gray-700">
                Date of Birth *
              </Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-sm font-medium text-gray-700">
                Gender *
              </Label>
              <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="maritalStatus" className="text-sm font-medium text-gray-700">Marital Status</Label>
              <Select value={formData.maritalStatus} onValueChange={(value) => handleInputChange("maritalStatus", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
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
              <Label htmlFor="memberType" className="text-sm font-medium text-gray-700">
                Member Type *
              </Label>
              <Select value={formData.memberType} onValueChange={(value) => handleInputChange("memberType", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
                  <SelectValue placeholder="Select member type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Group">Group</SelectItem>
                  <SelectItem value="Corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Phone className="h-5 w-5 mr-2 text-primary" />
              Contact Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">Phone number and email address</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                placeholder="e.g., +256701234567"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="e.g., member@email.com"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Location Information */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <MapPin className="h-5 w-5 mr-2 text-primary" />
              Location Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">Residence and address details</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="district" className="text-sm font-medium text-gray-700">
                District *
              </Label>
              <Select value={formData.district} onValueChange={(value) => handleInputChange("district", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
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
              <Label htmlFor="village" className="text-sm font-medium text-gray-700">Village/Area</Label>
              <Input
                id="village"
                value={formData.village}
                onChange={(e) => handleInputChange("village", e.target.value)}
                placeholder="e.g., Nsambya Village"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Employment Information */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Briefcase className="h-5 w-5 mr-2 text-primary" />
              Employment Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">Occupation and income details</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="occupation" className="text-sm font-medium text-gray-700">Occupation</Label>
              <Select value={formData.occupation} onValueChange={(value) => handleInputChange("occupation", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
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
              <Label htmlFor="monthlyIncome" className="text-sm font-medium text-gray-700">
                Monthly Income (UGX)
              </Label>
              <Input
                id="monthlyIncome"
                type="number"
                value={formData.monthlyIncome}
                onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                placeholder="e.g., 500000"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Next of Kin Information (optional on create) */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Users className="h-5 w-5 mr-2 text-primary" />
              Next of Kin Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">Emergency contact and beneficiary details</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="nextOfKinName" className="text-sm font-medium text-gray-700">
                Full Name
              </Label>
              <Input
                id="nextOfKinName"
                value={formData.nextOfKinName}
                onChange={(e) => handleInputChange("nextOfKinName", e.target.value)}
                placeholder="e.g., Mary Nakamya"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextOfKinRelationship" className="text-sm font-medium text-gray-700">
                Relationship
              </Label>
              <Select
                value={formData.nextOfKinRelationship}
                onValueChange={(value) => handleInputChange("nextOfKinRelationship", value)}
              >
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary">
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
              <Label htmlFor="nextOfKinPhone" className="text-sm font-medium text-gray-700">
                Phone Number
              </Label>
              <Input
                id="nextOfKinPhone"
                value={formData.nextOfKinPhone}
                onChange={(e) => handleInputChange("nextOfKinPhone", e.target.value)}
                placeholder="e.g., +256701234567"
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Documents omitted at create-time; complete via onboarding checklist */}

        {/* Assignment - Only show for Money Lenders */}
        {isMoneyLender && (
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
              <h2 className="text-lg font-medium text-gray-900">Assignment</h2>
              <p className="text-sm text-gray-600 mt-1">
                Assign loan officer to this {clientTerminology.toLowerCase()}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanOfficer" className="text-sm font-medium text-gray-700">
                Loan Officer *
              </Label>
              <Select value={formData.loanOfficer} onValueChange={(value) => handleInputChange("loanOfficer", value)}>
                <SelectTrigger className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary max-w-md">
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
          </div>
        )}

        {/* Shares omitted at create-time; can be added later if enabled */}

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-transparent"
          >
            Cancel
          </Button>
          <Button type="submit" className="px-6 py-2 bg-primary text-white hover:bg-primary/90" disabled={submitting}>
            {submitting ? "Registering..." : `Register ${clientTerminology}`}
          </Button>
        </div>
      </form>
    </div>
  )
}
