"use client"

import { MapPin } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { StyledInput } from "./member-edit-controls"
import type { MemberEditSectionProps } from "./member-edit-types"

export default function MemberEditLocationSection({
  formData,
  onChange,
  currency = "UGX",
}: MemberEditSectionProps) {
  return (
    <Card id="location" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Location & Occupation
        </CardTitle>
        <CardDescription>Address and employment information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="district">District</Label>
            <StyledInput
              id="district"
              value={formData.district}
              onChange={(e) => onChange("district", e.target.value)}
              placeholder="e.g., Kampala"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="village">Village / Area</Label>
            <StyledInput
              id="village"
              value={formData.village}
              onChange={(e) => onChange("village", e.target.value)}
              placeholder="e.g., Ntinda"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation</Label>
            <StyledInput
              id="occupation"
              value={formData.occupation}
              onChange={(e) => onChange("occupation", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthlyIncome">Monthly Income ({currency})</Label>
            <StyledInput
              id="monthlyIncome"
              value={formData.monthlyIncome}
              onChange={(e) => onChange("monthlyIncome", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
