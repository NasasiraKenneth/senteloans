"use client"

import { useEffect, useRef, useState } from "react"
import { Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"
import { formatCurrency } from "../../utils"

export type GrantAmountFormData = {
  amount: string
  mode: string
  reference_number: string
  bank_account_id: string
  date: string
}

export type GrantAmountSummary = {
  third_party_agent_name: string
  total_amount: number
  available_balance: number
  remaining_amount: number
  percentage_received: number
}

type BankAccountOption = { id: string; bank_name: string; bank_account_number: string }

interface GrantAmountFormProps {
  onSubmit: (data: GrantAmountFormData) => void
  onCancel: () => void
  loading?: boolean
  summary: GrantAmountSummary
  formDisabled?: boolean
}

const defaultValues: GrantAmountFormData = {
  amount: "",
  mode: "Cash",
  reference_number: "",
  bank_account_id: "",
  date: toDateOnlyString(new Date()),
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const plainInputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

export default function GrantAmountForm({
  onSubmit,
  onCancel,
  loading = false,
  summary,
  formDisabled = false,
}: GrantAmountFormProps) {
  const [form, setForm] = useState<GrantAmountFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof GrantAmountFormData, string>>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
  const disabled = loading || formDisabled
  const amountInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      amountInputRef.current?.focus({ preventScroll: true })
    }, 320)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch("/api/institution/finances/bank-accounts?rowsPerPage=100", {
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
  }, [])

  const isCash = form.mode.trim().toLowerCase() === "cash"
  const isBankRouted = isBankRoutedPaymentMode(form.mode)

  const set = (field: keyof GrantAmountFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
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
    const e: Partial<Record<keyof GrantAmountFormData, string>> = {}
    const raw = form.amount.trim()
    if (raw === "") {
      e.amount = "Enter the amount received"
    } else {
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        e.amount = "Enter an amount greater than zero"
      } else if (value > summary.remaining_amount) {
        e.amount = `Amount cannot exceed the remaining ${formatCurrency(summary.remaining_amount)}`
      }
    }
    if (!form.mode.trim()) e.mode = "Select a payment mode"
    if (!isCash && !form.reference_number.trim()) e.reference_number = "Reference number is required"
    if (isBankRouted && !form.bank_account_id.trim()) e.bank_account_id = "Select a bank account"
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
      reference_number: isCash ? "" : form.reference_number.trim(),
      bank_account_id: isBankRouted ? form.bank_account_id.trim() : "",
      date: form.date.trim() || toDateOnlyString(new Date()),
    })
  }

  const enteredAmount = Number(form.amount)
  const previewValid = Number.isFinite(enteredAmount) && enteredAmount > 0 && enteredAmount <= summary.remaining_amount
  const previewNewReceived = previewValid ? summary.available_balance + enteredAmount : null

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      <div className="rounded-lg border border-[#f08c2b]/20 bg-[#f08c2b]/5 p-3 text-sm">
        <p className="font-medium text-gray-900">{summary.third_party_agent_name}</p>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>Total grant</span>
          <span className="text-right text-gray-700">{formatCurrency(summary.total_amount)}</span>
          <span>Received so far</span>
          <span className="text-right text-gray-700">{formatCurrency(summary.available_balance)}</span>
          <span>Remaining</span>
          <span className="text-right font-medium text-gray-900">{formatCurrency(summary.remaining_amount)}</span>
          <span>Received %</span>
          <span className="text-right text-gray-700">{summary.percentage_received}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Amount received <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={amountInputRef}
              type="number"
              min={0}
              max={summary.remaining_amount}
              step="0.01"
              className={inputClass(!!errors.amount)}
              value={form.amount}
              onChange={(ev) => set("amount", ev.target.value)}
              placeholder="0.00"
              disabled={disabled}
            />
          </div>
          {errors.amount ? (
            <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Will be added to the amount already received. Max {formatCurrency(summary.remaining_amount)}.
            </p>
          )}
          {previewNewReceived !== null ? (
            <p className="mt-1 text-xs text-emerald-700">
              New amount received: {formatCurrency(previewNewReceived)} of {formatCurrency(summary.total_amount)}
            </p>
          ) : null}
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

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Payment date</label>
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
            className={plainInputClass(!!errors.reference_number)}
            value={form.reference_number}
            onChange={(ev) => set("reference_number", ev.target.value)}
            placeholder="Payment reference"
            disabled={disabled}
          />
          {errors.reference_number ? (
            <p className="mt-1 text-xs text-red-600">{errors.reference_number}</p>
          ) : null}
        </div>
      ) : null}

      {isBankRouted ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank account <span className="text-red-500">*</span>
          </label>
          <div className={`${selectWrap(!!errors.bank_account_id)} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
            <StyledSelect
              value={form.bank_account_id}
              onChange={(v) => set("bank_account_id", v)}
              placeholder={bankAccounts.length ? "Select bank account" : "No bank accounts"}
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

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
        >
          {loading ? "Saving…" : "Add amount"}
        </Button>
      </div>
    </form>
  )
}
