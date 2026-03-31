"use client"

import { useState } from "react"
import { SlideModal } from "@/components/modals/SlideModal"
import { useToast } from "@/components/ui/toast"
import NewInvestmentForm, { NewInvestmentFormData } from "../forms/new"

interface AddNewInvestmentProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewInvestment({ isOpen, onClose, onSuccess }: AddNewInvestmentProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreate = async (_data: NewInvestmentFormData) => {
    try {
      setLoading(true)
      const res = await fetch("/api/institution/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: _data.clientId || null, // provider_id in DB (kept form field name for now)
          investmentType: _data.investmentType,
          riskLevel: _data.riskLevel,
          expectedPercentagePerAnnum: _data.expectedPercentagePerAnnum,
          principalAmount: _data.principalAmount,
          expectedReturns: _data.expectedReturns,
          startDate: _data.startDate,
          maturityDate: _data.maturityDate,
          status: _data.status,
          description: _data.description,
          funding: (_data.funding || []).map((f) => ({
            type: f.type,
            amount: f.amount,
            loanId: f.loanId,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create investment")
      toast({ variant: "success", title: "Investment created" })
      onSuccess()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <SlideModal isOpen={isOpen} onClose={onClose} title="New Investment" className="z-20">
      <NewInvestmentForm onSubmit={handleCreate} onClose={onClose} loading={loading} />
    </SlideModal>
  )
}
