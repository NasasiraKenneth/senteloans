"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "../../utils"

export type BankAmountDirection = "deposit" | "withdraw"

export type BankAmountFormData = {
  amount: string
  direction: BankAmountDirection
}

export type BankAmountSummary = {
  bank_name: string
  bank_account_number: string
  branch_name: string
  total_amount: number
}

interface BankAmountFormProps {
  onSubmit: (data: BankAmountFormData) => void
  onCancel: () => void
  loading?: boolean
  summary: BankAmountSummary
  formDisabled?: boolean
}

const defaultValues: BankAmountFormData = {
  amount: "",
  direction: "deposit",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function BankAmountForm({
  onSubmit,
  onCancel,
  loading = false,
  summary,
  formDisabled = false,
}: BankAmountFormProps) {
  const [form, setForm] = useState<BankAmountFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof BankAmountFormData, string>>>({})
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

  const set = <K extends keyof BankAmountFormData>(field: K, value: BankAmountFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
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
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({ amount: form.amount.trim(), direction: form.direction })
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
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
