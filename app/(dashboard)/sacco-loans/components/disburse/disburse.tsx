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
  processingFeeAmount?: number
  processingFeePercentage?: number
  loanType?: "normal" | "top up" | "buy off" | string
  settlementOutstandingBalance?: number
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
}: DisburseProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDisburse = async (_data: DisburseFormData) => {
    if (!loanId) return
    try {
      setLoading(true)
      // Sacco disburse API not implemented — UI only
      toast({
        title: "Disbursement not available yet",
        description: "Sacco loan disbursement is not connected to the server. No changes were saved.",
      })
      onClose()
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
