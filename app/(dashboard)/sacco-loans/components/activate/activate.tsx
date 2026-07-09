"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import ActivateForm, { type ActivateFormData } from "../forms/activateForm"

interface ActivateProps {
  isOpen: boolean
  onClose: () => void
  loanId: string
  remainingTenureMonths: number
  initialNextPaymentDate?: string
  initialMonthlyPayment?: number
  onSuccess?: () => void | Promise<void>
}

export default function Activate({
  isOpen,
  onClose,
  loanId,
  remainingTenureMonths,
  initialNextPaymentDate = "",
  initialMonthlyPayment = 0,
  onSuccess,
}: ActivateProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (data: ActivateFormData) => {
    if (!loanId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/sacco-loans/${loanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Active",
          next_payment_date: data.next_payment_date,
          maturity_date: data.maturity_date,
          monthly_payment: data.monthly_payment,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to activate loan")
      }
      toast({ title: "Loan activated" })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({ variant: "destructive", title: "Could not activate loan", description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Activate loan" className="z-20">
      <ActivateForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
        remainingTenureMonths={remainingTenureMonths}
        initialNextPaymentDate={initialNextPaymentDate}
        initialMonthlyPayment={initialMonthlyPayment}
      />
    </ReeveModal>
  )
}
