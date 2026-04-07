"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import ReeveDatePicker, { parseDateOnly, toDateOnlyString } from "@/components/newUI/date_picker"
import StyledSelect from "@/components/newUI/styled_select"

export type SaccoRecordPaymentFormData = {
  amount: number
  payment_date: string
  payment_mode: string
  next_payment_date?: string
}

interface RecordPaymentFormProps {
  onSubmit: (data: SaccoRecordPaymentFormData) => Promise<void> | void
  onCancel: () => void
  isOpen?: boolean
  loading?: boolean
  initialAmount?: string
  initialDate?: string
  initialNextPaymentDate?: string
}

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const normalizeDateOnly = (value: string): string => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const sliced = raw.slice(0, 10)
  if (parseDateOnly(sliced)) return sliced

  // Supports DB/display formats like "7 May 2026" or "07 May 2026".
  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw)
  if (named) {
    const day = Number(named[1])
    const monthName = named[2].toLowerCase()
    const year = Number(named[3])
    const monthMap: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    }
    const month = monthMap[monthName]
    if (Number.isInteger(month) && day > 0 && year > 0) {
      return toDateOnlyString(new Date(year, month, day, 12, 0, 0))
    }
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return toDateOnlyString(d)
}

export default function RecordPaymentForm({
  onSubmit,
  onCancel,
  isOpen = false,
  loading = false,
  initialAmount = "",
  initialDate = new Date().toISOString().slice(0, 10),
  initialNextPaymentDate = "",
}: RecordPaymentFormProps) {
  const [amount, setAmount] = useState(initialAmount)
  const [paymentDate, setPaymentDate] = useState(initialDate)
  const [paymentMode, setPaymentMode] = useState("Cash")
  const computedNextPaymentDate = useMemo(() => {
    const base = normalizeDateOnly(initialNextPaymentDate)
    const d = parseDateOnly(base)
    if (!d) return ""
    const next = new Date(d)
    next.setMonth(next.getMonth() + 1)
    return toDateOnlyString(next)
  }, [initialNextPaymentDate])
  const [nextPaymentDate, setNextPaymentDate] = useState(computedNextPaymentDate)

  useEffect(() => {
    setNextPaymentDate(computedNextPaymentDate)
  }, [computedNextPaymentDate])

  useEffect(() => {
    if (isOpen) setNextPaymentDate(computedNextPaymentDate)
  }, [isOpen, computedNextPaymentDate])

  const amountNumber = Number(amount)
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0
  const paymentModeOptions = [
    { value: "Cash", label: "Cash" },
    { value: "Mobile Money", label: "Mobile Money" },
    { value: "Bank Transfer", label: "Bank Transfer" },
    { value: "Cheque", label: "Cheque" },
    { value: "Card", label: "Card" },
  ]

  const handleSubmit = async () => {
    if (invalidAmount) return
    await onSubmit({
      amount: amountNumber,
      payment_date: paymentDate,
      payment_mode: paymentMode,
      next_payment_date: nextPaymentDate,
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <Label htmlFor="sacco-record-payment-amount" className="mb-2 block">
          Amount (UGX)
        </Label>
        <input
          id="sacco-record-payment-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={inputClass(invalidAmount && amount.length > 0)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Payment date</Label>
        <ReeveDatePicker
          value={paymentDate}
          onChange={setPaymentDate}
          placeholder="Select payment date"
        />
      </div>

      <div>
        <Label className="mb-2 block">Payment mode</Label>
        <StyledSelect
          value={paymentMode}
          onChange={setPaymentMode}
          placeholder="Select payment mode"
          options={paymentModeOptions}
        />
      </div>

      <div>
        <Label className="mb-2 block">Next payment date</Label>
        <ReeveDatePicker
          value={nextPaymentDate}
          onChange={setNextPaymentDate}
          placeholder="Select next payment date"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidAmount}>
          {loading ? "Recording..." : "Record payment"}
        </Button>
      </div>
    </div>
  )
}
