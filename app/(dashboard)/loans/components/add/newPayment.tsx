"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import RecordForm, { RecordPaymentFormData } from "../forms/recordForm"

interface NewPaymentProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  onSuccess: () => Promise<void> | void
}

export default function NewPayment({ isOpen, onClose, loanId, onSuccess }: NewPaymentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleRecordPayment = async (data: RecordPaymentFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || body?.error || "Failed to record payment")
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Payment recorded" })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e?.message || "Please try again",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <RecordForm onSubmit={handleRecordPayment} onCancel={onClose} loading={loading} />
    </LowModal>
  )
}
