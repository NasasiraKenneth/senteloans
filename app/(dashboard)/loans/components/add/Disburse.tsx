"use client"

import { useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { useToast } from "@/components/ui/toast"
import DisburseForm, { DisburseFormData } from "../forms/disburseForm"

interface DisburseProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  completeDisbursementAmount?: number
  processingFeeAmount?: number
  processingFeePercentage?: number
  loanType?: "normal" | "top up" | "buy off" | string
  settlementOutstandingBalance?: number
  onSuccess: () => Promise<void> | void
}

export default function Disburse({
  isOpen,
  onClose,
  loanId,
  completeDisbursementAmount = 0,
  processingFeeAmount = 0,
  processingFeePercentage = 0,
  loanType = "normal",
  settlementOutstandingBalance = 0,
  onSuccess,
}: DisburseProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDisburse = async (data: DisburseFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: data.disbursement_type === "partial" ? "Partially Disbursed" : "Fully Disbursed",
          disbursement_type: data.disbursement_type,
          disbursement_mode: data.disbursement_mode,
          disbursement_amount: data.disbursement_amount,
          notes: data.notes,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to disburse loan")
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Loan Disbursed" })
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
    <LowModal isOpen={isOpen} onClose={onClose} title="Disburse Loan">
      <DisburseForm
        onSubmit={handleDisburse}
        onCancel={onClose}
        loading={loading}
        completeDisbursementAmount={completeDisbursementAmount}
        processingFeeAmount={processingFeeAmount}
        processingFeePercentage={processingFeePercentage}
        loanType={loanType}
        settlementOutstandingBalance={settlementOutstandingBalance}
      />
    </LowModal>
  )
}
