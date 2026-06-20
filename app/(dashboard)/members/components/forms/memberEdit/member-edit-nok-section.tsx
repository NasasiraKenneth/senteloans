"use client"

import { Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StyledInput, StyledSelect } from "./member-edit-controls"
import type { MemberEditSectionProps } from "./member-edit-types"

export default function MemberEditNokSection({ formData, onChange, canEdit }: MemberEditSectionProps) {
  return (
    <Card id="nok" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Emergency Contact & Notes
        </CardTitle>
        <CardDescription>Next of kin, beneficiary details, and administrative notes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="nextOfKin">Full Name</Label>
            <StyledInput
              id="nextOfKin"
              value={formData.nextOfKin}
              onChange={(e) => onChange("nextOfKin", e.target.value)}
              placeholder="e.g., Mary Nakamya"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nextOfKinRelationship">Relationship</Label>
            <StyledSelect
              value={formData.nextOfKinRelationship}
              onChange={(value) => onChange("nextOfKinRelationship", value)}
              placeholder="Select relationship"
              disabled={!canEdit}
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
            <StyledInput
              id="nextOfKinPhone"
              value={formData.nextOfKinPhone}
              onChange={(e) => onChange("nextOfKinPhone", e.target.value)}
              placeholder="e.g., +256701234567"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="Additional notes or comments..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  )
}
