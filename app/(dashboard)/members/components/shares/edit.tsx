"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import {
  isMemberWriteGateClientError,
  mapMemberWriteGateClientMessage,
} from "@/lib/members/member-status"
import EditSharesForm, {
  EditSharesPayload,
  ShareTransactionItem,
} from "../forms/editSharesForm"

export interface EditSharesModalProps {
  isOpen: boolean
  onClose: () => void
  share: ShareTransactionItem | null
  memberId: string
  currency?: string
  shareValue?: number
  currentShares?: number
  currentTotalValue?: number
  minShares?: number
  maxShares?: number
  onSuccess?: () => void
  title?: string
}

function mapError(code: unknown): string {
  const c = String(code || "")
  if (isMemberWriteGateClientError(c)) {
    return mapMemberWriteGateClientMessage(c, "editing share purchases")
  }
  if (c.startsWith("minimum_shares_")) {
    return `Minimum holding requirement is ${c.replace("minimum_shares_", "")} share(s).`
  }
  if (c.startsWith("maximum_shares_")) {
    return `Maximum holding limit is ${c.replace("maximum_shares_", "")} share(s).`
  }
  switch (c) {
    case "missing_permission:edit_shares":
      return "You do not have permission to edit share purchases."
    case "invalid_number_of_shares":
      return "Please enter a valid number of shares."
    case "invalid_mode":
      return "The selected payment mode is not supported."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_payment_date":
      return "The selected purchase date is invalid."
    case "payment_date_in_future":
      return "Purchase date cannot be in the future."
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "shares_disabled":
      return "Shares are not enabled for this branch."
    case "share_value_not_configured":
      return "Share value has not been configured for this branch."
    case "forbidden":
      return "You cannot edit shares for a member in another institution."
    case "shares_not_found":
      return "Share transaction record not found."
    default:
      return c || "Unexpected error"
  }
}

export default function EditSharesModal({
  isOpen,
  onClose,
  share,
  memberId,
  currency = "UGX",
  shareValue,
  currentShares,
  currentTotalValue,
  minShares,
  maxShares,
  onSuccess,
  title = "Edit Share Purchase",
}: EditSharesModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  if (!share) return null

  const handleSubmit = async (data: EditSharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/${data.shareId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberOfShares: data.numberOfShares,
          shareValue: data.shareValue,
          totalValue: data.totalValue,
          previousTotalValue: data.previousTotalValue,
          valueDifference: data.valueDifference,
          sharesDifference: data.sharesDifference,
          mode: data.mode,
          description: data.description || `Updated shares purchase: ${data.numberOfShares} share(s)`,
          paymentDate: data.paymentDate || undefined,
          referenceNumber: data.referenceNumber,
          transaction_charges: data.transaction_charges,
          bank_account_id: data.bank_account_id,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.code || body?.error))
      }

      toast({
        variant: "success",
        title: "Share record updated",
        description: `Successfully updated ${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"} record.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update share record",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50">
      <EditSharesForm
        share={share}
        memberId={memberId}
        currency={currency}
        shareValue={shareValue}
        currentShares={currentShares}
        currentTotalValue={currentTotalValue}
        minShares={minShares}
        maxShares={maxShares}
        onSubmit={handleSubmit}
        loading={loading}
        onCancel={onClose}
      />
    </ReeveModal>
  )
}
