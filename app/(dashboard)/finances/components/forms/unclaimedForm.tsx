"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type UnclaimedFormData = {
  amount: string
  mode: string
  date: string
  transaction_number: string
  bank_account_id: string
  notes: string
  branch_id: string
}

type BranchOption = { value: string; label: string }
type BankAccountOption = { id: string; bank_name: string; bank_account_number: string }

interface UnclaimedFormProps {
  onSubmit: (data: UnclaimedFormData) => void
  onCancel: () => void
  loading?: boolean
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  mode?: "create" | "edit"
  initialValues?: Partial<UnclaimedFormData>
  formDisabled?: boolean
}

const defaultValues: UnclaimedFormData = {
  amount: "",
  mode: "Cash",
  date: "",
  transaction_number: "",
  bank_account_id: "",
  notes: "",
  branch_id: "",
}

function isBankTransferMode(mode: string): boolean {
  return mode.trim().toLowerCase() === "bank transfer"
}

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

function mergeInitialValues(initialValues?: Partial<UnclaimedFormData>): UnclaimedFormData {
  return {
    ...defaultValues,
    amount: initialValues?.amount ?? "",
    mode: initialValues?.mode ?? "Cash",
    date: toDateOnlyString(initialValues?.date),
    transaction_number: initialValues?.transaction_number ?? "",
    bank_account_id: initialValues?.bank_account_id ?? "",
    notes: initialValues?.notes ?? "",
    branch_id: initialValues?.branch_id ?? "",
  }
}

export default function UnclaimedForm({
  onSubmit,
  onCancel,
  loading = false,
  showBranchPicker,
  branchOptions,
  mode = "create",
  initialValues,
  formDisabled = false,
}: UnclaimedFormProps) {
  const [form, setForm] = useState<UnclaimedFormData>(() =>
    mode === "edit" && initialValues ? mergeInitialValues(initialValues) : { ...defaultValues },
  )
  const [errors, setErrors] = useState<Partial<Record<keyof UnclaimedFormData, string>>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false)
  const disabled = loading || formDisabled

  useEffect(() => {
    if (mode === "edit") return
    if (!showBranchPicker) {
      setForm((prev) => ({ ...prev, branch_id: "" }))
    }
  }, [showBranchPicker, mode])

  useEffect(() => {
    if (mode !== "edit" || !initialValues) return
    setForm(mergeInitialValues(initialValues))
    setErrors({})
  }, [mode, initialValues])

  useEffect(() => {
    if (!isBankTransferMode(form.mode)) return
    let cancelled = false
    async function loadBankAccounts() {
      setBankAccountsLoading(true)
      try {
        const params = new URLSearchParams({ rowsPerPage: "100" })
        if (showBranchPicker && form.branch_id.trim()) {
          params.set("branches", form.branch_id.trim())
        }
        const res = await fetch(`/api/institution/finances/bank-accounts?${params.toString()}`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as { rows?: BankAccountOption[] }
        const rows = Array.isArray(data.rows) ? data.rows : []
        if (!cancelled) setBankAccounts(rows)
      } catch {
        if (!cancelled) setBankAccounts([])
      } finally {
        if (!cancelled) setBankAccountsLoading(false)
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [form.mode, form.branch_id, showBranchPicker])

  const set = (field: keyof UnclaimedFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "mode") {
        if (value.trim().toLowerCase() === "cash") {
          next.transaction_number = ""
        }
        if (!isBankTransferMode(value)) {
          next.bank_account_id = ""
        }
      }
      if (field === "branch_id") {
        next.bank_account_id = ""
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const isCash = form.mode.trim().toLowerCase() === "cash"
  const isBankTransfer = isBankTransferMode(form.mode)
  const bankAccountPickerBlocked = showBranchPicker && !form.branch_id.trim()

  const validate = (): boolean => {
    const e: Partial<Record<keyof UnclaimedFormData, string>> = {}
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) e.amount = "Enter an amount greater than zero"
    if (!form.mode.trim()) e.mode = "Select a payment mode"
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"
    if (isBankTransfer && !bankAccountPickerBlocked && !form.bank_account_id.trim()) {
      e.bank_account_id = "Select a bank account"
    }
    if (!isCash && !form.transaction_number.trim()) {
      e.transaction_number = "Reference number is required"
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      amount: form.amount.trim(),
      mode: form.mode.trim(),
      date: form.date.trim(),
      transaction_number: isCash ? "" : form.transaction_number.trim(),
      bank_account_id: isBankTransfer ? form.bank_account_id.trim() : "",
      notes: form.notes.trim(),
      branch_id: form.branch_id.trim(),
    })
  }

  const bankAccountPlaceholder = bankAccountsLoading
    ? "Loading bank accounts…"
    : bankAccountPickerBlocked
      ? "Select a branch first"
      : bankAccounts.length === 0
        ? "No bank accounts for this branch"
        : "Select bank account"

  const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      {showBranchPicker && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
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
          {errors.branch_id ? <p className="mt-1 text-xs text-red-600">{errors.branch_id}</p> : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass(!!errors.amount)}
            value={form.amount}
            onChange={(ev) => set("amount", ev.target.value)}
            placeholder="0.00"
            disabled={disabled}
          />
          {errors.amount ? <p className="mt-1 text-xs text-red-600">{errors.amount}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Payment mode <span className="text-red-500">*</span>
          </label>
          <div className={`${selectWrap(!!errors.mode)} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
            <StyledSelect
              value={form.mode}
              onChange={(v) => set("mode", v)}
              placeholder="Select mode"
              options={PAYMENT_MODE_OPTIONS}
            />
          </div>
          {errors.mode ? <p className="mt-1 text-xs text-red-600">{errors.mode}</p> : null}
        </div>
      </div>

      {isBankTransfer ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank account <span className="text-red-500">*</span>
          </label>
          <div
            className={`${selectWrap(!!errors.bank_account_id)} ${disabled || bankAccountsLoading || bankAccountPickerBlocked ? "pointer-events-none opacity-60" : ""}`}
          >
            <StyledSelect
              value={form.bank_account_id}
              onChange={(v) => set("bank_account_id", v)}
              placeholder={bankAccountPlaceholder}
              options={bankAccounts.map((account) => ({
                value: account.id,
                label: `${account.bank_name} — ${account.bank_account_number}`,
              }))}
              searchable
            />
          </div>
          {errors.bank_account_id ? (
            <p className="mt-1 text-xs text-red-600">{errors.bank_account_id}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Deposit date</label>
        <ReeveDatePicker
          key={form.date || "empty-date"}
          value={form.date}
          onChange={(v) => set("date", v)}
          placeholder="Select date"
        />
      </div>

      {!isCash ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Reference number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={inputClass(!!errors.transaction_number)}
            value={form.transaction_number}
            onChange={(ev) => set("transaction_number", ev.target.value)}
            placeholder="Payment reference"
            disabled={disabled}
          />
          {errors.transaction_number ? (
            <p className="mt-1 text-xs text-red-600">{errors.transaction_number}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          className={`${inputClass(false)} min-h-[80px] resize-y`}
          value={form.notes}
          onChange={(ev) => set("notes", ev.target.value)}
          placeholder="Optional notes"
          disabled={disabled}
        />
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
          {loading ? "Saving…" : mode === "edit" ? "Save changes" : "Add deposit"}
        </Button>
      </div>
    </form>
  )
}
