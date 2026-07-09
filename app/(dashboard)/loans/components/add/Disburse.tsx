"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import DisburseForm, { DisburseFormData } from "../forms/disburseForm"

interface DisburseProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  memberId: string
  currency?: string
  completeDisbursementAmount?: number
  processingFeeAmount?: number
  processingFeePercentage?: number
  loanType?: "normal" | "top up" | "buy off" | string
  settlementOutstandingBalance?: number
  onSuccess: () => Promise<void> | void
}

function mapDisburseError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "bank_account_insufficient_funds":
      return "The selected bank account does not have enough funds for this disbursement."
    case "insufficient_cash_balance":
      return "Branch cash balance is insufficient for this disbursement."
    case "insufficient_mobile_money_balance":
      return "Branch mobile money balance is insufficient for this disbursement."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_disbursement_amount":
      return "Enter a valid disbursement amount."
    case "partial_amount_must_be_less_than_remaining_disbursable":
      return "Partial amount must be less than the remaining disbursable balance."
    case "no_remaining_disbursement_balance":
      return "There is no remaining balance to disburse."
    case "settlement_not_completed":
      return "Complete settle-previous before disbursing the member portion."
    case "settlement_not_found":
      return "No settlement record was found for this loan."
    case "disbursement_not_supported_for_loan_type_yet":
      return "Disbursement is not supported for this loan type yet."
    default:
      return c || "Failed to disburse loan"
  }
}

export default function Disburse({
  isOpen,
  onClose,
  loanId,
  memberId,
  currency = "UGX",
  completeDisbursementAmount = 0,
  processingFeeAmount = 0,
  processingFeePercentage = 0,
  loanType = "normal",
  settlementOutstandingBalance = 0,
  onSuccess,
}: DisburseProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDisburse = async (data: DisburseFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/disburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disbursement_type: data.disbursement_type,
          disbursement_mode: data.disbursement_mode,
          disbursement_amount: data.disbursement_amount,
          notes: data.notes,
          reference_number: data.reference_number,
          transaction_charges: data.transaction_charges,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapDisburseError(body?.code || body?.error))
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Loan Disbursed" })
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: (e as Error)?.message || "Please try again",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Disburse Loan">
      <DisburseForm
        memberId={memberId}
        currency={currency}
        onSubmit={handleDisburse}
        onCancel={onClose}
        loading={loading}
        completeDisbursementAmount={completeDisbursementAmount}
        processingFeeAmount={processingFeeAmount}
        processingFeePercentage={processingFeePercentage}
        loanType={loanType}
        settlementOutstandingBalance={settlementOutstandingBalance}
      />
    </LowModal>
  )
}
