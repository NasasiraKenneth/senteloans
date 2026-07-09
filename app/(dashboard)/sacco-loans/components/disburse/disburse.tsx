"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import DisburseForm, { type DisburseFormData } from "../forms/disburseForm"

interface DisburseProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  completeDisbursementAmount?: number
  principalAmount?: number
  onSuccess?: () => void | Promise<void>
}

export default function Disburse({
  isOpen,
  onClose,
  loanId,
  completeDisbursementAmount = 0,
  principalAmount = 0,
  onSuccess,
}: DisburseProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDisburse = async (data: DisburseFormData) => {
    if (!loanId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/sacco-loans/${loanId}/disburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disbursement_type: data.disbursement_type,
          amount: data.amount,
          ...(data.disbursement_type === "partial" && data.balance !== undefined
            ? { balance: data.balance }
            : {}),
          disbursement_mode: data.disbursement_mode,
          disbursement_date: data.disbursement_date,
          reference_number: data.reference_number,
          bank_account_id: data.bank_account_id,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to disburse loan")
      }
      toast({ variant: "success", title: "Loan disbursed" })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({ variant: "destructive", title: "Disbursement failed", description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Disburse Loan">
      <DisburseForm
        onSubmit={handleDisburse}
        onCancel={onClose}
        loading={loading}
        completeDisbursementAmount={completeDisbursementAmount}
        principalAmount={principalAmount}
      />
    </LowModal>
  )
}
