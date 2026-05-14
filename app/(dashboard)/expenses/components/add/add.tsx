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
  const [categories, setCategories] = useState<Array<{ id: string; category: string }>>([])
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    try {
      const [expRes, permRes] = await Promise.all([
        fetch("/api/institution/expenses?page=1&pageSize=1", { cache: "no-store" }),
        fetch("/api/institution/expenses/permissions", { cache: "no-store" }),
      ])
      if (expRes.ok) {
        const expBody = await expRes.json().catch(() => ({}))
        const cats = Array.isArray(expBody?.categories) ? expBody.categories : []
        setCategories(cats.map((c: Record<string, unknown>) => ({ id: String(c.id), category: String(c.category || "") })))
      } else {
        setCategories([])
      }
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
      setCategories([])
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
          category_id: data.category_id,
          type: data.type,
          branch_id: data.branch_id || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create expense")

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
      if (message === "expense_number_generation_failed") {
        toast({
          title: "Could not assign expense number",
          description: "Please try again in a moment.",
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
        categories={categories}
        showBranchPicker={isSuperAdmin && branchOptions.length > 0}
        branchOptions={branchOptions}
      />
    </ReeveModal>
  )
}
