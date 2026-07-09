"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import InvoicePaymentForm, {
  type InvoicePaymentPayload,
  type InvoicePaymentSummary,
} from "../forms/paymentForm"

interface RecordInvoicePaymentModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: InvoicePaymentSummary | null
  onSuccess?: () => void
}

function mapPaymentError(error: string, body: Record<string, unknown>): string {
  switch (error) {
    case "missing_permission:edit_invoice":
      return "You do not have permission to record invoice payments."
    case "invoice_not_found":
      return "Invoice not found."
    case "invoice_fully_paid":
      return "This invoice is already fully paid."
    case "invoice_not_payable":
      return "Payments cannot be recorded for this invoice status."
    case "amount_exceeds_outstanding":
      return typeof body.outstanding === "number"
        ? `Amount exceeds outstanding balance of ${body.outstanding}.`
        : "Amount exceeds the outstanding balance."
    case "reference_number_required":
      return "Reference number is required for this payment mode."
    case "bank_account_required":
    case "bank_account_not_found":
      return "Please select a valid branch bank account."
    case "invalid_amount":
      return "Please enter a valid payment amount."
    case "invalid_mode":
      return "Please select a valid payment mode."
    case "invalid_payment_date":
    case "payment_date_in_future":
      return "Please select a valid payment date."
    case "member_inactive":
      return "The member account is inactive."
    default:
      return typeof body.message === "string"
        ? body.message
        : error || "Failed to record payment"
  }
}

export default function RecordInvoicePaymentModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: RecordInvoicePaymentModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: InvoicePaymentPayload) => {
    if (!invoice) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/institution/invoices/${invoice.id}/record-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: data.amount,
            mode: data.mode,
            payment_date: data.paymentDate,
            reference_number: data.reference_number,
            bank_account_id: data.bank_account_id,
            description: data.description,
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const errorCode = String(body.error || "")
        throw new Error(mapPaymentError(errorCode, body))
      }

      toast({
        variant: "success",
        title: "Payment recorded",
        description: `Payment applied to invoice ${invoice.invoice_number}.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to record payment",
        description: e instanceof Error ? e.message : "Something went wrong.",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!invoice) return null

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Record payment"
      className="z-50 w-[32rem]"
    >
      <InvoicePaymentForm
        invoice={invoice}
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
      />
    </ReeveModal>
  )
}
