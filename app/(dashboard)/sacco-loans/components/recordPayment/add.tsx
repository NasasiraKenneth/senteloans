"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import RecordPaymentForm, { type SaccoRecordPaymentFormData } from "../forms/recordpaymentForm"

interface AddRecordPaymentProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  initialNextPaymentDate?: string
  onSuccess?: () => void | Promise<void>
}

function mapRecordPaymentError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "loan_not_active":
      return "Payments can only be recorded on active loans."
    case "amount_exceeds_outstanding":
      return "Amount exceeds the outstanding balance."
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "bank_account_insufficient_funds":
      return "The selected bank account does not have enough funds for this payment."
    case "insufficient_cash_balance":
      return "The branch does not have enough cash float for this payment."
    case "insufficient_mobile_money_balance":
      return "The branch does not have enough mobile money float for this payment."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_amount":
      return "Enter a valid payment amount."
    case "invalid_payment_date":
    case "invalid_next_payment_date":
      return "Enter valid payment dates."
    case "invalid_mode":
    case "invalid_payment_mode":
      return "Select a valid payment mode."
    case "missing_permission:record_sacco_loan_payment":
      return "You do not have permission to record payments."
    case "repayment_transaction_create_failed":
    case "transaction_insert_failed":
      return "Could not create the repayment transaction."
    default:
      return c || "Failed to record payment"
  }
}

export default function AddRecordPayment({
  isOpen,
  onClose,
  loanId,
  initialNextPaymentDate = "",
  onSuccess,
}: AddRecordPaymentProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (data: SaccoRecordPaymentFormData) => {
    if (!loanId) return
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/sacco-loans/${loanId}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: data.amount,
          payment_date: data.payment_date,
          mode: data.mode,
          payment_mode: data.mode,
          next_payment_date: data.next_payment_date,
          reference_number: data.reference_number,
          bank_account_id: data.bank_account_id,
          transaction_charges: data.transaction_charges,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapRecordPaymentError(body?.error))
      }
      toast({ title: "Payment recorded" })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({ variant: "destructive", title: "Could not record payment", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record payment">
      <RecordPaymentForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        isOpen={isOpen}
        loading={saving}
        initialNextPaymentDate={initialNextPaymentDate}
      />
    </LowModal>
  )
}
