"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import ExpenseForm, { type ExpenseFormData } from "../forms/expenseForm"
import { useToast } from "@/components/ui/toast"

interface AddNewExpenseProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewExpense({ isOpen, onClose, onSuccess }: AddNewExpenseProps) {
  const [loading, setLoading] = useState(false)
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
    if (!isOpen) return
    void loadMeta()
  }, [isOpen, loadMeta])

  const handleCreate = async (data: ExpenseFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description.trim() ? data.description.trim() : null,
          type: data.type,
          branch_id: data.branch_id || null,
        }),
      })
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) throw new Error(String(body?.code ?? body?.error ?? "Failed to create expense"))

      const num = String(body?.expense_number || "")
      toast({
        title: "Expense created",
        description: num ? `${num} has been added.` : "The expense has been added.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      if (message === "missing_permission:create_expense") {
        toast({
          title: "Access denied",
          description: "You do not have permission to create expenses.",
          variant: "warning",
        })
        return
      }
      if (message === "super_admin_write_blocked") {
        toast({
          title: "Access denied",
          description: "Super admins cannot create expenses.",
          variant: "warning",
        })
        return
      }
      if (message === "expense_number_generation_failed") {
        toast({
          title: "Could not assign expense number",
          description: "Please try again in a moment.",
          variant: "destructive",
        })
        return
      }
      if (message === "type_required" || message === "invalid_type") {
        toast({
          title: "Invalid expense type",
          description: "Select a valid expense type.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Failed to create expense",
        description: message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="New expense" className="z-20">
      <ExpenseForm
        onSubmit={handleCreate}
        loading={loading}
        showBranchPicker={isSuperAdmin && branchOptions.length > 0}
        branchOptions={branchOptions}
      />
    </ReeveModal>
  )
}
