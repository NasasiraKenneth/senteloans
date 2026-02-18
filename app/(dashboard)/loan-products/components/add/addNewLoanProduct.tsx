"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import LoanProductForm, { LoanProductFormData } from "../forms/LoanProductForm"
import { useToast } from "@/components/ui/toast"

interface AddNewLoanProductProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewLoanProduct({ isOpen, onClose, onSuccess }: AddNewLoanProductProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreate = async (data: LoanProductFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/loan-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to create loan product")

      toast({
        title: "Loan product created",
        description: `${data.product_name} has been added successfully.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({
        title: "Failed to create product",
        description: e?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add New Loan Product" className="z-10">
      <LoanProductForm onSubmit={handleCreate} loading={loading} />
    </ReeveModal>
  )
}
