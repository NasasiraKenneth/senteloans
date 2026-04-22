"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import LoanForm, { LoanFormData } from "../forms/loanForm"
import { useToast } from "@/components/ui/toast"
import { SlideModal } from "@/components/modals/SlideModal"

interface NewLoanProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function NewLoan({ isOpen, onClose, onSuccess }: NewLoanProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleCreate = async (data: LoanFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 403 && body?.error === "missing_permission:create_loan") {
        throw new Error("missing_permission:create_loan")
      }
      if (res.status === 400 && body?.error === "parallel_loans_limit_reached") {
        const max = Number(body?.maximum_parallel_loans ?? 0)
        const current = Number(body?.current_parallel_loans ?? 0)
        toast({
          variant: "warning",
          title: "Parallel loan limit reached",
          description:
            max > 0
              ? `This member already has ${current} active normal/buy off loan(s). Maximum allowed is ${max}.`
              : "This member has reached the configured parallel loan limit.",
        })
        return
      }
      if (!res.ok) throw new Error(body?.error || "Failed to create loan")

      toast({
        variant: "success",
        title: "Loan application created",
        description: body?.application_id
          ? `Application ${body.application_id} created successfully.`
          : "Loan application created successfully.",
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      if (e?.message === "missing_permission:create_loan") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to create loans.",
        })
        return
      }
      toast({
        variant: "destructive",
        title: "Failed to create loan",
        description: e?.message || "Something went wrong. Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SlideModal isOpen={isOpen} onClose={onClose} title="New Loan Application" className="z-20 ">
      <LoanForm onSubmit={handleCreate} loading={loading} />
    </SlideModal>
  )
}
