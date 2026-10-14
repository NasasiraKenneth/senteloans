"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import EditMembershipFeeForm, {
  EditMembershipFeePayload,
  FeePaymentRecord,
} from "../forms/editMembershipFeeForm"
import { formatCurrency } from "@/lib/format-currency"

interface EditMembershipFeeModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  payment: FeePaymentRecord | null
  currency?: string
  totalFee?: number
  currentPaid?: number
  onSuccess?: () => void
}

function mapError(code: unknown, currency: string, remaining?: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "missing_permission:edit_membership_fee":
      return "You do not have permission to modify membership fees."
    case "amount_exceeds_remaining":
      return `Amount cannot exceed the allowable remaining fee of ${formatCurrency(Number(remaining || 0), currency)}.`
    case "invalid_amount":
      return "Please enter a valid amount."
    case "invalid_mode":
      return "Please select a valid payment mode."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_payment_date":
      return "The selected payment date is invalid."
    case "payment_date_in_future":
      return "Payment date cannot be in the future."
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "insufficient_bank_balance":
      return "Insufficient bank balance to reverse the original payment."
    case "insufficient_cash_balance":
      return "Insufficient cash in today's branch ledger to reverse the original payment."
    case "insufficient_mobile_money_balance":
      return "Insufficient mobile money float to reverse the original payment."
    case "transaction_already_cancelled":
      return "This transaction has already been cancelled."
    case "transaction_not_found":
      return "Transaction not found."
    case "branch_inactive":
      return "This member's branch is not active."
    case "member_inactive":
      return "This member is not active."
    case "cross_tenant_forbidden":
      return "You cannot edit a fee for a member in another institution."
    default:
      return c || "Unexpected error occurred"
  }
}

export default function EditMembershipFeeModal({
  isOpen,
  onClose,
  memberId,
  payment,
  currency = "UGX",
  totalFee = 0,
  currentPaid = 0,
  onSuccess,
}: EditMembershipFeeModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  if (!payment) return null

  const handleSubmit = async (data: EditMembershipFeePayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/membership-fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.error, currency, body?.remaining))
      }

      toast({
        variant: "success",
        title: "Payment updated",
        description: `Fee payment updated to ${formatCurrency(Number(data.amount), currency)} (Transaction #${body.newTransactionNumber}).`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update payment",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Fee Payment (${payment.transaction_number})`}
      className="z-50"
    >
      <EditMembershipFeeForm
        memberId={memberId}
        payment={payment}
        currency={currency}
        totalFee={totalFee}
        currentPaid={currentPaid}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </ReeveModal>
  )
}
