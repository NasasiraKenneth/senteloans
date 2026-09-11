"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import NewSavingsAccountForm, { NewSavingsAccountFormData } from "../forms/new"

interface NewSavingsAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void | Promise<void>
}

function mapCreateAccountError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "member_not_found":
      return "The selected member could not be found."
    case "member_inactive":
      return "The selected member is inactive."
    case "invalid_account_type":
      return "Please select a valid account type."
    case "monthly_savings_required_for_fixed_account":
      return "Monthly savings amount is required for Fixed accounts."
    case "invalid_monthly_savings":
      return "Enter a valid monthly savings amount."
    case "duplicate_savings_account_number":
      return "Could not generate a unique account number. Please try again."
    case "missing_permission:add_account":
      return "You do not have permission to create savings accounts."
    default:
      return c || "Failed to create savings account"
  }
}

export default function NewSavingsAccountModal({
  isOpen,
  onClose,
  onSuccess,
}: NewSavingsAccountModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: NewSavingsAccountFormData) => {
    try {
      setLoading(true)
      const res = await fetch("/api/institution/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: data.member_id,
          account_type: data.account_type,
          ...(typeof data.monthly_savings === "number" ? { monthly_savings: data.monthly_savings } : {}),
          ...(typeof data.auto_savings_day !== "undefined" ? { auto_savings_day: data.auto_savings_day } : {}),
          ...(typeof data.start_date !== "undefined" ? { start_date: data.start_date } : {}),
          ...(typeof data.next_billing_date !== "undefined" ? { next_billing_date: data.next_billing_date } : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = typeof body?.error === "string" ? body.error : ""
        const msg = mapCreateAccountError(code) || code || "Failed to create savings account"
        throw new Error(msg)
      }

      const accountNumber = String(body?.account?.account_number || "")
      toast({
        variant: "success",
        title: "Savings account created",
        description: accountNumber ? `Account ${accountNumber} has been opened.` : "The account has been opened.",
      })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      toast({
        variant: "destructive",
        title: "Could not create account",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="New Savings Account">
      <NewSavingsAccountForm onSubmit={handleSubmit} onCancel={onClose} loading={loading} />
    </ReeveModal>
  )
}
