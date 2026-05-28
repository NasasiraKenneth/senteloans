"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"

export interface ActivateFormData {
  principalAmount: number
  transactionMode: string
  periodValue: number
  periodUnit: "months" | "years"
  startDate: string
  endDate: string
  description: string
}

interface ActivateFormProps {
  initialValues: ActivateFormData
  onClose: () => void
  onSubmit: (data: ActivateFormData) => Promise<void> | void
  loading?: boolean
}

const toYmd = (value: unknown): string => {
  if (!value) return ""
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default function ActivateForm({ initialValues, onClose, onSubmit, loading = false }: ActivateFormProps) {
  const [form, setForm] = useState<ActivateFormData>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(initialValues)
    setErrors({})
  }, [initialValues])

  useEffect(() => {
    const startDate = String(form.startDate || "").trim()
    const periodValue = Number(form.periodValue || 0)
    const periodUnit = form.periodUnit
    if (!startDate || !(periodValue > 0)) return

    const base = new Date(`${startDate}T00:00:00`)
    if (Number.isNaN(base.getTime())) return
    const maturity = new Date(base)
    if (periodUnit === "years") maturity.setFullYear(maturity.getFullYear() + periodValue)
    else maturity.setMonth(maturity.getMonth() + periodValue)

    const nextEndDate = toYmd(maturity)
    if (!nextEndDate || nextEndDate === form.endDate) return
    setForm((prev) => ({ ...prev, endDate: nextEndDate }))
  }, [form.startDate, form.periodValue, form.periodUnit, form.endDate])

  const modeOptions = useMemo(
    () => [
      { value: "Cash", label: "Cash" },
      { value: "Mobile Money", label: "Mobile Money" },
      { value: "Bank Transfer", label: "Bank Transfer" },
      { value: "Cheque", label: "Cheque" },
      { value: "Card", label: "Card" },
    ],
    [],
  )

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!form.transactionMode) nextErrors.transactionMode = "Transaction mode is required"
    if (!form.startDate) nextErrors.startDate = "Start date is required"
    if (!form.endDate) nextErrors.endDate = "End date is required"
    if (!(Number(form.periodValue || 0) > 0)) nextErrors.periodValue = "Period value must be greater than zero"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    await onSubmit(form)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Principal amount</Label>
        <input
          disabled
          value={Math.round(Number(form.principalAmount || 0)).toLocaleString()}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-600"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Transaction mode</Label>
        <StyledSelect
          value={form.transactionMode}
          onChange={(value) => {
            setForm((prev) => ({ ...prev, transactionMode: value }))
            setErrors((prev) => ({ ...prev, transactionMode: "" }))
          }}
          options={modeOptions}
          placeholder="Select mode"
        />
        {errors.transactionMode ? <p className="text-xs text-red-600">{errors.transactionMode}</p> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Period unit</Label>
          <div className="pointer-events-none opacity-70">
            <StyledSelect
              value={form.periodUnit}
              onChange={() => {}}
              options={[
                { value: "months", label: "Months" },
                { value: "years", label: "Years" },
              ]}
              placeholder="Select unit"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Period value</Label>
          <input
            type="number"
            min={1}
            value={form.periodValue || ""}
            disabled
            onChange={() => {}}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-600"
          />
          {errors.periodValue ? <p className="text-xs text-red-600">{errors.periodValue}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <ReeveDatePicker
            value={form.startDate}
            onChange={(value) => {
              setForm((prev) => ({ ...prev, startDate: value }))
              setErrors((prev) => ({ ...prev, startDate: "" }))
            }}
          />
          {errors.startDate ? <p className="text-xs text-red-600">{errors.startDate}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>End date</Label>
          <ReeveDatePicker value={form.endDate} onChange={(value) => setForm((prev) => ({ ...prev, endDate: value }))} />
          {errors.endDate ? <p className="text-xs text-red-600">{errors.endDate}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md"
          placeholder="Transaction description"
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? "Saving..." : "Start Development"}
        </Button>
      </div>
    </div>
  )
}
