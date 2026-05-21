"use client"

import { useEffect, useRef, useState } from "react"
import { Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "../../utils"

export type GrantAmountFormData = {
  amount: string
}

export type GrantAmountSummary = {
  client_name: string
  total_amount: number
  available_balance: number
  remaining_amount: number
  percentage_received: number
}

interface GrantAmountFormProps {
  onSubmit: (data: GrantAmountFormData) => void
  onCancel: () => void
  loading?: boolean
  summary: GrantAmountSummary
  formDisabled?: boolean
}

const defaultValues: GrantAmountFormData = {
  amount: "",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function GrantAmountForm({
  onSubmit,
  onCancel,
  loading = false,
  summary,
  formDisabled = false,
}: GrantAmountFormProps) {
  const [form, setForm] = useState<GrantAmountFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof GrantAmountFormData, string>>>({})
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

  const set = (field: keyof GrantAmountFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
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
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({ amount: form.amount.trim() })
  }

  const enteredAmount = Number(form.amount)
  const previewValid = Number.isFinite(enteredAmount) && enteredAmount > 0 && enteredAmount <= summary.remaining_amount
  const previewNewReceived = previewValid ? summary.available_balance + enteredAmount : null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border border-[#f08c2b]/20 bg-[#f08c2b]/5 p-3 text-sm">
        <p className="font-medium text-gray-900">{summary.client_name}</p>
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
