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
          investmentName: _data.investmentName,
          investmentAddress: _data.investmentAddress,
          riskLevel: _data.riskLevel,
          expectedPercentagePerAnnum: _data.expectedPercentagePerAnnum,
          principalAmount: _data.principalAmount,
          expectedReturns: _data.expectedReturns,
          period_in_months: _data.periodUnit === "months" ? _data.periodValue : null,
          period_in_years: _data.periodUnit === "years" ? _data.periodValue : null,
          startDate: _data.startDate,
          maturityDate: _data.maturityDate,
          status: _data.status,
          description: _data.description,
          partners: (_data.partners || []).map((p) => ({
            counterpartyId: p.counterpartyId,
            role: p.role,
            status: p.status,
            contributionPercentage: p.contributionPercentage,
            contributionAmount: p.contributionAmount,
            ownershipPercentage: p.ownershipPercentage,
          })),
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
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_partners_for_partnership") {
        toast({
          variant: "warning",
          title: "Partners required",
          description: "Add at least one partner before creating a partnership investment.",
        })
        return
      }
      toast({
        variant: "destructive",
        title: "Failed to create investment",
        description: message || "Please try again.",
      })
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
