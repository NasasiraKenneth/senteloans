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
        body: JSON.stringify({
          member_id: data.targetType === "member" ? data.memberId : null,
          client_id: data.clientId,
          invoice_date: data.invoiceDate,
          invoice_due: data.dueDate,
          invoice_type: data.invoiceType,
          status: data.status,
          vat: data.vat,
          total_amount: data.totalAmount,
          inwords: data.amountInWords,
          items: data.items.map(item => ({
            unit: item.unit,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            vatinclusive: item.onVat
          }))
        }),
      })
      const body = await res.json()
      console.log("Manual Invoice from frontend:", body)
      if (!res.ok) {
        throw new Error(body.error || "Failed to create invoice")
      }
      toast({
        title: "Invoice created",
        description: `${data.customerName || "Customer"} invoice has been added successfully.`,
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
