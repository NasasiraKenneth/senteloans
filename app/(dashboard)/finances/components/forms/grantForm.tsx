"use client"

import { useEffect, useMemo, useState } from "react"
import { HandCoins, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type GrantFormData = {
  third_party_agent_id: string
  total_amount: string
  available_balance: string
  branch_id: string
  mode: string
  reference_number: string
  bank_account_id: string
  date: string
}

type BranchOption = { value: string; label: string }
type ClientOption = { value: string; label: string; branch_id: string }
type BankAccountOption = { id: string; bank_name: string; bank_account_number: string }

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
  third_party_agent_id: "",
  total_amount: "",
  available_balance: "",
  branch_id: "",
  mode: "Cash",
  reference_number: "",
  bank_account_id: "",
  date: toDateOnlyString(new Date()),
}

const plainInputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

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
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
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
      third_party_agent_id: initialValues.third_party_agent_id ?? "",
      total_amount: initialValues.total_amount ?? "",
      available_balance: initialValues.available_balance ?? "",
      branch_id: initialValues.branch_id ?? "",
      mode: initialValues.mode ?? "Cash",
      reference_number: initialValues.reference_number ?? "",
      bank_account_id: initialValues.bank_account_id ?? "",
      date: initialValues.date ? toDateOnlyString(initialValues.date) : toDateOnlyString(new Date()),
    })
    setErrors({})
  }, [mode, initialValues])

  const filteredClientOptions = useMemo(() => {
    if (!showBranchPicker || !form.branch_id.trim()) {
      return clientOptions
    }
    return clientOptions.filter((c) => c.branch_id === form.branch_id)
  }, [clientOptions, form.branch_id, showBranchPicker])

  const effectiveReceived = useMemo(() => {
    const receivedRaw = form.available_balance.trim()
    if (receivedRaw !== "") {
      const n = Number(receivedRaw)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    const total = Number(form.total_amount)
    return Number.isFinite(total) && total > 0 ? total : 0
  }, [form.available_balance, form.total_amount])

  const showPaymentFields = mode === "create" && effectiveReceived > 0
  const showPaymentModeOnCreate = mode === "create"
  const isCash = form.mode.trim().toLowerCase() === "cash"
  const isBankRouted = isBankRoutedPaymentMode(form.mode)
  const bankAccountPickerBlocked = showBranchPicker && !form.branch_id.trim()

  useEffect(() => {
    if (!showPaymentFields && !showPaymentModeOnCreate) return
    let cancelled = false
    async function loadBankAccounts() {
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
        if (!cancelled) setBankAccounts(Array.isArray(data.rows) ? data.rows : [])
      } catch {
        if (!cancelled) setBankAccounts([])
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [showPaymentFields, showPaymentModeOnCreate, form.branch_id, showBranchPicker])

  const set = (field: keyof GrantFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "branch_id") {
        next.third_party_agent_id = ""
        next.bank_account_id = ""
      }
      if (field === "mode") {
        if (value.trim().toLowerCase() === "cash") {
          next.reference_number = ""
        }
        if (!isBankRoutedPaymentMode(value)) {
          next.bank_account_id = ""
        }
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof GrantFormData, string>> = {}
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"
    if (!form.third_party_agent_id.trim()) e.third_party_agent_id = "Select a third party agent"

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

    if (showPaymentFields) {
      if (!form.mode.trim()) e.mode = "Select a payment mode"
      if (!isCash && !form.reference_number.trim()) e.reference_number = "Reference number is required"
      if (isBankRouted && !bankAccountPickerBlocked && !form.bank_account_id.trim()) {
        e.bank_account_id = "Select a bank account"
      }
    } else if (showPaymentModeOnCreate && !form.mode.trim()) {
      e.mode = "Select a payment mode"
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      third_party_agent_id: form.third_party_agent_id.trim(),
      total_amount: form.total_amount.trim(),
      available_balance: form.available_balance.trim(),
      branch_id: form.branch_id.trim(),
      mode: form.mode.trim(),
      reference_number: isCash ? "" : form.reference_number.trim(),
      bank_account_id: isBankRouted ? form.bank_account_id.trim() : "",
      date: form.date.trim() || toDateOnlyString(new Date()),
    })
  }

  const agentPlaceholder = clientsLoading
    ? "Loading third party agents…"
    : showBranchPicker && !form.branch_id.trim()
      ? "Select a branch first"
      : filteredClientOptions.length === 0
        ? "No third party agents for this branch"
        : "Select third party agent"

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
          Third party agent <span className="text-red-500">*</span>
        </label>
        <div
          className={`${selectWrap(!!errors.third_party_agent_id)} ${disabled || clientsLoading || (showBranchPicker && !form.branch_id.trim()) ? "pointer-events-none opacity-60" : ""}`}
        >
          <StyledSelect
            value={form.third_party_agent_id}
            onChange={(v) => set("third_party_agent_id", v)}
            placeholder={agentPlaceholder}
            options={filteredClientOptions.map((c) => ({ value: c.value, label: c.label }))}
            searchable
          />
        </div>
        {errors.third_party_agent_id ? <p className="mt-1 text-xs text-red-600">{errors.third_party_agent_id}</p> : null}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank if the full grant has already been received.
            </p>
          )}
        </div>

        {showPaymentModeOnCreate ? (
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
        ) : null}
      </div>

      {showPaymentModeOnCreate && !isCash ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Reference number {showPaymentFields ? <span className="text-red-500">*</span> : null}
          </label>
          <input
            type="text"
            className={plainInputClass(!!errors.reference_number)}
            value={form.reference_number}
            onChange={(ev) => set("reference_number", ev.target.value)}
            placeholder="Payment reference"
            disabled={disabled}
          />
          {errors.reference_number ? (
            <p className="mt-1 text-xs text-red-600">{errors.reference_number}</p>
          ) : showPaymentFields ? null : (
            <p className="mt-1 text-xs text-muted-foreground">Required when recording a received amount.</p>
          )}
        </div>
      ) : null}

      {showPaymentFields ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment date</label>
            <ReeveDatePicker
              key={form.date || "empty-date"}
              value={form.date}
              onChange={(v) => set("date", v)}
              placeholder="Select date"
            />
          </div>

          {isBankRouted ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bank account <span className="text-red-500">*</span>
              </label>
              <div
                className={`${selectWrap(!!errors.bank_account_id)} ${disabled || bankAccountPickerBlocked ? "pointer-events-none opacity-60" : ""}`}
              >
                <StyledSelect
                  value={form.bank_account_id}
                  onChange={(v) => set("bank_account_id", v)}
                  placeholder={
                    bankAccountPickerBlocked
                      ? "Select a branch first"
                      : bankAccounts.length
                        ? "Select bank account"
                        : "No bank accounts"
                  }
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
        </>
      ) : null}

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
