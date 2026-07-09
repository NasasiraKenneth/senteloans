"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import SellOffForm, { SellOffFormData } from "../forms/sellOffForm"

interface SellOffProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  memberId: string
  currency?: string
  outstandingBalance?: number
  onSuccess?: () => void | Promise<void>
}

function mapSellOffError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "amount_below_outstanding_balance":
      return "Sell-off amount must be at least the full outstanding balance."
    case "amount_mismatch_with_outstanding_balance":
      return "Sell-off amount must equal the full outstanding balance."
    case "external_lender_not_found":
      return "The selected external lender could not be found."
    case "invalid_status_for_sell_off":
      return "This loan is not eligible for sell-off."
    case "sell_off_transaction_create_failed":
      return "Failed to create the sell-off transaction."
    default:
      return c || "Sell off failed"
  }
}

export default function SellOff({
  isOpen,
  onClose,
  loanId,
  memberId,
  currency = "UGX",
  outstandingBalance = 0,
  onSuccess,
}: SellOffProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: SellOffFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/sell-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_lender_id: data.external_lender_id,
          amount: data.amount,
          payment_date: data.payment_date,
          mode: data.mode,
          reference_number: data.reference_number,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof body?.error === "string" ? body.error : mapSellOffError(body?.code)
        throw new Error(msg)
      }

      toast({
        variant: "success",
        title: "Loan sold off",
        description: "The loan has been closed, finances settled, and the settlement recorded.",
      })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      toast({
        variant: "destructive",
        title: "Sell off failed",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Sell Off Loan">
      <SellOffForm
        memberId={memberId}
        currency={currency}
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
        outstandingBalance={outstandingBalance}
      />
    </ReeveModal>
  )
}
