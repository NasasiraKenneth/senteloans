"use client"

import { User } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { StyledInput, StyledSelect } from "./member-edit-controls"
import type { MemberEditSectionProps } from "./member-edit-types"

export default function MemberEditPersonalSection({ formData, onChange, canEdit }: MemberEditSectionProps) {
  return (
    <Card id="personal" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Personal Information
        </CardTitle>
        <CardDescription>Name, contact details, and demographic information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <StyledInput
              id="fullName"
              value={formData.fullName}
              onChange={(e) => onChange("fullName", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <StyledInput
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => onChange("email", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <StyledInput
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => onChange("phoneNumber", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <ReeveDatePicker
              value={formData.dateOfBirth}
              onChange={(value) => onChange("dateOfBirth", value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <StyledSelect
              value={formData.gender}
              onChange={(value) => onChange("gender", value)}
              placeholder="Select gender"
              disabled={!canEdit}
              options={[
                { value: "Male", label: "Male" },
                { value: "Female", label: "Female" },
                { value: "Other", label: "Other" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maritalStatus">Marital Status</Label>
            <StyledSelect
              value={formData.maritalStatus}
              onChange={(value) => onChange("maritalStatus", value)}
              placeholder="Select marital status"
              disabled={!canEdit}
              options={[
                { value: "Single", label: "Single" },
                { value: "Married", label: "Married" },
                { value: "Divorced", label: "Divorced" },
                { value: "Widowed", label: "Widowed" },
              ]}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
