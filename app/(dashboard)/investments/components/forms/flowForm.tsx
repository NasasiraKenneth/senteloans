"use client"

import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"

export type CashflowDirection = "inflow" | "outflow"
export type CashflowCategory = "capital" | "income" | "expense" | "adjustment"

export interface FlowFormData {
  type: CashflowDirection | ""
  category: CashflowCategory | ""
  amount: number
  description: string
  /** Business date (maps to `date` column); empty string if not set */
  date: string
  /** Optional payment / transaction mode (select); empty string if not set */
  transactionMode: string
  /** Optional link to `senteloans_transactions` */
  transactionId: string
  /** Optional link to `senteloans_investment_reports` */
  reportId: string
}

const DIRECTION_OPTIONS = [
  { value: "inflow", label: "Inflow" },
  { value: "outflow", label: "Outflow" },
]

const CATEGORY_OPTIONS = [
  { value: "capital", label: "Capital" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "adjustment", label: "Adjustment" },
]

const TRANSACTION_MODE_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export function emptyFlowForm(): FlowFormData {
  return {
    type: "",
    category: "",
    amount: 0,
    description: "",
    date: "",
    transactionMode: "",
    transactionId: "",
    reportId: "",
  }
}

export function validateFlowForm(
  data: FlowFormData,
  opts?: { requireDate?: boolean },
): Record<string, string> {
  const err: Record<string, string> = {}
  if (!data.type) err.type = "Select inflow or outflow"
  if (!data.category) err.category = "Select a category"
  const requireDate = opts?.requireDate !== false
  if (requireDate && !String(data.date || "").trim()) err.date = "Select a cashflow date"
  if (Number.isNaN(data.amount) || data.amount <= 0) err.amount = "Amount must be greater than zero"
  return err
}

interface FlowFormProps {
  value: FlowFormData
  onChange: (patch: Partial<FlowFormData>) => void
  disabled?: boolean
  /** Show cashflow date beside transaction mode (required when visible; use validateFlowForm(data, { requireDate: false }) if false). */
  showCashflowDate?: boolean
  /** Show optional transaction / report UUID fields (schema links). Default true. */
  showReferenceIds?: boolean
  errors?: Partial<Record<keyof FlowFormData | "root", string>>
}

export default function FlowForm({
  value,
  onChange,
  disabled = false,
  showCashflowDate = true,
  showReferenceIds = true,
  errors = {},
}: FlowFormProps) {
  const transactionModeDisabled = disabled || value.category === "adjustment"

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.type}
              onChange={(v) => onChange({ type: v as CashflowDirection })}
              options={DIRECTION_OPTIONS}
              placeholder="Select type"
            />
          </div>
          {errors.type && <p className="text-xs text-red-600">{errors.type}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.category}
              onChange={(v) => onChange({ category: v as CashflowCategory })}
              options={CATEGORY_OPTIONS}
              placeholder="Select category"
            />
          </div>
          {errors.category && <p className="text-xs text-red-600">{errors.category}</p>}
        </div>
      </div>

      {showCashflowDate ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cashflow date *</Label>
            <div className={disabled ? "pointer-events-none opacity-70" : ""}>
              <ReeveDatePicker
                value={value.date}
                onChange={(d) => onChange({ date: d })}
                placeholder="Select date"
              />
            </div>
            {errors.date && <p className="text-xs text-red-600">{errors.date}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Transaction mode (optional)</Label>
            <div className={transactionModeDisabled ? "pointer-events-none opacity-70" : ""}>
              <StyledSelect
                value={value.transactionMode}
                onChange={(v) => onChange({ transactionMode: v })}
                options={TRANSACTION_MODE_OPTIONS}
                placeholder="Select transaction mode"
              />
            </div>
            {errors.transactionMode && <p className="text-xs text-red-600">{errors.transactionMode}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Transaction mode (optional)</Label>
          <div className={transactionModeDisabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.transactionMode}
              onChange={(v) => onChange({ transactionMode: v })}
              options={TRANSACTION_MODE_OPTIONS}
              placeholder="Select transaction mode"
            />
          </div>
          {errors.transactionMode && <p className="text-xs text-red-600">{errors.transactionMode}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Amount *</Label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value.amount || ""}
          onChange={(e) => onChange({ amount: Number(e.target.value || 0) })}
          placeholder="0"
          className={inputClass}
          disabled={disabled}
        />
        {errors.amount && <p className="text-xs text-red-600">{errors.amount}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Optional notes"
          className={inputClass}
          disabled={disabled}
        />
        {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
      </div>

      {showReferenceIds && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Transaction ID</Label>
            <input
              type="text"
              value={value.transactionId}
              onChange={(e) => onChange({ transactionId: e.target.value.trim() })}
              placeholder="Optional UUID"
              className={`${inputClass} font-mono text-xs`}
              disabled={disabled}
            />
            {errors.transactionId && <p className="text-xs text-red-600">{errors.transactionId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Report ID</Label>
            <input
              type="text"
              value={value.reportId}
              onChange={(e) => onChange({ reportId: e.target.value.trim() })}
              placeholder="Optional UUID"
              className={`${inputClass} font-mono text-xs`}
              disabled={disabled}
            />
            {errors.reportId && <p className="text-xs text-red-600">{errors.reportId}</p>}
          </div>
        </div>
      )}

      {errors.root && <p className="text-xs text-red-600">{errors.root}</p>}
    </div>
  )
}
