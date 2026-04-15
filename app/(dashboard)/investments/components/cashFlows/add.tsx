"use client"

import { useEffect, useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import FlowForm, { emptyFlowForm, FlowFormData, validateFlowForm } from "../forms/flowForm"

interface RecordCashflowProps {
  isOpen: boolean
  onClose: () => void
  investmentId: string
  onSuccess: () => Promise<void> | void
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
    if (form.category && form.category !== "adjustment" && !String(form.transactionMode || "").trim()) {
      v.transactionMode = "Select a transaction mode"
    }
    if (Object.keys(v).length > 0) {
      setFieldErrors(v)
      return
    }

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
          mode: form.transactionMode || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to record cashflow")
      await onSuccess()
      onClose()
      toast({ variant: "success", title: "Cashflow recorded" })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to record cashflow",
        description: e?.message || "Please try again.",
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
