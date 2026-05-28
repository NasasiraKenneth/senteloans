"use client"

import { useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { describeExpenseCashflowApiError } from "./cashflowApiErrors"
import CashflowForm, {
  emptyFlowForm,
  flowFormDataFromExpenseCashflowRow,
  validateFlowForm,
  type FlowFormData,
} from "../forms/cashflowForm"

/** Minimal row shape from the expense detail cashflows table */
export interface EditExpenseCashflowRow {
  id: string
  status: string
  staff_id: string | null
  client_id: string | null
  amount: number
  description: string | null
  date: string | null
  payment_method: string | null
}

interface EditExpenseCashflowModalProps {
  isOpen: boolean
  onClose: () => void
  expenseId: string
  cashflow: EditExpenseCashflowRow | null
  onSuccess?: () => Promise<void> | void
  title?: string
}

export default function EditExpenseCashflowModal({
  isOpen,
  onClose,
  expenseId,
  cashflow,
  onSuccess,
  title = "Edit Cashflow",
}: EditExpenseCashflowModalProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FlowFormData>(emptyFlowForm())
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FlowFormData | "root", string>>>({})
  const { toast } = useToast()

  const initialValues = useMemo<FlowFormData>(
    () => (cashflow ? flowFormDataFromExpenseCashflowRow(cashflow) : emptyFlowForm()),
    [cashflow],
  )

  useEffect(() => {
    if (!isOpen) return
    setForm(initialValues)
    setFieldErrors({})
  }, [isOpen, expenseId, cashflow?.id, initialValues])

  const patchForm = (patch: Partial<FlowFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setFieldErrors({})
  }

  const handleSubmit = async (data: FlowFormData) => {
    if (!cashflow?.id || !expenseId) return
    const v = validateFlowForm(data)
    if (Object.keys(v).length > 0) {
      setFieldErrors(v)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/expenses/${expenseId}/cashflows/${cashflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.type,
          ...(data.type === "staff" ? { staff_id: data.staffId } : { client_id: data.clientId }),
          amount: Number(data.amount || 0),
          description: data.description.trim() || null,
          date: data.date,
          mode: data.transactionMode.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(describeExpenseCashflowApiError(body))
      toast({
        title: "Cashflow updated",
        description: "Changes were saved successfully.",
        variant: "success",
      })
      await onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      if (message.startsWith("missing_permission:")) {
        toast({
          title: "Access denied",
          description: "You do not have permission to update this cashflow.",
          variant: "warning",
        })
      } else {
        toast({
          title: "Update failed",
          description: message || "Unexpected error",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-10">
      <div className="max-h-[min(75vh,32rem)] space-y-4 overflow-y-auto p-4">
        <CashflowForm
          expenseId={expenseId}
          value={form}
          onChange={patchForm}
          disabled={loading || !cashflow}
          errors={fieldErrors}
        />
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit(form)}
            disabled={loading || !cashflow}
          >
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
