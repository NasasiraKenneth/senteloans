"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import { AlertCircle, AlertTriangle } from "lucide-react"
import { formatCurrency } from "@/lib/format-currency"
import type { FeePaymentRecord } from "../forms/editMembershipFeeForm"

interface CancelMembershipFeeModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  payment: FeePaymentRecord | null
  currency?: string
  onSuccess?: () => void
}

function mapError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "missing_permission:edit_membership_fee":
      return "You do not have permission to cancel membership fee payments."
    case "insufficient_bank_balance":
      return "Insufficient bank balance to reverse this payment."
    case "insufficient_cash_balance":
      return "Insufficient cash in today's branch ledger to reverse this payment."
    case "insufficient_mobile_money_balance":
      return "Insufficient mobile money float to reverse this payment."
    case "transaction_already_cancelled":
      return "This transaction has already been cancelled."
    case "transaction_not_found":
      return "Transaction not found."
    case "branch_inactive":
      return "This member's branch is not active."
    case "member_not_found":
      return "Member not found."
    case "cross_tenant_forbidden":
      return "You cannot cancel a payment for a member in another institution."
    default:
      return c || "Unexpected error occurred"
  }
}

export default function CancelMembershipFeeModal({
  isOpen,
  onClose,
  memberId,
  payment,
  currency = "UGX",
  onSuccess,
}: CancelMembershipFeeModalProps) {
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  if (!payment) return null

  const handleConfirmCancel = async () => {
    setError(null)
    if (!payment.transaction_id) {
      setError("This payment cannot be cancelled because it has no transaction ID.")
      return
    }
    if (!reason.trim()) {
      setError("Please provide a reason for cancelling this payment.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/membership-fee`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: payment.transaction_id,
          reason: reason.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.error))
      }

      toast({
        variant: "success",
        title: "Payment cancelled",
        description: `Transaction ${payment.transaction_number} of ${formatCurrency(Number(payment.amount), currency)} has been cancelled.`,
      })
      setReason("")
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || "Unexpected error")
      setError(msg)
      toast({
        variant: "destructive",
        title: "Failed to cancel payment",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel Fee Payment"
      className="z-50"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1 text-sm text-red-900">
            <p className="font-semibold text-red-950">
              Are you sure you want to cancel this payment?
            </p>
            <p className="text-xs text-red-800">
              Transaction <strong>{payment.transaction_number}</strong> for{" "}
              <strong>{formatCurrency(Number(payment.amount), currency)}</strong> will be marked as Cancelled.
              The branch float will be debited via financial outflow, and the member&apos;s unpaid membership fee balance will be restored.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Reason for Cancellation <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Payment recorded in error / refund requested"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-[1.5px] focus:ring-red-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">This reason will be recorded in the audit trail.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Payment
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={loading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Cancelling…" : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </ReeveModal>
  )
}
