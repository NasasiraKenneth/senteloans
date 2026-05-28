"use client"

import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"

export interface ReportFormData {
  reportMonth: string
  reportYear: number
  openingValue: number
  income: number
  expenses: number
  closingValue: number
  notes: string
}

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

const MONTH_OPTIONS = [
  { value: "january", label: "January" },
  { value: "february", label: "February" },
  { value: "march", label: "March" },
  { value: "april", label: "April" },
  { value: "may", label: "May" },
  { value: "june", label: "June" },
  { value: "july", label: "July" },
  { value: "august", label: "August" },
  { value: "september", label: "September" },
  { value: "october", label: "October" },
  { value: "november", label: "November" },
  { value: "december", label: "December" },
]

export function emptyReportForm(): ReportFormData {
  const currentYear = new Date().getFullYear()
  return {
    reportMonth: "",
    reportYear: currentYear,
    openingValue: 0,
    income: 0,
    expenses: 0,
    closingValue: 0,
    notes: "",
  }
}

export function buildReportPeriod(data: Pick<ReportFormData, "reportMonth" | "reportYear">): string {
  const month = String(data.reportMonth || "").trim().toLowerCase()
  const year = Number(data.reportYear || 0)
  if (!month || !Number.isInteger(year) || year < 1900) return ""
  return `${month}-${year}`
}

export interface ReportComputedTotals {
  capitalInflow?: number
  capitalOutflow?: number
  adjustmentInflow?: number
  adjustmentOutflow?: number
}

export function computeClosingValue(
  data: Pick<ReportFormData, "openingValue" | "income" | "expenses">,
  opts?: ReportComputedTotals,
): number {
  const capitalInflow = Number(opts?.capitalInflow || 0)
  const capitalOutflow = Number(opts?.capitalOutflow || 0)
  const adjInflow = Number(opts?.adjustmentInflow || 0)
  const adjOutflow = Number(opts?.adjustmentOutflow || 0)
  const closing =
    Number(data.openingValue || 0) +
    capitalInflow -
    capitalOutflow +
    Number(data.income || 0) -
    Number(data.expenses || 0) +
    adjInflow -
    adjOutflow
  return Number.isFinite(closing) ? closing : 0
}

export function validateReportForm(
  data: ReportFormData,
  opts?: ReportComputedTotals,
): Record<string, string> {
  const err: Record<string, string> = {}
  if (!String(data.reportMonth || "").trim()) err.reportMonth = "Report month is required"
  const year = Number(data.reportYear || 0)
  if (!Number.isInteger(year) || year < 1900 || year > 9999) err.reportYear = "Enter a valid year"

  const opening = Number(data.openingValue || 0)
  const income = Number(data.income || 0)
  const expenses = Number(data.expenses || 0)
  const closing = Number(data.closingValue || 0)
  const expected = computeClosingValue(
    { openingValue: opening, income, expenses },
    opts,
  )

  if (Number.isNaN(opening) || opening < 0) err.openingValue = "Opening value must be 0 or greater"
  if (Number.isNaN(income) || income < 0) err.income = "Income must be 0 or greater"
  if (Number.isNaN(expenses) || expenses < 0) err.expenses = "Expenses must be 0 or greater"
  if (Number.isNaN(closing) || closing < 0) err.closingValue = "Closing value must be 0 or greater"
  if (!Number.isNaN(closing) && !Number.isNaN(expected) && Math.abs(closing - expected) > 0.01) {
    err.closingValue =
      "Closing must equal opening + capital inflow − capital outflow + income − expenses + adj. inflow − adj. outflow"
  }

  return err
}

interface ReportsFormProps {
  value: ReportFormData
  onChange: (patch: Partial<ReportFormData>) => void
  disabled?: boolean
  errors?: Partial<Record<keyof ReportFormData | "root", string>>
  capitalInflow?: number
  capitalOutflow?: number
  adjustmentInflow?: number
  adjustmentOutflow?: number
}

const formatUgx = (v: number) =>
  Number(v || 0).toLocaleString("en-UG", { maximumFractionDigits: 2 })

export default function ReportsForm({
  value,
  onChange,
  disabled = false,
  errors = {},
  capitalInflow = 0,
  capitalOutflow = 0,
  adjustmentInflow = 0,
  adjustmentOutflow = 0,
}: ReportsFormProps) {
  const expected = computeClosingValue(value, {
    capitalInflow,
    capitalOutflow,
    adjustmentInflow,
    adjustmentOutflow,
  })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Report Month *</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.reportMonth}
              onChange={(v) => onChange({ reportMonth: v })}
              options={MONTH_OPTIONS}
              placeholder="Select month"
              searchable
            />
          </div>
          {errors.reportMonth && <p className="text-xs text-red-600">{errors.reportMonth}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Report Year *</Label>
          <input
            type="number"
            min={1900}
            max={9999}
            step={1}
            value={value.reportYear || ""}
            onChange={(e) => onChange({ reportYear: Number(e.target.value || 0) })}
            placeholder="e.g. 2026"
            className={inputClass}
            disabled
          />
          {errors.reportYear && <p className="text-xs text-red-600">{errors.reportYear}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Report period: {buildReportPeriod(value) || "—"}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Opening Value *</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.openingValue || ""}
            onChange={(e) => onChange({ openingValue: Number(e.target.value || 0) })}
            placeholder="0"
            className={inputClass}
            disabled={disabled}
          />
          {errors.openingValue && <p className="text-xs text-red-600">{errors.openingValue}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Income *</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.income || ""}
            onChange={(e) => onChange({ income: Number(e.target.value || 0) })}
            placeholder="0"
            className={inputClass}
            disabled={disabled}
          />
          {errors.income && <p className="text-xs text-red-600">{errors.income}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Expenses *</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.expenses || ""}
            onChange={(e) => onChange({ expenses: Number(e.target.value || 0) })}
            placeholder="0"
            className={inputClass}
            disabled={disabled}
          />
          {errors.expenses && <p className="text-xs text-red-600">{errors.expenses}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-xs text-gray-700">
        <p className="font-semibold uppercase tracking-wide text-[10px] text-gray-500">From selected cashflows</p>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          <span>Capital inflow: <span className="font-mono tabular-nums">{formatUgx(capitalInflow)}</span></span>
          <span>Capital outflow: <span className="font-mono tabular-nums">{formatUgx(capitalOutflow)}</span></span>
          <span>Adj. inflow: <span className="font-mono tabular-nums">{formatUgx(adjustmentInflow)}</span></span>
          <span>Adj. outflow: <span className="font-mono tabular-nums">{formatUgx(adjustmentOutflow)}</span></span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Closing Value *</Label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value.closingValue || ""}
          onChange={(e) => onChange({ closingValue: Number(e.target.value || 0) })}
          placeholder="0"
          className={inputClass}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Expected: <span className="font-mono tabular-nums">{formatUgx(expected)}</span>
        </p>
        {errors.closingValue && <p className="text-xs text-red-600">{errors.closingValue}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Optional report notes"
          className={inputClass}
          disabled={disabled}
        />
        {errors.notes && <p className="text-xs text-red-600">{errors.notes}</p>}
      </div>

      {errors.root && <p className="text-xs text-red-600">{errors.root}</p>}
    </div>
  )
}
