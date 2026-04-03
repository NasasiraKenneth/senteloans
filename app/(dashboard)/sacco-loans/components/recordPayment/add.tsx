"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import RecordPaymentForm, { type SaccoRecordPaymentFormData } from "../forms/recordpaymentForm"

interface AddRecordPaymentProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  onSuccess?: () => void | Promise<void>
}

export default function AddRecordPayment({ isOpen, onClose, loanId, onSuccess }: AddRecordPaymentProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (data: SaccoRecordPaymentFormData) => {
    if (!loanId) return
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/sacco-loans/${loanId}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.amount, payment_date: data.payment_date }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to record payment")
      toast({ title: "Payment recorded" })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({ variant: "destructive", title: "Could not record payment", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record payment">
      <RecordPaymentForm onSubmit={handleSubmit} onCancel={onClose} loading={saving} />
    </LowModal>
  )
}
