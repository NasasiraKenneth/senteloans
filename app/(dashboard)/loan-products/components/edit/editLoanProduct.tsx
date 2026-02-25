"use client"

import { useState, useEffect } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import LoanProductForm, { LoanProductFormData } from "../forms/LoanProductForm"
import { useToast } from "@/components/ui/toast"

interface EditLoanProductProps {
  isOpen: boolean
  productId: string | null
  onClose: () => void
  onSuccess: () => void
}

const extractShortCode = (fullCode: string): string => {
  const parts = String(fullCode || "").split("-")
  if (parts.length >= 3) return parts.slice(1, -1).join("-").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  return String(fullCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

export default function EditLoanProduct({ isOpen, productId, onClose, onSuccess }: EditLoanProductProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<LoanProductFormData> | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !productId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchProduct = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/institution/loan-products/${productId}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || "Failed to load loan product")

        const p = body.product
        setInitialValues({
          product_name: p.product_name || "",
          product_code: extractShortCode(p.product_code || ""),
          description: p.description || "",
          minimum_amount: String(p.minimum_amount || ""),
          maximum_amount: String(p.maximum_amount || ""),
          interest_rate: String(p.interest_rate || ""),
          minimum_tenure_months: String(p.minimum_tenure_months || ""),
          maximum_tenure_months: String(p.maximum_tenure_months || ""),
          interest_calculation_method: p.interest_calculation_method || "reducing_balance",
          collateral_required: p.collateral_required || false,
          guarantors_required: String(p.guarantors_required || "0"),
          processing_fee_percentage: String(p.processing_fee_percentage || "0"),
          insurance_required: p.insurance_required || false,
          status: p.status || "Active",
        })
      } catch (e: any) {
        setFetchError(e?.message || "Failed to load loan product")
        toast({
          title: "Failed to load product",
          description: e?.message || "Could not fetch product details.",
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    fetchProduct()
  }, [isOpen, productId])

  const handleUpdate = async (data: LoanProductFormData) => {
    if (!productId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/loan-products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to update loan product")

      toast({
        title: "Loan product updated",
        description: `${data.product_name} has been updated successfully.`,
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      toast({
        title: "Failed to update product",
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
    <ReeveModal isOpen={isOpen} onClose={handleClose} title="Edit Loan Product" className="z-10">
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <LoanProductForm
          key={productId}
          initialValues={initialValues}
          onSubmit={handleUpdate}
          loading={loading}
          editMode
        />
      ) : fetchError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{fetchError}</p>
        </div>
      ) : null}
    </ReeveModal>
  )
}
