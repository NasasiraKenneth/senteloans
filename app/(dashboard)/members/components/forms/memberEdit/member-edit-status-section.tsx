"use client"

import { Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { StyledSelect } from "./member-edit-controls"
import type { MemberEditSectionProps } from "./member-edit-types"

export default function MemberEditStatusSection({ formData, onChange, canEdit }: MemberEditSectionProps) {
  return (
    <Card id="status" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Status & Management
        </CardTitle>
        <CardDescription>Account status and membership dates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status">Account Status</Label>
            <StyledSelect
              value={formData.status}
              onChange={(value) => onChange("status", value)}
              placeholder="Select status"
              disabled={!canEdit}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
                { value: "Suspended", label: "Suspended" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="joinDate">Join Date</Label>
            <ReeveDatePicker
              value={formData.joinDate}
              onChange={(value) => onChange("joinDate", value)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
