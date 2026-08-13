"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import {
  isMemberWriteGateClientError,
  mapMemberWriteGateClientMessage,
} from "@/lib/members/member-status"
import MoveSharesForm, { MoveSharesPayload } from "../forms/moveSharesForm"

interface MoveSharesModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  memberFullName?: string
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
    return mapMemberWriteGateClientMessage(c, "transferring or buying out shares")
  }
  if (c.startsWith("minimum_shares_")) {
    return `Minimum holding is ${c.replace("minimum_shares_", "")} share(s).`
  }
  if (c.startsWith("maximum_shares_")) {
    return `Maximum holding is ${c.replace("maximum_shares_", "")} share(s).`
  }
  switch (c) {
    case "missing_permission:edit_shares":
      return "You do not have permission to transfer or buy out shares."
    case "insufficient_shares":
      return "Member has insufficient shares for this operation."
    case "invalid_number_of_shares":
      return "Please enter a valid number of shares."
    case "same_member_transfer":
      return "Cannot transfer shares to the same member."
    case "target_member_not_found":
      return "Destination member could not be found."
    case "target_member_inactive":
      return "Destination member must be active to receive shares."
    case "invalid_mode":
      return "The selected payment mode is not supported."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "invalid_date":
      return "The selected date is invalid."
    case "date_in_future":
      return "Date cannot be in the future."
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
      return "You cannot move shares for a member in another institution."
    case "shares_transaction_failed":
      return "Failed to process share movement. Please try again."
    default:
      return c || "Unexpected error"
  }
}

export default function MoveSharesModal({
  isOpen,
  onClose,
  memberId,
  memberFullName,
  currency = "UGX",
  shareValue,
  currentShares,
  currentTotalValue,
  minShares,
  maxShares,
  onSuccess,
  title = "Transfer or Buy Out Shares",
}: MoveSharesModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (data: MoveSharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: data.actionType,
          numberOfShares: data.numberOfShares,
          transferMemberId: data.transferMemberId,
          buyingMemberId: data.buyingMemberId,
          sellingMemberAccountId: data.sellingMemberAccountId || data.seller_account_id,
          seller_account_id: data.seller_account_id || data.sellingMemberAccountId,
          mode: data.mode,
          date: data.date,
          referenceNumber: data.referenceNumber,
          bank_account_id: data.bank_account_id,
          savings_account_id: data.savings_account_id,
          description: data.description,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.code || body?.error))
      }

      const isTransfer = data.actionType === "transfer"
      const shareCount = `${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"}`

      toast({
        variant: "success",
        title: isTransfer ? "Shares transferred successfully" : "Shares bought out successfully",
        description: isTransfer
          ? `${shareCount} transferred to recipient member.`
          : `${shareCount} liquidated / bought out successfully.`,
      })

      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to process share movement",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50 max-w-xl">
      <MoveSharesForm
        memberId={memberId}
        memberFullName={memberFullName}
        currency={currency}
        shareValue={shareValue}
        currentShares={currentShares}
        currentTotalValue={currentTotalValue}
        minShares={minShares}
        maxShares={maxShares}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </ReeveModal>
  )
}
