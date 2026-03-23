"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"

export type RecordPaymentFormData = {
  amount: number
  payment_date: string
  mode: string
}

interface RecordFormProps {
  onSubmit: (data: RecordPaymentFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  initialAmount?: string
  initialDate?: string
  initialMode?: string
}

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

export default function RecordForm({
  onSubmit,
  onCancel,
  loading = false,
  initialAmount = "",
  initialDate = new Date().toISOString().slice(0, 10),
  initialMode = "Cash",
}: RecordFormProps) {
  const [amount, setAmount] = useState(initialAmount)
  const [paymentDate, setPaymentDate] = useState(initialDate)
  const [mode, setMode] = useState(initialMode)

  const modeOptions = useMemo(() => PAYMENT_MODES.map((m) => ({ value: m, label: m })), [])
  const amountNumber = Number(amount)
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0

  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  const handleSubmit = async () => {
    if (invalidAmount) return
    await onSubmit({
      amount: amountNumber,
      payment_date: paymentDate,
      mode,
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <Label htmlFor="record-payment-amount" className="mb-2 block">
          Amount (UGX)
        </Label>
        <input
          id="record-payment-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={productStyleInputClass(invalidAmount && amount.length > 0)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">
          Payment Date
        </Label>
        <ReeveDatePicker
          value={paymentDate}
          onChange={setPaymentDate}
          placeholder="Select payment date"
        />
      </div>

      <div>
        <Label className="mb-2 block">Payment Mode</Label>
        <StyledSelect
          value={mode}
          onChange={setMode}
          placeholder="Choose payment mode"
          options={modeOptions}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidAmount}>
          {loading ? "Recording..." : "Record Payment"}
        </Button>
      </div>
    </div>
  )
}
