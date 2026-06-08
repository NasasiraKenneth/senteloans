"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import SharesForm, { SharesPayload } from "../forms/sharesForm"

interface AddSharesModalProps {
  isOpen: boolean
  onClose: () => void
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
  if (c.startsWith("minimum_shares_")) {
    return `Minimum holding is ${c.replace("minimum_shares_", "")} share(s).`
  }
  if (c.startsWith("maximum_shares_")) {
    return `Maximum holding is ${c.replace("maximum_shares_", "")} share(s).`
  }
  switch (c) {
    case "branch_inactive":
      return "This member's branch is not active. Share purchases are disabled until the branch is reactivated."
    case "branch_not_found":
      return "This member's branch could not be found."
    case "missing_permission:edit_shares":
      return "You do not have permission to record share purchases."
    case "invalid_number_of_shares":
      return "Please enter a valid number of shares."
    case "invalid_mode":
      return "The selected payment mode is not supported."
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
    case "shares_disabled":
      return "Shares are not enabled for this branch."
    case "share_value_not_configured":
      return "Share value has not been configured for this branch."
    case "member_not_found":
      return "Member not found."
    case "forbidden":
      return "You cannot record shares for a member in another institution."
    case "shares_transaction_account_missing":
      return "No suitable account found to record this share transaction."
    case "shares_transaction_failed":
      return "Failed to record the share purchase. Please try again."
    case "invoice_payments_table_missing":
      return "The invoice payments table is missing. Run scripts/31-create-invoice-payments.sql against the database."
    case "invoices_table_missing":
      return "The invoices table is missing. Run scripts/23-create-invoices.sql against the database."
    default:
      return c || "Unexpected error"
  }
}

export default function AddSharesModal({
  isOpen,
  onClose,
  memberId,
  currency = "UGX",
  shareValue,
  currentShares,
  currentTotalValue,
  minShares,
  maxShares,
  onSuccess,
  title = "Buy Shares",
}: AddSharesModalProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (data: SharesPayload) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberOfShares: data.numberOfShares,
          mode: data.mode,
          description: "Shares purchase",
          paymentDate: data.paymentDate || undefined,
          referenceNumber: data.referenceNumber,
          transaction_charges: data.transaction_charges,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapError(body?.error))
      }

      const refs = [
        body?.transaction_number ? `Txn ${body.transaction_number}` : null,
        body?.invoice_number ? `Invoice ${body.invoice_number}` : null,
      ]
        .filter(Boolean)
        .join(" • ")
      const shareLabel = `${data.numberOfShares} share${data.numberOfShares === 1 ? "" : "s"}`
      toast({
        variant: "success",
        title: "Shares purchased",
        description: refs ? `${shareLabel} recorded. ${refs}.` : `${shareLabel} recorded successfully.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to buy shares",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50">
      <SharesForm
        memberId={memberId}
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
