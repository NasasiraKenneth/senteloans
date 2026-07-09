"use client"

import { useEffect, useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import FlowForm, { allowsTransactionCharges, emptyFlowForm, FlowFormData, validateFlowForm } from "../forms/flowForm"

interface RecordCashflowProps {
  isOpen: boolean
  onClose: () => void
  investmentId: string
  onSuccess: () => Promise<void> | void
}

function mapCashflowError(code: string): string {
  switch (code) {
    case "reference_number_required":
      return "A reference number is required for this payment mode."
    case "bank_account_required":
      return "Please select a bank account for this payment mode."
    case "bank_account_not_found":
      return "The selected bank account could not be found for this branch."
    case "bank_account_insufficient_funds":
      return "The selected bank account does not have enough funds."
    case "insufficient_cash_balance":
      return "The branch does not have enough cash float for this payment."
    case "insufficient_mobile_money_balance":
      return "The branch does not have enough mobile money float for this payment."
    case "invalid_transaction_charges":
      return "Transaction charges must be a valid, non-negative amount."
    case "transaction_charges_not_allowed":
    case "transaction_charges_not_allowed_for_income":
      return "Transaction charges are not allowed for this cashflow type."
    case "invalid_mode":
    case "invalid_payment_mode":
      return "Select a valid payment mode."
    case "mode_required":
      return "Select a transaction mode."
    case "investment_not_in_operation":
      return "Cashflows can only be recorded against active or under-development investments."
    case "negative_closing_value":
      return "This cashflow would reduce the investment value below zero."
    default:
      return code || "Failed to record cashflow"
  }
}

export default function RecordCashflow({ isOpen, onClose, investmentId, onSuccess }: RecordCashflowProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<FlowFormData>(emptyFlowForm())
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [previousAdjustmentValue, setPreviousAdjustmentValue] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyFlowForm())
    setFieldErrors({})
    void (async () => {
      try {
        const res = await fetch(`/api/institution/investments/${investmentId}/cashflows`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        setPreviousAdjustmentValue(Number(body?.meta?.previous_adjustment_value ?? 0))
      } catch {
        setPreviousAdjustmentValue(0)
      }
    })()
  }, [isOpen, investmentId])

  const patchForm = (patch: Partial<FlowFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setFieldErrors({})
  }

  const handleSubmit = async () => {
    const v = validateFlowForm(form)
    if (Object.keys(v).length > 0) {
      setFieldErrors(v)
      return
    }

    const isAdjustment = form.category === "adjustment"
    const isCash = form.transactionMode === "Cash"
    const charges = Number(form.transactionCharges || 0)
    const canCharge = allowsTransactionCharges(form.type, form.category)

    try {
      setSaving(true)
      const res = await fetch(`/api/institution/investments/${investmentId}/cashflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          category: form.category,
          amount: Number(form.amount || 0),
          current_value: Number(form.currentValue || 0),
          description: form.description.trim() || null,
          date: form.date,
          mode: isAdjustment ? null : form.transactionMode,
          bank_account_id: !isAdjustment && form.bankAccountId ? form.bankAccountId : undefined,
          reference_number: !isAdjustment && !isCash ? form.referenceNumber.trim() : undefined,
          transaction_charges:
            !isAdjustment && !isCash && canCharge && charges > 0 ? charges : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapCashflowError(String(body?.error || "")))
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Cashflow recorded" })
    } catch (e: any) {
      const message = mapCashflowError(String(e?.message || ""))
      toast({
        variant: "destructive",
        title: "Failed to record cashflow",
        description: message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record Cashflow">
      <div className="p-4 space-y-4 max-h-[min(70vh,28rem)] overflow-y-auto">
        <FlowForm
          value={form}
          onChange={patchForm}
          disabled={saving}
          errors={fieldErrors}
          showReferenceIds={false}
          previousAdjustmentValue={previousAdjustmentValue}
        />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Record Cashflow"}
          </Button>
        </div>
      </div>
    </LowModal>
  )
}
