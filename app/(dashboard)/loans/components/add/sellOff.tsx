"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import SellOffForm, { SellOffFormData } from "../forms/sellOffForm"

interface SellOffProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  outstandingBalance?: number
  onSuccess?: () => void | Promise<void>
}

export default function SellOff({ isOpen, onClose, loanId, outstandingBalance = 0, onSuccess }: SellOffProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: SellOffFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/loans/${loanId}/sell-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_lender_id: data.external_lender_id, amount: data.amount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Sell off failed")

      toast({
        variant: "success",
        title: "Loan sold off",
        description: "The loan has been closed and the settlement recorded.",
      })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      toast({
        variant: "destructive",
        title: "Sell off failed",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Sell Off Loan">
      <SellOffForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
        outstandingBalance={outstandingBalance}
      />
    </ReeveModal>
  )
}
