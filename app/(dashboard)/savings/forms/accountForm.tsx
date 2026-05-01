"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"

export type SavingsAccountFormValues = {
  status: string
  account_type: string
}

type SavingsAccountFormProps = {
  initialValues?: Partial<SavingsAccountFormValues>
  loading?: boolean
  submitLabel?: string
  onSubmit: (values: SavingsAccountFormValues) => Promise<void> | void
  onCancel: () => void
}

const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Suspended", label: "Suspended" },
  { value: "Closed", label: "Closed" },
]

const ACCOUNT_TYPE_OPTIONS = [
  { value: "Voluntary", label: "Voluntary" },
  { value: "Fixed", label: "Fixed" },
  { value: "Shares", label: "Shares" },
  { value: "Current", label: "Current" },
]

export default function AccountForm({
  initialValues,
  loading = false,
  submitLabel = "Save Changes",
  onSubmit,
  onCancel,
}: SavingsAccountFormProps) {
  const [status, setStatus] = useState(String(initialValues?.status || ""))
  const [accountType, setAccountType] = useState(String(initialValues?.account_type || ""))
  const isValid = useMemo(() => Boolean(status && accountType), [status, accountType])

  const handleSubmit = async () => {
    if (!isValid) return
    await onSubmit({
      status,
      account_type: accountType,
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <StyledSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          placeholder="Select status"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Account type</Label>
        <StyledSelect
          value={accountType}
          onChange={setAccountType}
          options={ACCOUNT_TYPE_OPTIONS}
          placeholder="Select account type"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading || !isValid}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  )
}
