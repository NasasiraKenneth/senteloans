"use client"

import { CreditCard, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { StyledInput, StyledSelect } from "./member-edit-controls"
import type { MemberEditSectionProps } from "./member-edit-types"

export default function MemberEditPayoutSection({ formData, onChange, canEdit }: MemberEditSectionProps) {
  return (
    <Card id="payout" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Linked Payout Accounts
        </CardTitle>
        <CardDescription>Configure payout accounts for loan disbursements and repayment collections.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Mobile Money Account</h4>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mobileMoneyProvider">Mobile Money Provider</Label>
              <StyledSelect
                value={formData.mobileMoneyProvider}
                onChange={(value) => onChange("mobileMoneyProvider", value)}
                placeholder="Select provider"
                disabled={!canEdit}
                options={[
                  { value: "MTN Mobile Money", label: "MTN Mobile Money" },
                  { value: "Airtel Money", label: "Airtel Money" },
                  { value: "M-Sente", label: "M-Sente" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobileMoneyNumber">Mobile Money Number</Label>
              <StyledInput
                id="mobileMoneyNumber"
                value={formData.mobileMoneyNumber}
                onChange={(e) => onChange("mobileMoneyNumber", e.target.value)}
                placeholder="e.g., +256701234567"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Bank Account Details</h4>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <StyledSelect
                value={formData.bankName}
                onChange={(value) => onChange("bankName", value)}
                placeholder="Select bank"
                disabled={!canEdit}
                options={[
                  { value: "Stanbic Bank", label: "Stanbic Bank" },
                  { value: "Centenary Bank", label: "Centenary Bank" },
                  { value: "DFCU Bank", label: "DFCU Bank" },
                  { value: "Equity Bank", label: "Equity Bank" },
                  { value: "Bank of Africa", label: "Bank of Africa" },
                  { value: "PostBank Uganda", label: "PostBank Uganda" },
                  { value: "Other", label: "Other" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">Account Number</Label>
              <StyledInput
                id="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={(e) => onChange("bankAccountNumber", e.target.value)}
                placeholder="e.g., 9030012345678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountName">Account Name</Label>
              <StyledInput
                id="bankAccountName"
                value={formData.bankAccountName}
                onChange={(e) => onChange("bankAccountName", e.target.value)}
                placeholder="Account holder name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankBranch">Branch</Label>
              <StyledInput
                id="bankBranch"
                value={formData.bankBranch}
                onChange={(e) => onChange("bankBranch", e.target.value)}
                placeholder="e.g., Kampala Main Branch"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
