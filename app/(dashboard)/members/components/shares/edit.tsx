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
import EditBuyOffSharesForm, {
  EditBuyOffSharesPayload,
} from "../forms/editBuyOffSharesForm"
import EditTransferSharesForm, {
  EditTransferSharesPayload,
} from "../forms/editTransferSharesForm"

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
  title,
}: EditSharesModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  if (!share) return null

  const acqType = String(share.acquisition_type || "purchase").toLowerCase().trim()

  const isTransfer =
    acqType === "transfer" ||
    acqType === "transfer_in" ||
    acqType === "transfer_out"

  const isBuyOff =
    acqType === "sell" ||
    acqType === "buy" ||
    acqType === "buy_out" ||
    acqType === "buy_off" ||
    acqType === "redemption"

  // Derive dynamic modal title if not explicitly provided
  const computedTitle =
    title ||
    (isTransfer
      ? acqType === "transfer_in" || share.transfer_type === "from"
        ? "Edit Share Transfer In"
        : "Edit Share Transfer Out"
      : isBuyOff
        ? acqType === "sell" || share.transfer_type === "to"
          ? "Edit Shares Sold (Buy-Out)"
          : "Edit Shares Purchased (Buy-Off)"
        : "Edit Share Purchase")

  // 1. Regular share purchase edit handler
  const handlePurchaseSubmit = async (data: EditSharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/${data.shareId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "purchase",
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
        title: "Share purchase updated",
        description: `Successfully updated ${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"} purchase record.`,
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

  // 2. Share transfer edit handler
  const handleTransferSubmit = async (data: EditTransferSharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/${data.shareId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "transfer",
          numberOfShares: data.numberOfShares,
          shareValue: data.shareValue,
          totalValue: data.totalValue,
          previousTotalValue: data.previousTotalValue,
          valueDifference: data.valueDifference,
          sharesDifference: data.sharesDifference,
          transferType: data.transferType,
          transferMemberId: data.transferMemberId,
          date: data.date,
          referenceNumber: data.referenceNumber,
          description: data.description,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.code || body?.error))
      }

      toast({
        variant: "success",
        title: "Share transfer updated",
        description: `Successfully updated transfer of ${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"}.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update transfer record",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  // 3. Share buy-off / sell-out edit handler
  const handleBuyOffSubmit = async (data: EditBuyOffSharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/${data.shareId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "buy_off",
          actionRole: data.actionRole,
          numberOfShares: data.numberOfShares,
          shareValue: data.shareValue,
          totalValue: data.totalValue,
          previousTotalValue: data.previousTotalValue,
          valueDifference: data.valueDifference,
          sharesDifference: data.sharesDifference,
          counterpartyMemberId: data.counterpartyMemberId,
          mode: data.mode,
          paymentDate: data.paymentDate,
          referenceNumber: data.referenceNumber,
          description: data.description,
          transaction_charges: data.transaction_charges,
          bank_account_id: data.bank_account_id,
          savings_account_id: data.savings_account_id,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.code || body?.error))
      }

      toast({
        variant: "success",
        title: "Share buy-off updated",
        description: `Successfully updated buy-off of ${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"}.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update buy-off record",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={computedTitle} className="z-50">
      {isTransfer ? (
        <EditTransferSharesForm
          share={share}
          memberId={memberId}
          currency={currency}
          shareValue={shareValue}
          currentShares={currentShares}
          currentTotalValue={currentTotalValue}
          minShares={minShares}
          maxShares={maxShares}
          onSubmit={handleTransferSubmit}
          loading={loading}
          onCancel={onClose}
        />
      ) : isBuyOff ? (
        <EditBuyOffSharesForm
          share={share}
          memberId={memberId}
          currency={currency}
          shareValue={shareValue}
          currentShares={currentShares}
          currentTotalValue={currentTotalValue}
          minShares={minShares}
          maxShares={maxShares}
          onSubmit={handleBuyOffSubmit}
          loading={loading}
          onCancel={onClose}
        />
      ) : (
        <EditSharesForm
          share={share}
          memberId={memberId}
          currency={currency}
          shareValue={shareValue}
          currentShares={currentShares}
          currentTotalValue={currentTotalValue}
          minShares={minShares}
          maxShares={maxShares}
          onSubmit={handlePurchaseSubmit}
          loading={loading}
          onCancel={onClose}
        />
      )}
    </ReeveModal>
  )
}
