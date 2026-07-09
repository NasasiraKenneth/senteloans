"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import ExpenseForm, { type ExpenseFormData } from "../forms/expenseForm"
import { useToast } from "@/components/ui/toast"
import { describeExpenseApiError } from "../expenseApiErrors"

type ExpenseDetail = {
  id: string
  expense_number: string
  name: string
  description: string | null
  type: string
  status: string
  branch_id: string
  branch_name: string
  can_edit: boolean
}

interface EditExpenseProps {
  isOpen: boolean
  expenseId: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditExpense({ isOpen, expenseId, onClose, onSuccess }: EditExpenseProps) {
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<ExpenseDetail | null>(null)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    try {
      const permRes = await fetch("/api/institution/expenses/permissions", { cache: "no-store" })
      if (permRes.ok) {
        const permBody = await permRes.json().catch(() => ({}))
        const p = permBody?.permissions
        setIsSuperAdmin(!!p?.isSuperAdmin)
        setBranchOptions((p?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })))
      } else {
        setIsSuperAdmin(false)
        setBranchOptions([])
      }
    } catch {
      setBranchOptions([])
      setIsSuperAdmin(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !expenseId) {
      setDetail(null)
      return
    }
    void loadMeta()
    setDetailLoading(true)
    setDetail(null)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/institution/expenses/${expenseId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load expense")
        const exp = body?.expense as ExpenseDetail | undefined
        if (!exp) throw new Error("Invalid response")
        if (!exp.can_edit) {
          if (!cancelled) {
            toast({
              variant: "destructive",
              title: "Cannot edit",
              description: "Only expenses in Pending status can be edited.",
            })
            onClose()
          }
          return
        }
        if (!cancelled) setDetail(exp)
      } catch (e: unknown) {
        if (cancelled) return
        const message = String((e as Error)?.message || "")
        toast({
          variant: "destructive",
          title: "Could not load expense",
          description:
            message === "missing_permission:edit_expense" || message === "missing_permission:view_expenses"
              ? "You do not have permission to view or edit this expense."
              : message,
        })
        onClose()
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, expenseId, loadMeta, toast])

  const initialValues = useMemo<Partial<ExpenseFormData> | undefined>(() => {
    if (!detail) return undefined
    return {
      name: detail.name,
      description: detail.description ?? "",
      type: detail.type || "",
      branch_id: detail.branch_id || "",
    }
  }, [detail])

  const handleUpdate = async (data: ExpenseFormData) => {
    if (!expenseId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description.trim() ? data.description.trim() : null,
          type: data.type,
          branch_id: data.branch_id || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Failed to update expense",
          description: describeExpenseApiError(body),
        })
        return
      }

      toast({
        title: "Expense updated",
        description: `${String(body?.expense_number || detail?.expense_number || "")} saved.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        title: "Failed to update expense",
        description: String((e as Error)?.message || "Something went wrong. Please try again."),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const title = detail ? `Edit expense · ${detail.expense_number}` : "Edit expense"

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-20">
      {detailLoading || !detail || !initialValues ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          {!detail.can_edit ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              This expense is not Pending, so it cannot be edited.
            </div>
          ) : null}
          <ExpenseForm
            mode="edit"
            initialValues={initialValues}
            formDisabled={!detail.can_edit}
            onSubmit={handleUpdate}
            loading={loading}
            showBranchPicker={isSuperAdmin && branchOptions.length > 0}
            branchOptions={branchOptions}
          />
        </>
      )}
    </ReeveModal>
  )
}
