"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"
import { formatCurrency } from "../../utils"

export type BankAmountDirection = "deposit" | "withdraw"

export type BankAmountFormData = {
  amount: string
  direction: BankAmountDirection
  date: string
  mode: string
  bank_account_id: string
  /** Always required (deposit or withdraw); ledger reference for this bank account. */
  reference_number: string
  /** Required for non-cash modes; payment reference for transfer from/to. */
  mode_reference_number: string
  transaction_charges: string
}

export type BankAmountSummary = {
  id: string
  bank_name: string
  bank_account_number: string
  branch_name: string
  total_amount: number
}

type BankAccountOption = {
  id: string
  bank_name: string
  bank_account_number: string
}

interface BankAmountFormProps {
  onSubmit: (data: BankAmountFormData) => void
  onCancel: () => void
  loading?: boolean
  summary: BankAmountSummary
  formDisabled?: boolean
}

function todayDateOnly(): string {
  return toDateOnlyString(new Date())
}

const defaultValues: BankAmountFormData = {
  amount: "",
  direction: "deposit",
  date: todayDateOnly(),
  mode: "Cash",
  bank_account_id: "",
  reference_number: "",
  mode_reference_number: "",
  transaction_charges: "",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const plainInputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function BankAmountForm({
  onSubmit,
  onCancel,
  loading = false,
  summary,
  formDisabled = false,
}: BankAmountFormProps) {
  const [form, setForm] = useState<BankAmountFormData>({ ...defaultValues, date: todayDateOnly() })
  const [errors, setErrors] = useState<Partial<Record<keyof BankAmountFormData, string>>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
  const disabled = loading || formDisabled
  const amountInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Focus after the modal slide-in completes so the browser does not scroll
    // the still-offscreen input into view (which would tug the page sideways).
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
        const rows = Array.isArray(data.rows) ? data.rows : []
        if (!cancelled) setBankAccounts(rows)
      } catch {
        // Best-effort; select shows empty if load fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const isCash = form.mode.trim().toLowerCase() === "cash"
  const isBankRouted = isBankRoutedPaymentMode(form.mode)
  const isWithdraw = form.direction === "withdraw"
  const isDeposit = form.direction === "deposit"
  const showDepositModeCharges = isDeposit && !isCash

  const selectableBankAccounts = useMemo(
    () => bankAccounts.filter((account) => account.id !== summary.id),
    [bankAccounts, summary.id],
  )

  useEffect(() => {
    if (!isBankRouted || form.bank_account_id !== summary.id) return
    setForm((prev) => ({ ...prev, bank_account_id: "" }))
  }, [isBankRouted, form.bank_account_id, summary.id])

  const set = <K extends keyof BankAmountFormData>(field: K, value: BankAmountFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "direction") {
        if (value === "deposit" && prev.mode.trim().toLowerCase() === "cash") {
          next.transaction_charges = ""
        }
      }
      if (field === "mode") {
        const mode = String(value).trim()
        if (mode.toLowerCase() === "cash") {
          if (prev.direction === "deposit") {
            next.transaction_charges = ""
          }
          next.bank_account_id = ""
          next.mode_reference_number = ""
        } else if (!isBankRoutedPaymentMode(mode)) {
          next.bank_account_id = ""
        } else if (next.bank_account_id === summary.id) {
          next.bank_account_id = ""
        }
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof BankAmountFormData, string>> = {}
    const raw = form.amount.trim()
    if (raw === "") {
      e.amount = "Enter an amount"
    } else {
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        e.amount = "Enter an amount greater than zero"
      } else if (form.direction === "withdraw" && value > summary.total_amount) {
        e.amount = `Withdrawal cannot exceed ${formatCurrency(summary.total_amount)}`
      }
    }

    if (!form.reference_number.trim()) {
      e.reference_number = "Reference number is required"
    }

    if (!isCash && !form.mode_reference_number.trim()) {
      e.mode_reference_number = `Reference number is required for ${form.mode}`
    }

    if (!form.date.trim()) e.date = "Select a date"
    if (!form.mode.trim()) {
      e.mode = form.direction === "deposit" ? "Select transfer from" : "Select transfer to"
    }

    if (isBankRouted && !form.bank_account_id.trim()) {
      e.bank_account_id = "Select a bank account"
    }

    if (isWithdraw || !isCash) {
      const chargesRaw = form.transaction_charges.trim()
      if (chargesRaw !== "") {
        const charges = Number(chargesRaw)
        if (!Number.isFinite(charges) || charges < 0) {
          e.transaction_charges = "Enter a valid charge amount (0 or greater)"
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
      amount: form.amount.trim(),
      direction: form.direction,
      date: form.date.trim(),
      mode: form.mode.trim(),
      bank_account_id: isBankRouted ? form.bank_account_id.trim() : "",
      reference_number: form.reference_number.trim(),
      mode_reference_number: isCash ? "" : form.mode_reference_number.trim(),
      transaction_charges: isWithdraw
        ? form.transaction_charges.trim()
        : isCash
          ? ""
          : form.transaction_charges.trim(),
    })
  }

  const enteredAmount = Number(form.amount)
  const previewValid =
    Number.isFinite(enteredAmount) &&
    enteredAmount > 0 &&
    (form.direction !== "withdraw" || enteredAmount <= summary.total_amount)
  const previewNewBalance = previewValid
    ? summary.total_amount + (form.direction === "deposit" ? enteredAmount : -enteredAmount)
    : null

  const directionBtnBase =
    "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"

  const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      <div className="rounded-lg border border-[#f08c2b]/20 bg-[#f08c2b]/5 p-3 text-sm">
        <p className="font-medium text-gray-900">{summary.bank_name}</p>
        <p className="font-mono text-xs text-gray-600">{summary.bank_account_number}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {summary.branch_name ? (
            <>
              <span>Branch</span>
              <span className="text-right text-gray-700">{summary.branch_name}</span>
            </>
          ) : null}
          <span>Current balance</span>
          <span className="text-right font-medium text-gray-900">
            {formatCurrency(summary.total_amount)}
          </span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Direction</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set("direction", "deposit")}
            disabled={disabled}
            className={`${directionBtnBase} ${
              form.direction === "deposit"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Deposit
          </button>
          <button
            type="button"
            onClick={() => set("direction", "withdraw")}
            disabled={disabled}
            className={`${directionBtnBase} ${
              form.direction === "withdraw"
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={amountInputRef}
            type="number"
            min={0}
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
            {form.direction === "deposit"
              ? "Will be added to the current balance."
              : `Will be subtracted from the current balance. Max ${formatCurrency(summary.total_amount)}.`}
          </p>
        )}
        {previewNewBalance !== null ? (
          <p
            className={`mt-1 text-xs ${
              form.direction === "deposit" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            New balance: {formatCurrency(previewNewBalance)}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Reference number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className={plainInputClass(!!errors.reference_number)}
          value={form.reference_number}
          onChange={(ev) => set("reference_number", ev.target.value)}
          placeholder="e.g. transaction id"
          disabled={disabled}
          autoComplete="off"
        />
        {errors.reference_number ? (
          <p className="mt-1 text-xs text-red-600">{errors.reference_number}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Required for every balance update.
          </p>
        )}
      </div>

      {isWithdraw ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Transaction charges</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={plainInputClass(!!errors.transaction_charges)}
            value={form.transaction_charges}
            onChange={(ev) => set("transaction_charges", ev.target.value)}
            placeholder="0"
            disabled={disabled}
          />
          {errors.transaction_charges ? (
            <p className="mt-1 text-xs text-red-600">{errors.transaction_charges}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Optional fees for this withdrawal.
            </p>
          )}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Date <span className="text-red-500">*</span>
        </label>
        <div className={`${disabled ? "pointer-events-none opacity-60" : ""} ${selectWrap(!!errors.date)}`}>
          <ReeveDatePicker
            key={form.date || "empty-date"}
            value={form.date}
            onChange={(v) => set("date", v)}
            placeholder="Select date"
          />
        </div>
        {errors.date ? <p className="mt-1 text-xs text-red-600">{errors.date}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {form.direction === "deposit" ? "Transfer from" : "Transfer to"}{" "}
          <span className="text-red-500">*</span>
        </label>
        <div className={`${selectWrap(!!errors.mode)} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          <StyledSelect
            value={form.mode}
            onChange={(v) => set("mode", v)}
            placeholder={
              form.direction === "deposit" ? "Select transfer from" : "Select transfer to"
            }
            options={PAYMENT_MODE_OPTIONS}
          />
        </div>
        {errors.mode ? <p className="mt-1 text-xs text-red-600">{errors.mode}</p> : null}
      </div>

      {isBankRouted ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank account <span className="text-red-500">*</span>
          </label>
          <div
            className={`${selectWrap(!!errors.bank_account_id)} ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <StyledSelect
              value={form.bank_account_id}
              onChange={(v) => set("bank_account_id", v)}
              placeholder={
                selectableBankAccounts.length
                  ? "Select bank account"
                  : "No other branch bank accounts"
              }
              options={selectableBankAccounts.map((account) => ({
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

      {showDepositModeCharges ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Transaction charges</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={plainInputClass(!!errors.transaction_charges)}
              value={form.transaction_charges}
              onChange={(ev) => set("transaction_charges", ev.target.value)}
              placeholder="0"
              disabled={disabled}
            />
            {errors.transaction_charges ? (
              <p className="mt-1 text-xs text-red-600">{errors.transaction_charges}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Optional fees for {form.mode} payments.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Mode reference number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={plainInputClass(!!errors.mode_reference_number)}
              value={form.mode_reference_number}
              onChange={(ev) => set("mode_reference_number", ev.target.value)}
              placeholder="e.g. transaction id"
              disabled={disabled}
              autoComplete="off"
            />
            {errors.mode_reference_number ? (
              <p className="mt-1 text-xs text-red-600">{errors.mode_reference_number}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Required for {form.mode} payments.</p>
            )}
          </div>
        </div>
      ) : null}

      {isWithdraw && !isCash ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Mode reference number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={plainInputClass(!!errors.mode_reference_number)}
            value={form.mode_reference_number}
            onChange={(ev) => set("mode_reference_number", ev.target.value)}
            placeholder="e.g. transaction id"
            disabled={disabled}
            autoComplete="off"
          />
          {errors.mode_reference_number ? (
            <p className="mt-1 text-xs text-red-600">{errors.mode_reference_number}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Required for {form.mode} payments.</p>
          )}
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
          {loading ? "Saving…" : "Update balance"}
        </Button>
      </div>
    </form>
  )
}
