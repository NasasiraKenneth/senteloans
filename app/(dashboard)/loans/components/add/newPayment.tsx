"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import RecordForm, { RecordPaymentFormData } from "../forms/recordForm"

interface NewPaymentProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  memberId: string
  currency?: string
  onSuccess: () => Promise<void> | void
}

function mapRecordPaymentError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "invalid_amount":
    case "amount_exceeds_due":
      return "Enter a valid payment amount."
    case "loan_not_eligible_for_payment":
      return "This loan is not eligible for payments yet."
    case "no_unpaid_installments":
      return "There are no unpaid installments to apply this payment to."
    case "missing_permission:record_payment":
      return "You do not have permission to record payments."
    default:
      return c || "Failed to record payment"
  }
}

export default function NewPayment({
  isOpen,
  onClose,
  loanId,
  memberId,
  currency = "UGX",
  onSuccess,
}: NewPaymentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleRecordPayment = async (data: RecordPaymentFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapRecordPaymentError(body?.code || body?.error || body?.message))
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Payment recorded" })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e?.message || "Please try again",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <RecordForm
        memberId={memberId}
        currency={currency}
        onSubmit={handleRecordPayment}
        onCancel={onClose}
        loading={loading}
      />
    </LowModal>
  )
}
