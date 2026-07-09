"use client"

import { useEffect, useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import { describeExpenseCashflowApiError } from "../cashflowApiErrors"
import RecordPaymentForm, {
  type ExpenseCashflowPaymentSummary,
  type ExpenseCashflowRecordPaymentPayload,
} from "../../forms/recordpaymentForm"

export type RecordExpenseCashflowPaymentRow = ExpenseCashflowPaymentSummary

interface RecordExpenseCashflowPaymentProps {
  isOpen: boolean
  onClose: () => void
  expenseId: string
  cashflow: RecordExpenseCashflowPaymentRow | null
  onSuccess?: () => Promise<void> | void
}

export default function RecordExpenseCashflowPayment({
  isOpen,
  onClose,
  expenseId,
  cashflow,
  onSuccess,
}: RecordExpenseCashflowPaymentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    setFormKey((k) => k + 1)
  }, [isOpen, cashflow?.id, expenseId])

  const handleSubmit = async (data: ExpenseCashflowRecordPaymentPayload) => {
    if (!cashflow) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/institution/expenses/${expenseId}/cashflows/${cashflow.id}/record-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: data.amount,
            mode: data.mode,
            payment_date: data.paymentDate,
            reference_number: data.reference_number,
            bank_account_id: data.bank_account_id,
            transaction_charges: data.transaction_charges,
            description: data.description,
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(describeExpenseCashflowApiError(body))

      const tx = body.transaction as { transaction_number?: string } | undefined
      toast({
        variant: "success",
        title: "Payment recorded",
        description: tx?.transaction_number
          ? `Ledger ${tx.transaction_number} created.`
          : "Cashflow payment was saved.",
      })
      await onSuccess?.()
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

  if (!cashflow) return null

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record payment" className="w-[32rem]">
      <RecordPaymentForm
        key={formKey}
        expenseId={expenseId}
        cashflow={cashflow}
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
      />
    </LowModal>
  )
}
