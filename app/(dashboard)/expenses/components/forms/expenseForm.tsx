"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"

export type ExpenseFormData = {
  name: string
  description: string
  category_id: string
  type: string
  branch_id: string
}

export const EXPENSE_TYPE_OPTIONS = [
  { value: "Short-term", label: "Short-term" },
  { value: "Long-term", label: "Long-term" },
] as const

const defaultValues: ExpenseFormData = {
  name: "",
  description: "",
  category_id: "",
  type: "Short-term",
  branch_id: "",
}

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

type CategoryOption = { id: string; category: string }
type BranchOption = { value: string; label: string }

interface ExpenseFormProps {
  onSubmit: (data: ExpenseFormData) => void
  loading?: boolean
  categories: CategoryOption[]
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  mode?: "create" | "edit"
  /** When provided (edit), seed form fields; keep referentially stable (e.g. useMemo from parent). */
  initialValues?: Partial<ExpenseFormData>
  /** When true, all fields and submit are disabled */
  formDisabled?: boolean
}

export default function ExpenseForm({
  onSubmit,
  loading = false,
  categories,
  showBranchPicker,
  branchOptions,
  mode = "create",
  initialValues,
  formDisabled = false,
}: ExpenseFormProps) {
  const [form, setForm] = useState<ExpenseFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormData, string>>>({})
  const disabled = loading || formDisabled

  const categorySelectOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.category || "—" })),
    [categories],
  )

  const typeSelectOptions = useMemo(
    () => EXPENSE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  )

  useEffect(() => {
    if (mode === "edit") return
    if (!showBranchPicker) {
      setForm((prev) => ({ ...prev, branch_id: "" }))
    }
  }, [showBranchPicker, mode])

  useEffect(() => {
    if (mode !== "edit" || !initialValues) return
    setForm({
      ...defaultValues,
      name: initialValues.name ?? "",
      description: initialValues.description ?? "",
      category_id: initialValues.category_id ?? "",
      type: initialValues.type ?? "Short-term",
      branch_id: initialValues.branch_id ?? "",
    })
    setErrors({})
  }, [mode, initialValues])

  const set = (field: keyof ExpenseFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof ExpenseFormData, string>> = {}
    if (!form.name.trim()) e.name = "Name is required"
    if (!form.category_id.trim()) e.category_id = "Select a category"
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      category_id: form.category_id.trim(),
      type: form.type.trim() || "Short-term",
      branch_id: form.branch_id.trim(),
    })
  }

  const selectWrap = (hasError: boolean) =>
    hasError ? "rounded-md ring-1 ring-red-500 ring-offset-0" : ""

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
      {showBranchPicker && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
          <div className={disabled ? "pointer-events-none opacity-60" : ""}>
            <select
              className={inputClass(!!errors.branch_id)}
              value={form.branch_id}
              onChange={(ev) => set("branch_id", ev.target.value)}
              disabled={disabled || branchOptions.length === 0}
            >
              <option value="">Select branch</option>
              {branchOptions.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          {errors.branch_id ? <p className="mt-1 text-xs text-red-600">{errors.branch_id}</p> : null}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          className={inputClass(!!errors.name)}
          value={form.name}
          onChange={(ev) => set("name", ev.target.value)}
          placeholder="Short title for this expense"
          disabled={disabled}
        />
        {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <div className={`${selectWrap(!!errors.category_id)} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
            <StyledSelect
              value={form.category_id}
              onChange={(v) => set("category_id", v)}
              placeholder="Select category"
              options={categorySelectOptions}
              searchable
            />
          </div>
          {errors.category_id ? <p className="mt-1 text-xs text-red-600">{errors.category_id}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <div className={disabled ? "pointer-events-none opacity-60" : ""}>
            <StyledSelect
              value={form.type}
              onChange={(v) => set("type", v)}
              placeholder="Select type"
              options={typeSelectOptions}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
        <textarea
          className={`${inputClass(false)} min-h-[100px] resize-y`}
          value={form.description}
          onChange={(ev) => set("description", ev.target.value)}
          placeholder="Additional details"
          disabled={disabled}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button
          type="submit"
          disabled={disabled}
          className="transition-colors hover:!bg-[#f08c2b] hover:!text-black"
        >
          {loading ? "Saving…" : mode === "edit" ? "Save changes" : "Create expense"}
        </Button>
      </div>
    </form>
  )
}
