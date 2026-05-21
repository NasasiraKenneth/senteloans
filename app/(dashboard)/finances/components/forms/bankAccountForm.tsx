"use client"

import { useEffect, useState } from "react"
import { Building2, Hash, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"

export type BankAccountFormData = {
  bank_name: string
  bank_account_number: string
  total_amount: string
  branch_id: string
}

type BranchOption = { value: string; label: string }

interface BankAccountFormProps {
  onSubmit: (data: BankAccountFormData) => void
  onCancel: () => void
  loading?: boolean
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  mode?: "create" | "edit"
  initialValues?: Partial<BankAccountFormData>
  formDisabled?: boolean
}

const defaultValues: BankAccountFormData = {
  bank_name: "",
  bank_account_number: "",
  total_amount: "",
  branch_id: "",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function BankAccountForm({
  onSubmit,
  onCancel,
  loading = false,
  showBranchPicker,
  branchOptions,
  mode = "create",
  initialValues,
  formDisabled = false,
}: BankAccountFormProps) {
  const [form, setForm] = useState<BankAccountFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof BankAccountFormData, string>>>({})
  const disabled = loading || formDisabled

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
      bank_name: initialValues.bank_name ?? "",
      bank_account_number: initialValues.bank_account_number ?? "",
      total_amount: initialValues.total_amount ?? "",
      branch_id: initialValues.branch_id ?? "",
    })
    setErrors({})
  }, [mode, initialValues])

  const set = (field: keyof BankAccountFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof BankAccountFormData, string>> = {}
    if (!form.bank_name.trim()) e.bank_name = "Bank name is required"
    if (!form.bank_account_number.trim()) e.bank_account_number = "Account number is required"
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"

    if (mode !== "edit") {
      const amountRaw = form.total_amount.trim()
      if (amountRaw === "") {
        e.total_amount = "Opening balance is required"
      } else {
        const amount = Number(amountRaw)
        if (!Number.isFinite(amount) || amount < 0) {
          e.total_amount = "Enter a valid amount (0 or greater)"
        }
      }
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      bank_name: form.bank_name.trim(),
      bank_account_number: form.bank_account_number.trim(),
      total_amount: mode === "edit" ? "" : form.total_amount.trim(),
      branch_id: form.branch_id.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      {showBranchPicker && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
          <select
            className={inputClass(!!errors.branch_id).replace("pl-10", "pl-3")}
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
          {errors.branch_id ? <p className="mt-1 text-xs text-red-600">{errors.branch_id}</p> : null}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Bank name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className={inputClass(!!errors.bank_name)}
            value={form.bank_name}
            onChange={(ev) => set("bank_name", ev.target.value)}
            placeholder="e.g. Equity Bank"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        {errors.bank_name ? <p className="mt-1 text-xs text-red-600">{errors.bank_name}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Account number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className={inputClass(!!errors.bank_account_number)}
            value={form.bank_account_number}
            onChange={(ev) => set("bank_account_number", ev.target.value)}
            placeholder="Account number"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        {errors.bank_account_number ? (
          <p className="mt-1 text-xs text-red-600">{errors.bank_account_number}</p>
        ) : null}
      </div>

      {mode !== "edit" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Opening / total amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass(!!errors.total_amount)}
              value={form.total_amount}
              onChange={(ev) => set("total_amount", ev.target.value)}
              placeholder="0.00"
              disabled={disabled}
            />
          </div>
          {errors.total_amount ? <p className="mt-1 text-xs text-red-600">{errors.total_amount}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Ledger balance held in this account at registration. This cannot be edited later.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
        >
          {loading ? "Saving…" : mode === "edit" ? "Save changes" : "Add bank account"}
        </Button>
      </div>
    </form>
  )
}
