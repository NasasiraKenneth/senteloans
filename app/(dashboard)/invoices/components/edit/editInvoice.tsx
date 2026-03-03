"use client"

import { useState, useEffect } from "react"
import { SlideModal } from "@/components/modals/SlideModal"
import InvoiceForm, { InvoiceFormData, InvoiceItemForm } from "../forms/invoiceForm"
import { useToast } from "@/components/ui/toast"

interface EditInvoiceProps {
  isOpen: boolean
  invoiceId: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditInvoice({ isOpen, invoiceId, onClose, onSuccess }: EditInvoiceProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<InvoiceFormData> | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !invoiceId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    // Inside your fetchInvoice function
    const fetchInvoice = async () => {
        setFetching(true)
        setFetchError(null)
        try {
            const res = await fetch(`/api/institution/invoices/${invoiceId}`)
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Failed to load invoice")

            const i = body.staff

            const isVatInclusive = (i.vat ?? 0) > 0

            // Map API items to InvoiceItemForm type
            const mappedItems: InvoiceItemForm[] = (i.items ?? []).map((item: any) => ({
            id: String(item.id),
            unit: item.unit ?? "",
            description: item.description ?? "",
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            totalPrice: Number(item.total_price ?? 0),
            onVat: (item.vatinclusive ?? "").toLowerCase().trim() === "yes",
            }))

            setInitialValues({
            clientId: i.client_id ?? null,
            clientName: i.client_name ?? "",
            invoiceNo: i.invoice_number ?? null,
            invoiceDate: i.invoice_date ?? "",
            dueDate: i.invoice_due ?? "",
            status: i.status ?? "draft",
            vatInclusive: isVatInclusive,
            items: mappedItems,
            subTotal: Number(i.subtotal ?? 0),
            vat: Number(i.vat ?? 0),
            totalAmount: Number(i.total_amount ?? 0),
            amountInWords: i.inwords ?? "",
            })
        } catch (e: any) {
            setFetchError(e?.message || "Failed to load invoice")
            toast({
            title: "Failed to load invoice",
            description: e?.message || "Could not fetch invoice details.",
            variant: "destructive",
            })
        } finally {
            setFetching(false)
        }
    }

    fetchInvoice()
  }, [isOpen, invoiceId])

  const handleEditInvoice = async (data: InvoiceFormData) => {
    if (!invoiceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || "Failed to update invoice")
      }
      toast({
        title: "Invoice updated",
        description: `${data.invoiceNo} ${data.clientName} invoice has been updated successfully.`,
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      toast({
        title: "Failed to update invoice",
        description: e?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setInitialValues(null)
    setFetchError(null)
    onClose()
  }

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Invoice {i.invoice_number}"
      className="z-10"
    >
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <InvoiceForm
          key={invoiceId}
          initialValues={initialValues}
          onSubmit={handleEditInvoice}
          loading={loading}
          onClose={handleClose}
          editMode
        />
      ) : fetchError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{fetchError}</p>
        </div>
      ) : null}
    </SlideModal>
  )
}
