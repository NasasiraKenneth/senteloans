"use client"

import { useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import ActivateForm, { ActivateFormData } from "../forms/activateForm"

interface ActivateInvestmentProps {
  isOpen: boolean
  onClose: () => void
  investmentId: string
  initialValues: ActivateFormData
  onSuccess: () => Promise<void> | void
}

function mapActivateError(body: Record<string, unknown>): string {
  const code = String(body.code ?? body.error ?? "")
  switch (code) {
    case "investment_must_be_approved_first":
      return "Only approved investments can start development."
    case "principal_must_match_initial_amount":
      return "Principal amount does not match the investment initial amount."
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "bank_account_insufficient_funds":
      return "The selected bank account does not have enough funds."
    case "insufficient_cash_balance":
      return "The branch does not have enough cash float for this deposit."
    case "insufficient_mobile_money_balance":
      return "The branch does not have enough mobile money float for this deposit."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_payment_mode":
    case "invalid_mode":
      return "Select a valid payment mode."
    case "maturity_before_start":
      return "End date cannot be before the start date."
    case "missing_permission:edit_investment_status":
      return "You do not have permission to start development."
    case "super_admin_write_blocked":
      return "Super admins cannot modify data."
    case "transaction_number_generation_failed":
      return "Could not create the deposit transaction."
    default:
      return String(body.error || body.message || code || "Failed to start development")
  }
}

export default function ActivateInvestment({ isOpen, onClose, investmentId, initialValues, onSuccess }: ActivateInvestmentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const formValues = useMemo(() => initialValues, [initialValues])

  const handleSubmit = async (data: ActivateFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/investments/${investmentId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principal_amount: data.principalAmount,
          start_date: data.startDate,
          maturity_date: data.endDate,
          mode: data.transactionMode,
          bank_account_id: data.bankAccountId,
          reference_number: data.referenceNumber,
          description: data.description,
          transaction_charges: data.transactionCharges,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapActivateError(body as Record<string, unknown>))
      await onSuccess()
      toast({ variant: "success", title: "Development started" })
      onClose()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Could not start development",
        description: e?.message || "Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal title="Start Development" isOpen={isOpen} onClose={onClose}>
      <ActivateForm initialValues={formValues} onClose={onClose} onSubmit={handleSubmit} loading={loading} />
    </ReeveModal>
  )
}
