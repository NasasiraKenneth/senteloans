"use client"

import { useState } from "react"
import { SlideModal } from "@/components/modals/SlideModal"
import InvoiceForm, { InvoiceFormData } from "../forms/invoiceForm"
import { useToast } from "@/components/ui/toast"

interface AddNewInvoiceProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewInvoice({ isOpen, onClose, onSuccess }: AddNewInvoiceProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreateInvoice = async (data: InvoiceFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || "Failed to create invoice")
      }
      toast({
        title: "Staff member created",
        description: `${data.clientName} invoice has been added successfully.`,
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      toast({
        title: "Failed to create invoice",
        description: e?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Invoice"
      className="z-10"
    >
      <InvoiceForm
        onSubmit={handleCreateInvoice}
        loading={loading}
        onClose={handleClose}
      />
    </SlideModal>
  )
}
