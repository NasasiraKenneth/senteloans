"use client"

import { useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import ActivateForm, { ActivateFormData } from "../forms/activateForm"

interface ActivateInvestmentProps {
  isOpen: boolean
  onClose: () => void
  investmentId: string
  initialValues: ActivateFormData
  onSuccess: () => Promise<void> | void
}

export default function ActivateInvestment({ isOpen, onClose, investmentId, initialValues, onSuccess }: ActivateInvestmentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const formValues = useMemo(() => initialValues, [initialValues])

  const handleSubmit = async (data: ActivateFormData) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/investments/${investmentId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principal_amount: data.principalAmount,
          start_date: data.startDate,
          maturity_date: data.endDate,
          mode: data.transactionMode,
          description: data.description,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to start development")
      await onSuccess()
      toast({ variant: "success", title: "Development started" })
      onClose()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Could not start development",
        description: e?.message || "Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal title="Start Development" isOpen={isOpen} onClose={onClose}>
      <ActivateForm initialValues={formValues} onClose={onClose} onSubmit={handleSubmit} loading={loading} />
    </ReeveModal>
  )
}
