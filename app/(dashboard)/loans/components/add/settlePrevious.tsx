"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import SettlePreviousForm, { SettlePreviousFormData } from "../forms/settlePreviousForm"

interface SettlePreviousProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  memberId: string
  currency?: string
  settlementAmount?: number
  settledApplicationId?: string | null
  loanType?: string
  onSuccess?: () => void | Promise<void>
}

function mapSettlePreviousError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "insufficient_bank_balance":
    case "bank_account_insufficient_funds":
      return "Insufficient bank balance for this settlement."
    case "insufficient_cash_balance":
      return "Insufficient cash balance for this settlement."
    case "insufficient_mobile_money_balance":
      return "Insufficient mobile money balance for this settlement."
    case "settlement_already_completed":
      return "This settlement has already been completed."
    case "previous_loan_outstanding_exceeds_settlement":
      return "The previous loan outstanding now exceeds the settlement amount recorded on the new loan."
    case "previous_loan_not_fully_settled":
      return "The previous loan could not be fully settled with this amount."
    case "settlement_amount_exceeds_previous_outstanding":
      return "Settlement amount exceeds the previous loan outstanding balance."
    case "previous_loan_already_settled":
      return "The previous loan has already been settled."
    case "external_lender_not_found":
      return "The external lender for this buy-off could not be found."
    case "invalid_status_for_settle_previous":
      return "This loan is not eligible for settle-previous."
    default:
      return c || "Settle previous failed"
  }
}

export default function SettlePrevious({
  isOpen,
  onClose,
  loanId,
  memberId,
  currency = "UGX",
  settlementAmount = 0,
  settledApplicationId,
  loanType,
  onSuccess,
}: SettlePreviousProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: SettlePreviousFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/settle-previous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_date: data.payment_date,
          mode: data.mode,
          reference_number: data.reference_number,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof body?.error === "string" ? body.error : mapSettlePreviousError(body?.code)
        throw new Error(msg)
      }

      toast({
        variant: "success",
        title: "Previous loan settled",
        description:
          loanType === "top up"
            ? "Settlement disbursed and the previous loan has been paid off."
            : "Settlement amount has been disbursed from the new loan.",
      })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      toast({
        variant: "destructive",
        title: "Settle previous failed",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Settle Previous Loan">
      <SettlePreviousForm
        memberId={memberId}
        currency={currency}
        settlementAmount={settlementAmount}
        settledApplicationId={settledApplicationId}
        loanType={loanType}
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
      />
    </ReeveModal>
  )
}
