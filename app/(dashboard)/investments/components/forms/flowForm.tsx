"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type CashflowDirection = "inflow" | "outflow"
export type CashflowCategory = "capital" | "income" | "expense" | "adjustment"

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

export interface FlowFormData {
  type: CashflowDirection | ""
  category: CashflowCategory | ""
  amount: number
  previousValue: number
  currentValue: number
  description: string
  /** Business date (maps to `date` column); empty string if not set */
  date: string
  /** Payment mode; required when category is not adjustment */
  transactionMode: string
  bankAccountId: string
  referenceNumber: string
  /** Optional fees for non-cash modes; 0 when unset */
  transactionCharges: number
  /** Optional link to `senteloans_transactions` */
  transactionId: string
  /** Optional link to `senteloans_investment_reports` */
  reportId: string
}

const DIRECTION_OPTIONS = [
  { value: "inflow", label: "Inflow" },
  { value: "outflow", label: "Outflow" },
]

const CATEGORY_OPTIONS_ALL = [
  { value: "capital", label: "Capital" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "adjustment", label: "Adjustment" },
]

export function emptyFlowForm(): FlowFormData {
  return {
    type: "",
    category: "",
    amount: 0,
    previousValue: 0,
    currentValue: 0,
    description: "",
    date: "",
    transactionMode: "",
    bankAccountId: "",
    referenceNumber: "",
    transactionCharges: 0,
    transactionId: "",
    reportId: "",
  }
}

function clearPaymentFields(): Partial<FlowFormData> {
  return {
    transactionMode: "",
    bankAccountId: "",
    referenceNumber: "",
    transactionCharges: 0,
  }
}

/** Income inflows and capital outflows do not collect transaction charges. */
export function allowsTransactionCharges(
  type: CashflowDirection | "",
  category: CashflowCategory | "",
): boolean {
  if (!type || !category || category === "adjustment") return false
  if (category === "income") return false
  if (type === "outflow" && category === "capital") return false
  return true
}

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export function validateFlowForm(
  data: FlowFormData,
  opts?: { requireDate?: boolean },
): Record<string, string> {
  const err: Record<string, string> = {}
  if (!data.type) err.type = "Select inflow or outflow"
  if (!data.category) err.category = "Select a category"
  const requireDate = opts?.requireDate !== false
  if (requireDate && !String(data.date || "").trim()) err.date = "Select a cashflow date"

  if (data.category === "adjustment") {
    if (Number.isNaN(data.currentValue) || data.currentValue < 0) {
      err.currentValue = "Current value must be zero or greater"
    }
    if (data.type === "inflow" && !(data.currentValue > data.previousValue)) {
      err.currentValue = "Current value must be greater than previous value for inflow"
    }
    if (data.type === "outflow" && !(data.currentValue < data.previousValue)) {
      err.currentValue = "Current value must be less than previous value for outflow"
    }
  } else {
    if (Number.isNaN(data.amount) || data.amount <= 0) {
      err.amount = "Amount must be greater than zero"
    }
    if (!data.transactionMode) {
      err.transactionMode = "Select a transaction mode"
    } else {
      const isCash = data.transactionMode === "Cash"
      if (!isCash && !String(data.referenceNumber || "").trim()) {
        err.referenceNumber = `Reference number is required for ${data.transactionMode} payments`
      }
      if (isBankRoutedPaymentMode(data.transactionMode) && !String(data.bankAccountId || "").trim()) {
        err.bankAccountId = "Please select a bank account"
      }
      if (isCash && Number(data.transactionCharges || 0) > 0) {
        err.transactionCharges = "Transaction charges are not allowed for cash payments"
      }
      const charges = Number(data.transactionCharges || 0)
      const showCharges = allowsTransactionCharges(data.type, data.category)
      if (
        showCharges &&
        !isCash &&
        data.transactionCharges != null &&
        Number.isFinite(charges) &&
        charges < 0
      ) {
        err.transactionCharges = "Transaction charges must be zero or greater"
      }
      if (!showCharges && charges > 0) {
        err.transactionCharges = "Transaction charges are not allowed for this cashflow type"
      }
    }
  }

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
  previousAdjustmentValue?: number
}

export default function FlowForm({
  value,
  onChange,
  disabled = false,
  showCashflowDate = true,
  showReferenceIds = true,
  errors = {},
  previousAdjustmentValue,
}: FlowFormProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [transactionChargesInput, setTransactionChargesInput] = useState("")

  const isAdjustment = value.category === "adjustment"
  const isCashMode = value.transactionMode === "Cash"
  const isBankRoutedMode = isBankRoutedPaymentMode(value.transactionMode)
  const showPaymentFields = !isAdjustment
  const showChargesField = showPaymentFields && allowsTransactionCharges(value.type, value.category)
  const previousValue = Number.isFinite(previousAdjustmentValue)
    ? Number(previousAdjustmentValue)
    : Number(value.previousValue || 0)

  const chargesNumber = transactionChargesInput.trim() === "" ? 0 : Number(transactionChargesInput)
  const invalidCharges =
    !isCashMode &&
    transactionChargesInput.trim() !== "" &&
    (!Number.isFinite(chargesNumber) || chargesNumber < 0)

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch("/api/institution/finances/bank-accounts?rowsPerPage=100", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          rows?: BankAccount[]
          items?: BankAccount[]
          bankAccounts?: BankAccount[]
        }
        const rows = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.bankAccounts)
              ? data.bankAccounts
              : []
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

  useEffect(() => {
    const charges = Number(value.transactionCharges || 0)
    setTransactionChargesInput(charges > 0 ? String(charges) : "")
  }, [value.transactionCharges])

  const categoryOptionsFor = (direction: CashflowDirection | "") =>
    direction === "inflow"
      ? CATEGORY_OPTIONS_ALL.filter((o) => o.value !== "expense")
      : direction === "outflow"
        ? CATEGORY_OPTIONS_ALL.filter((o) => o.value !== "income")
        : CATEGORY_OPTIONS_ALL

  const categoryOptions = categoryOptionsFor(value.type)

  const handleTypeChange = (nextType: CashflowDirection) => {
    const nextCategoryOptions = categoryOptionsFor(nextType)
    const allowed = nextCategoryOptions.some((o) => o.value === value.category)
    const nextCategory = (allowed ? value.category : "") as CashflowCategory | ""
    const patch: Partial<FlowFormData> = { type: nextType, category: nextCategory }
    if (!allowsTransactionCharges(nextType, nextCategory)) {
      patch.transactionCharges = 0
      setTransactionChargesInput("")
    }
    onChange(patch)
  }

  const handleCategoryChange = (nextCategory: CashflowCategory) => {
    if (nextCategory === "adjustment") {
      onChange({ category: nextCategory, ...clearPaymentFields() })
      setTransactionChargesInput("")
      return
    }
    if (!allowsTransactionCharges(value.type, nextCategory)) {
      onChange({ category: nextCategory, transactionCharges: 0 })
      setTransactionChargesInput("")
      return
    }
    onChange({ category: nextCategory })
  }

  const handleTransactionModeChange = (mode: string) => {
    const patch: Partial<FlowFormData> = { transactionMode: mode }
    if (mode === "Cash") {
      patch.bankAccountId = ""
      patch.referenceNumber = ""
      patch.transactionCharges = 0
      setTransactionChargesInput("")
    } else if (!isBankRoutedPaymentMode(mode)) {
      patch.bankAccountId = ""
    }
    onChange(patch)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type <span className="text-red-500">*</span></Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.type}
              onChange={(v) => handleTypeChange(v as CashflowDirection)}
              options={DIRECTION_OPTIONS}
              placeholder="Select type"
            />
          </div>
          {errors.type && <p className="text-xs text-red-600">{errors.type}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Category <span className="text-red-500">*</span></Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.category}
              onChange={(v) => handleCategoryChange(v as CashflowCategory)}
              options={categoryOptions}
              placeholder="Select category"
            />
          </div>
          {errors.category && <p className="text-xs text-red-600">{errors.category}</p>}
        </div>
      </div>

      {showCashflowDate || showPaymentFields ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {showCashflowDate ? (
            <div className={`space-y-1.5 ${showPaymentFields ? "" : "sm:col-span-2"}`}>
              <Label>Cashflow date <span className="text-red-500">*</span></Label>
              <div className={disabled ? "pointer-events-none opacity-70" : ""}>
                <ReeveDatePicker
                  value={value.date}
                  onChange={(d) => onChange({ date: d })}
                  placeholder="Select date"
                />
              </div>
              {errors.date && <p className="text-xs text-red-600">{errors.date}</p>}
            </div>
          ) : null}
          {showPaymentFields ? (
            <div className="space-y-1.5">
              <Label>Transaction mode <span className="text-red-500">*</span></Label>
              <div className={disabled ? "pointer-events-none opacity-70" : ""}>
                <StyledSelect
                  value={value.transactionMode}
                  onChange={handleTransactionModeChange}
                  options={PAYMENT_MODE_OPTIONS}
                  placeholder="Select transaction mode"
                />
              </div>
              {errors.transactionMode && <p className="text-xs text-red-600">{errors.transactionMode}</p>}
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdjustment ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Previous value</Label>
            <input type="number" step="0.01" value={previousValue} className={inputClass} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Current value <span className="text-red-500">*</span></Label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={value.currentValue || ""}
              onChange={(e) => onChange({ currentValue: Number(e.target.value || 0), previousValue })}
              placeholder="0"
              className={inputClass}
              disabled={disabled}
            />
            {errors.currentValue && <p className="text-xs text-red-600">{errors.currentValue}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Amount <span className="text-red-500">*</span></Label>
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
      )}

      {showPaymentFields ? (
        <>
          {isBankRoutedMode ? (
            <div className="space-y-1.5">
              <Label>
                Bank account <span className="text-red-500">*</span>
              </Label>
              <div className={disabled ? "pointer-events-none opacity-70" : ""}>
                <StyledSelect
                  value={value.bankAccountId}
                  onChange={(v) => onChange({ bankAccountId: v })}
                  options={bankAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.bank_name} — ${account.bank_account_number}`,
                  }))}
                  placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
                  searchable
                />
              </div>
              {errors.bankAccountId && <p className="text-xs text-red-600">{errors.bankAccountId}</p>}
            </div>
          ) : null}

          {!isCashMode && value.transactionMode ? (
            showChargesField ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Transaction charges</Label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={transactionChargesInput}
                    onChange={(e) => {
                      setTransactionChargesInput(e.target.value)
                      const raw = e.target.value.trim()
                      const next = raw === "" ? 0 : Number(raw)
                      onChange({ transactionCharges: Number.isFinite(next) ? next : 0 })
                    }}
                    placeholder="0"
                    className={`${inputClass} ${invalidCharges || errors.transactionCharges ? "border-red-500" : ""}`}
                    disabled={disabled}
                  />
                  {errors.transactionCharges ? (
                    <p className="text-xs text-red-600">{errors.transactionCharges}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Optional fees for {value.transactionMode} payments.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Reference number <span className="text-red-500">*</span>
                  </Label>
                  <input
                    value={value.referenceNumber}
                    onChange={(e) => onChange({ referenceNumber: e.target.value })}
                    placeholder="e.g. transaction id"
                    className={`${inputClass} ${errors.referenceNumber ? "border-red-500" : ""}`}
                    disabled={disabled}
                  />
                  {errors.referenceNumber ? (
                    <p className="text-xs text-red-600">{errors.referenceNumber}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Required for {value.transactionMode} payments.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  Reference number <span className="text-red-500">*</span>
                </Label>
                <input
                  value={value.referenceNumber}
                  onChange={(e) => onChange({ referenceNumber: e.target.value })}
                  placeholder="e.g. transaction id"
                  className={`${inputClass} ${errors.referenceNumber ? "border-red-500" : ""}`}
                  disabled={disabled}
                />
                {errors.referenceNumber ? (
                  <p className="text-xs text-red-600">{errors.referenceNumber}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Required for {value.transactionMode} payments.
                  </p>
                )}
              </div>
            )
          ) : null}
        </>
      ) : null}

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
