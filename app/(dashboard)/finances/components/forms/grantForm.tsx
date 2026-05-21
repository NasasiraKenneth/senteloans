"use client"

import { useEffect, useMemo, useState } from "react"
import { HandCoins, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"

export type GrantFormData = {
  client_id: string
  total_amount: string
  available_balance: string
  branch_id: string
}

type BranchOption = { value: string; label: string }

type ClientOption = { value: string; label: string; branch_id: string }

interface GrantFormProps {
  onSubmit: (data: GrantFormData) => void
  onCancel: () => void
  loading?: boolean
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  clientOptions: ClientOption[]
  clientsLoading?: boolean
  mode?: "create" | "edit"
  initialValues?: Partial<GrantFormData>
  formDisabled?: boolean
}

const defaultValues: GrantFormData = {
  client_id: "",
  total_amount: "",
  available_balance: "",
  branch_id: "",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

export default function GrantForm({
  onSubmit,
  onCancel,
  loading = false,
  showBranchPicker,
  branchOptions,
  clientOptions,
  clientsLoading = false,
  mode = "create",
  initialValues,
  formDisabled = false,
}: GrantFormProps) {
  const [form, setForm] = useState<GrantFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof GrantFormData, string>>>({})
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
      client_id: initialValues.client_id ?? "",
      total_amount: initialValues.total_amount ?? "",
      available_balance: initialValues.available_balance ?? "",
      branch_id: initialValues.branch_id ?? "",
    })
    setErrors({})
  }, [mode, initialValues])

  const filteredClientOptions = useMemo(() => {
    if (!showBranchPicker || !form.branch_id.trim()) {
      return clientOptions
    }
    return clientOptions.filter((c) => c.branch_id === form.branch_id)
  }, [clientOptions, form.branch_id, showBranchPicker])

  const set = (field: keyof GrantFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "branch_id") {
        next.client_id = ""
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof GrantFormData, string>> = {}
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"
    if (!form.client_id.trim()) e.client_id = "Select a client"

    const totalRaw = form.total_amount.trim()
    if (totalRaw === "") {
      e.total_amount = "Total grant amount is required"
    } else {
      const total = Number(totalRaw)
      if (!Number.isFinite(total) || total < 0) {
        e.total_amount = "Enter a valid amount (0 or greater)"
      }
    }

    const availableRaw = form.available_balance.trim()
    if (availableRaw !== "") {
      const available = Number(availableRaw)
      const total = Number(totalRaw)
      if (!Number.isFinite(available) || available < 0) {
        e.available_balance = "Enter a valid available balance"
      } else if (Number.isFinite(total) && available > total) {
        e.available_balance = "Available balance cannot exceed total grant"
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
      client_id: form.client_id.trim(),
      total_amount: form.total_amount.trim(),
      available_balance: form.available_balance.trim(),
      branch_id: form.branch_id.trim(),
    })
  }

  const clientPlaceholder = clientsLoading
    ? "Loading clients…"
    : showBranchPicker && !form.branch_id.trim()
      ? "Select a branch first"
      : filteredClientOptions.length === 0
        ? "No clients for this branch"
        : "Select client"

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
          Client <span className="text-red-500">*</span>
        </label>
        <div
          className={`${selectWrap(!!errors.client_id)} ${disabled || clientsLoading || (showBranchPicker && !form.branch_id.trim()) ? "pointer-events-none opacity-60" : ""}`}
        >
          <StyledSelect
            value={form.client_id}
            onChange={(v) => set("client_id", v)}
            placeholder={clientPlaceholder}
            options={filteredClientOptions.map((c) => ({ value: c.value, label: c.label }))}
            searchable
          />
        </div>
        {errors.client_id ? <p className="mt-1 text-xs text-red-600">{errors.client_id}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Total grant amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <HandCoins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Amount received</label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass(!!errors.available_balance)}
            value={form.available_balance}
            onChange={(ev) => set("available_balance", ev.target.value)}
            placeholder="0.00"
            disabled={disabled}
          />
        </div>
        {errors.available_balance ? (
          <p className="mt-1 text-xs text-red-600">{errors.available_balance}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Leave blank if the full grant has already been received.</p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
        >
          {loading ? "Saving…" : mode === "edit" ? "Save changes" : "Add grant"}
        </Button>
      </div>
    </form>
  )
}
