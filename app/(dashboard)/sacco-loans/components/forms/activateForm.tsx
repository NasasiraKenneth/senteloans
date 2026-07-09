"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker, { parseDateOnly, toDateOnlyString } from "@/components/newUI/date_picker"

export type ActivateFormData = {
  next_payment_date: string
  maturity_date: string
  monthly_payment: number
}

interface ActivateFormProps {
  onSubmit: (data: ActivateFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  /** Remaining tenure months used to compute maturity from next payment date. */
  remainingTenureMonths: number
  initialNextPaymentDate?: string
  initialMonthlyPayment?: number
}

const STATUS_OPTIONS = [{ value: "Active", label: "Active" }]

function addCalendarMonths(isoDate: string, months: number): string {
  const d = parseDateOnly(isoDate)
  if (!d || !Number.isFinite(months) || months < 0) return ""
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  const out = new Date(y, m + months, day, 12, 0, 0)
  return toDateOnlyString(out)
}

function formatDisplayDate(iso: string) {
  if (!iso) return "—"
  const d = parseDateOnly(iso)
  if (!d) return "—"
  return d.toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" })
}

const inputReadOnlyClass =
  "w-full px-3 py-2.5 text-sm border rounded-md border-gray-300 bg-gray-50 text-gray-800 cursor-not-allowed"

export default function ActivateForm({
  onSubmit,
  onCancel,
  loading = false,
  remainingTenureMonths,
  initialNextPaymentDate = "",
  initialMonthlyPayment = 0,
}: ActivateFormProps) {
  const [nextPaymentDate, setNextPaymentDate] = useState(initialNextPaymentDate)
  const [monthlyPayment, setMonthlyPayment] = useState(
    initialMonthlyPayment > 0 ? String(initialMonthlyPayment) : "",
  )
  const [submitAttempted, setSubmitAttempted] = useState(false)

  useEffect(() => {
    setNextPaymentDate(initialNextPaymentDate)
  }, [initialNextPaymentDate])

  useEffect(() => {
    setMonthlyPayment(initialMonthlyPayment > 0 ? String(initialMonthlyPayment) : "")
  }, [initialMonthlyPayment])

  const maturityDate = useMemo(
    () =>
      nextPaymentDate.trim()
        ? addCalendarMonths(nextPaymentDate.trim(), remainingTenureMonths)
        : "",
    [nextPaymentDate, remainingTenureMonths],
  )

  const parsedNext = parseDateOnly(nextPaymentDate)
  const invalidNext = !nextPaymentDate.trim() || parsedNext === null
  const monthlyPaymentNumber = Number(monthlyPayment)
  const invalidMonthlyPayment = !Number.isFinite(monthlyPaymentNumber) || monthlyPaymentNumber <= 0
  const nextError = invalidNext ? "Next payment date is required." : ""
  const monthlyPaymentError = invalidMonthlyPayment ? "Monthly payment must be greater than 0." : ""
  const showNextErr = submitAttempted && Boolean(nextError)
  const showMonthlyErr = submitAttempted && Boolean(monthlyPaymentError)

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    if (invalidNext || invalidMonthlyPayment || !maturityDate) return
    await onSubmit({
      next_payment_date: nextPaymentDate.trim(),
      maturity_date: maturityDate,
      monthly_payment: monthlyPaymentNumber,
    })
  }

  const handleCancel = () => {
    setSubmitAttempted(false)
    onCancel()
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <Label className="mb-2 block">Status</Label>
        <div className="pointer-events-none opacity-90">
          <StyledSelect
            value="Active"
            onChange={() => {}}
            placeholder="Status"
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Next payment date</Label>
        <div className={showNextErr ? "rounded-md ring-2 ring-red-500 ring-offset-0" : ""}>
          <ReeveDatePicker
            value={nextPaymentDate}
            onChange={setNextPaymentDate}
            placeholder="Select next payment date"
          />
        </div>
        {showNextErr ? <p className="mt-1 text-xs text-red-500">{nextError}</p> : null}
      </div>

      <div>
        <Label htmlFor="sacco-activate-monthly-payment" className="mb-2 block">
          Monthly payment (UGX)
        </Label>
        <input
          id="sacco-activate-monthly-payment"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={monthlyPayment}
          onChange={(e) => setMonthlyPayment(e.target.value)}
          className={`w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
            showMonthlyErr ? "border-red-500" : "border-gray-300 hover:border-gray-400"
          }`}
        />
        {showMonthlyErr ? <p className="mt-1 text-xs text-red-500">{monthlyPaymentError}</p> : null}
      </div>

      <div>
        <Label htmlFor="sacco-activate-maturity-display" className="mb-2 block">
          Maturity date
        </Label>
        <input
          id="sacco-activate-maturity-display"
          type="text"
          readOnly
          tabIndex={-1}
          className={inputReadOnlyClass}
          value={maturityDate ? formatDisplayDate(maturityDate) : "—"}
          aria-readonly
        />
        <p className="mt-1 text-xs text-gray-500">
          From next payment date plus {remainingTenureMonths} remaining month
          {remainingTenureMonths === 1 ? "" : "s"} (read-only).
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? "Activating..." : "Activate loan"}
        </Button>
      </div>
    </div>
  )
}
