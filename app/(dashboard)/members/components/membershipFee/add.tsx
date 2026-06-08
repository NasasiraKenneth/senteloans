"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import MembershipFeeForm, { MembershipFeePayload } from "../forms/membershipFeeForm"
import { formatCurrency } from "@/lib/format-currency"

interface AddMembershipFeeModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  currency?: string
  onSuccess?: () => void
  title?: string
}

function mapError(code: unknown, currency: string, remaining?: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "missing_permission:edit_membership_fee":
      return "You do not have permission to record membership fees."
    case "amount_exceeds_remaining":
      return `Amount cannot exceed the remaining fee of ${formatCurrency(Number(remaining || 0), currency)}.`
    case "invalid_amount":
      return "Please enter a valid amount."
    case "invalid_mode":
      return "Please select a valid payment mode."
    case "invalid_payment_date":
      return "The selected payment date is invalid."
    case "payment_date_in_future":
      return "Payment date cannot be in the future."
    case "member_not_found":
      return "Member not found."
    case "cross_tenant_forbidden":
      return "You cannot record a fee for a member in another institution."
    default:
      return c || "Unexpected error"
  }
}

export default function AddMembershipFeeModal({
  isOpen,
  onClose,
  memberId,
  currency = "UGX",
  onSuccess,
  title = "Record Membership Fee",
}: AddMembershipFeeModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (data: MembershipFeePayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/membership-fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: data.amount,
          mode: data.mode,
          description: "Membership fee payment",
          paymentDate: data.paymentDate || undefined,
          reference_number: data.reference_number,
          transaction_charges: data.transaction_charges,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.error, currency, body?.remaining))
      }

      toast({
        variant: "success",
        title: "Membership fee recorded",
        description: `${formatCurrency(Number(data.amount), currency)} paid${
          body?.invoice?.status === "paid" ? " — invoice fully settled." : "."
        }`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to record fee",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50">
      <MembershipFeeForm memberId={memberId} currency={currency} onSubmit={handleSubmit} loading={loading} />
    </ReeveModal>
  )
}
