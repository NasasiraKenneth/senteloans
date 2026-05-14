"use client"

import { useEffect, useState } from "react"
import { LowModal } from "@/components/modals/LowModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { describeExpenseCashflowApiError } from "./cashflowApiErrors"
import CashflowForm, { emptyFlowForm, validateFlowForm, type FlowFormData } from "../forms/cashflowForm"

interface RecordExpenseCashflowProps {
  isOpen: boolean
  onClose: () => void
  expenseId: string
  onSuccess?: () => Promise<void> | void
}

export default function RecordExpenseCashflow({ isOpen, onClose, expenseId, onSuccess }: RecordExpenseCashflowProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<FlowFormData>(emptyFlowForm())
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FlowFormData | "root", string>>>({})

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyFlowForm())
    setFieldErrors({})
  }, [isOpen, expenseId])

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
    if (!expenseId) return
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/expenses/${expenseId}/cashflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          ...(form.type === "staff" ? { staff_id: form.staffId } : { client_id: form.clientId }),
          amount: Number(form.amount || 0),
          description: form.description.trim() || null,
          date: form.date,
          mode: form.transactionMode.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(describeExpenseCashflowApiError(body))
      toast({ title: "Cashflow recorded", description: "The cashflow was saved." })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not record cashflow",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Record cashflow">
      <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto p-4">
        <CashflowForm
          expenseId={expenseId}
          value={form}
          onChange={patchForm}
          disabled={saving}
          errors={fieldErrors}
        />
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving…" : "Record cashflow"}
          </Button>
        </div>
      </div>
    </LowModal>
  )
}
