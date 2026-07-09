"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Banknote, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"
import { allowsExpenseCashflowTransactionCharges } from "./cashflowForm"

export type ExpenseCashflowPaymentSummary = {
  id: string
  amount: number
  paid_amount?: number
  outstanding?: number
  status: string
  assigned_name: string | null
  date: string | null
  description?: string | null
}

export type ExpenseCashflowPaymentType = "full" | "partial"

export interface ExpenseCashflowRecordPaymentPayload {
  amount: number
  paymentType: ExpenseCashflowPaymentType
  mode: string
  paymentDate: string
  bank_account_id?: string
  reference_number?: string
  transaction_charges?: number
  description?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface RecordPaymentFormProps {
  expenseId: string
  cashflow: ExpenseCashflowPaymentSummary
  onSubmit: (data: ExpenseCashflowRecordPaymentPayload) => void | Promise<void>
  onCancel?: () => void
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const todayYmd = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function getPartialPaymentAmountError(
  amountInput: string,
  outstanding: number,
  formatOutstanding?: (amount: number) => string,
): string | null {
  const raw = amountInput.trim()
  if (!raw) return null
  const amt = Number(raw)
  if (!Number.isFinite(amt) || amt <= 0) return "Please enter a valid payment amount"
  if (outstanding > 0 && amt > outstanding + 0.01) {
    const formatted = formatOutstanding ? formatOutstanding(outstanding) : String(outstanding)
    return `Amount cannot exceed the outstanding balance of ${formatted}`
  }
  return null
}

export function validateRecordPaymentForm(input: {
  paymentType: ExpenseCashflowPaymentType
  amountInput: string
  outstanding: number
  mode: string
  paymentDate: string
  bankAccountId: string
  referenceNumber: string
  transactionChargesInput: string
  formatOutstanding?: (amount: number) => string
}): string | null {
  const amt =
    input.paymentType === "full"
      ? input.outstanding
      : Number(input.amountInput) || 0

  if (input.paymentType === "partial") {
    const partialError = getPartialPaymentAmountError(
      input.amountInput,
      input.outstanding,
      input.formatOutstanding,
    )
    if (partialError) return partialError
  }

  if (amt <= 0) return "Please enter a valid payment amount"
  if (input.outstanding > 0 && amt > input.outstanding + 0.01) {
    const formatted = input.formatOutstanding
      ? input.formatOutstanding(input.outstanding)
      : String(input.outstanding)
    return `Amount cannot exceed the outstanding balance of ${formatted}`
  }
  if (!input.paymentDate) return "Please select a payment date"
  if (!input.mode) return "Please select a payment mode"

  const isCash = input.mode === "Cash"
  if (isBankRoutedPaymentMode(input.mode) && !input.bankAccountId.trim()) {
    return "Please select a bank account"
  }
  if (!isCash && !input.referenceNumber.trim()) {
    return `Reference number is required for ${input.mode} payments`
  }

  const chargesRaw = input.transactionChargesInput.trim()
  const charges = chargesRaw === "" ? 0 : Number(chargesRaw)
  const showCharges = allowsExpenseCashflowTransactionCharges(input.mode)
  if (isCash && charges > 0) return "Transaction charges are not allowed for cash payments"
  if (showCharges && chargesRaw !== "" && (!Number.isFinite(charges) || charges < 0)) {
    return "Transaction charges must be zero or greater"
  }
  if (!showCharges && charges > 0) return "Transaction charges are not allowed for cash payments"

  return null
}

export default function RecordPaymentForm({
  expenseId,
  cashflow,
  onSubmit,
  onCancel,
  loading = false,
}: RecordPaymentFormProps) {
  const [currency, setCurrency] = useState("UGX")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [paymentType, setPaymentType] = useState<ExpenseCashflowPaymentType>("full")
  const [amountInput, setAmountInput] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState(todayYmd())
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [description, setDescription] = useState(cashflow.description?.trim() || "")
  const [transactionChargesInput, setTransactionChargesInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [paidAmount, setPaidAmount] = useState(Number(cashflow.paid_amount || 0))
  const [cashflowTotal, setCashflowTotal] = useState(Number(cashflow.amount || 0))
  const [loadingTotals, setLoadingTotals] = useState(false)

  const total = cashflowTotal
  const paid = paidAmount
  const outstanding = useMemo(() => Math.max(total - paid, 0), [total, paid])

  const percentage = total > 0 ? Math.min((paid / total) * 100, 100) : 0
  const isCashMode = mode === "Cash"
  const isBankRoutedMode = isBankRoutedPaymentMode(mode)
  const showChargesField = allowsExpenseCashflowTransactionCharges(mode)

  const chargesNumber = transactionChargesInput.trim() === "" ? 0 : Number(transactionChargesInput)
  const invalidCharges =
    !isCashMode &&
    transactionChargesInput.trim() !== "" &&
    (!Number.isFinite(chargesNumber) || chargesNumber < 0)

  useEffect(() => {
    let cancelled = false
    async function loadPaymentTotals() {
      if (!expenseId || !cashflow.id) return
      setLoadingTotals(true)
      try {
        const res = await fetch(`/api/institution/expenses/${expenseId}/cashflows/${cashflow.id}`, {
          cache: "no-store",
        })
        const data = (await res.json().catch(() => ({}))) as {
          amount?: number
          paid_amount?: number
          outstanding?: number
        }
        if (!res.ok || cancelled) return
        if (typeof data.amount === "number") setCashflowTotal(data.amount)
        if (typeof data.paid_amount === "number") setPaidAmount(data.paid_amount)
      } catch {
        // keep seeded values from parent row
      } finally {
        if (!cancelled) setLoadingTotals(false)
      }
    }
    void loadPaymentTotals()
    return () => {
      cancelled = true
    }
  }, [expenseId, cashflow.id, cashflow.amount, cashflow.paid_amount])

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.config?.currency) {
          setCurrency(String(data.config.currency))
        }
      } catch {
        // ignore
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

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
        // best-effort
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const handleModeChange = (next: string) => {
    setMode(next)
    if (next === "Cash") {
      setBankAccountId("")
      setReferenceNumber("")
      setTransactionChargesInput("")
    } else if (!isBankRoutedPaymentMode(next)) {
      setBankAccountId("")
    }
  }

  const fmt = (n: number) => formatCurrency(n, currency)

  const partialAmountError = useMemo(
    () =>
      paymentType === "partial"
        ? getPartialPaymentAmountError(amountInput, outstanding, fmt)
        : null,
    [paymentType, amountInput, outstanding, currency],
  )

  const handleSubmit = () => {
    setError(null)
    const validationError = validateRecordPaymentForm({
      paymentType,
      amountInput,
      outstanding,
      mode,
      paymentDate,
      bankAccountId,
      referenceNumber,
      transactionChargesInput,
      formatOutstanding: fmt,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    const amt = paymentType === "full" ? outstanding : Number(amountInput) || 0
    const charges = transactionChargesInput.trim() === "" ? 0 : Number(transactionChargesInput)
    const canCharge = allowsExpenseCashflowTransactionCharges(mode)

    void onSubmit({
      amount: amt,
      paymentType,
      mode,
      paymentDate,
      bank_account_id: isBankRoutedMode ? bankAccountId || undefined : undefined,
      reference_number: !isCashMode ? referenceNumber.trim() : undefined,
      transaction_charges: !isCashMode && canCharge && charges > 0 ? charges : undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      <div className="rounded-lg border border-[#f08c2b]/20 bg-linear-to-r from-[#fff8f2] to-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#f08c2b]/10 p-2">
            <Banknote className="h-5 w-5 text-[#f08c2b]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{cashflow.assigned_name || "Cashflow"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due {formatDate(cashflow.date)}
              </span>
              <span>·</span>
              <span>{cashflow.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Paid so far</p>
            <p className="text-lg font-bold text-gray-900">
              {loadingTotals ? "…" : fmt(paid)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Cashflow total</p>
            <p className="text-sm font-semibold text-gray-600">{fmt(total)}</p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[#f08c2b] transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#f08c2b]">{Math.round(percentage)}% settled</span>
          <span className="font-medium text-gray-700">
            Outstanding: {loadingTotals ? "…" : fmt(outstanding)}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="expenseCashflowPaymentType"
            value="full"
            checked={paymentType === "full"}
            onChange={() => setPaymentType("full")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Pay full amount ({fmt(outstanding)})</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="expenseCashflowPaymentType"
            value="partial"
            checked={paymentType === "partial"}
            onChange={() => setPaymentType("partial")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Partial amount</span>
        </label>
      </div>

      <div className="space-y-2">
        <Label>Payment amount ({currency})</Label>
        {paymentType === "full" ? (
          <input value={outstanding.toLocaleString()} readOnly className={`${inputClass} bg-gray-50 text-gray-600`} />
        ) : (
          <>
            <input
              type="number"
              min={0}
              max={outstanding > 0 ? outstanding : undefined}
              step="0.01"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value)
                if (error) setError(null)
              }}
              placeholder={`Max ${outstanding.toLocaleString()}`}
              className={`${inputClass} ${partialAmountError ? "border-red-500" : ""}`}
            />
            {partialAmountError ? (
              <p className="text-xs text-red-600">{partialAmountError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Maximum: {fmt(outstanding)}</p>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>Payment mode</Label>
        <StyledSelect value={mode} onChange={handleModeChange} placeholder="Select mode" options={PAYMENT_MODE_OPTIONS} />
      </div>

      <div className="space-y-2">
        <Label>Payment date</Label>
        <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select payment date" />
      </div>

      {isBankRoutedMode && (
        <div className="space-y-2">
          <Label>
            Bank account <span className="text-red-500">*</span>
          </Label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
            options={bankAccounts.map((ba) => ({
              value: ba.id,
              label: `${ba.bank_name} — ${ba.bank_account_number}`,
            }))}
            searchable
          />
        </div>
      )}

      {!isCashMode && mode ? (
        showChargesField ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Transaction charges</Label>
              <input
                type="number"
                min={0}
                step="any"
                value={transactionChargesInput}
                onChange={(e) => setTransactionChargesInput(e.target.value)}
                placeholder="0"
                className={`${inputClass} ${invalidCharges ? "border-red-500" : ""}`}
              />
              <p className="text-xs text-muted-foreground">Optional fees for {mode} payments.</p>
            </div>
            <div className="space-y-2">
              <Label>
                Reference number <span className="text-red-500">*</span>
              </Label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. transaction id"
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>
              Reference number <span className="text-red-500">*</span>
            </Label>
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. transaction id"
              className={inputClass}
            />
          </div>
        )
      ) : null}

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Payment notes for the ledger"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={loading || outstanding <= 0 || Boolean(partialAmountError)}
        >
          {loading ? "Processing…" : "Record payment"}
        </Button>
      </div>
    </div>
  )
}
