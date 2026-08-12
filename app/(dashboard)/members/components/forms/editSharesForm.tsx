"use client"

import React, { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, Info, TrendingDown, TrendingUp } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"

export interface ShareTransactionItem {
  id: string
  transaction_id: string | null
  acquisition_type?: "purchase" | "transfer_in" | "transfer_out" | "redemption" | string | null
  transfer_type?: "from" | "to" | string | null
  transfer_member_id?: string | null
  transfer_member_name?: string | null
  transfer_member_number?: string | null
  number_of_shares: number
  share_value: number
  total_value: number
  remaining_shares?: number
  date?: string | null
  created_at: string
  transaction_number?: string | null
  mode?: string | null
  reference_number?: string | null
  description?: string | null
  status?: string | null
}

export interface EditSharesPayload {
  shareId: string
  transactionId?: string | null
  numberOfShares: number
  shareValue: number
  totalValue: number
  previousTotalValue: number
  valueDifference: number
  sharesDifference: number
  mode: string
  paymentDate: string
  referenceNumber?: string
  description?: string
  transaction_charges?: number
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface EditSharesFormProps {
  share: ShareTransactionItem
  memberId: string
  currency?: string
  shareValue?: number
  currentShares?: number
  currentTotalValue?: number
  minShares?: number
  maxShares?: number
  onSubmit: (data: EditSharesPayload) => void | Promise<void>
  loading?: boolean
  onCancel?: () => void
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const PAYMENT_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

// Payment modes that settle into a branch bank account (require account selection).
const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]

export default function EditSharesForm({
  share,
  memberId,
  currency = "UGX",
  shareValue = 0,
  currentShares = 0,
  currentTotalValue = 0,
  minShares,
  maxShares,
  onSubmit,
  loading = false,
  onCancel,
}: EditSharesFormProps) {
  const [shares, setShares] = useState(String(share.number_of_shares || ""))
  const [mode, setMode] = useState(share.mode || "Cash")
  const [paymentDate, setPaymentDate] = useState(
    share.date
      ? share.date.slice(0, 10)
      : share.created_at
        ? share.created_at.slice(0, 10)
        : ""
  )
  const [referenceNumber, setReferenceNumber] = useState(share.reference_number || "")
  const [transactionCharges, setTransactionCharges] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [cfgMinShares, setCfgMinShares] = useState<number | undefined>(undefined)
  const [cfgMaxShares, setCfgMaxShares] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch(`/api/institution/members/${memberId}/bank-accounts`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { bankAccounts?: BankAccount[] }
        if (!cancelled) setBankAccounts(data.bankAccounts || [])
      } catch {
        // Best-effort; the select simply shows no options if this fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [memberId])

  // Pull the branch share constraints from config so the limits stay in sync
  useEffect(() => {
    let cancelled = false
    async function loadShareConfig() {
      try {
        const res = await fetch(`/api/institution/settings`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          config?: {
            minimumShares?: number | null
            maximumShares?: number | null
          }
        }
        if (cancelled) return
        const min = data.config?.minimumShares
        const max = data.config?.maximumShares
        setCfgMinShares(min == null ? undefined : Number(min))
        setCfgMaxShares(max == null ? undefined : Number(max))
      } catch {
        // Best-effort
      }
    }
    void loadShareConfig()
    return () => {
      cancelled = true
    }
  }, [])

  // A constraint only applies when it's present and greater than zero.
  const rawMin = minShares ?? cfgMinShares
  const rawMax = maxShares ?? cfgMaxShares
  const effMin = typeof rawMin === "number" && rawMin > 0 ? rawMin : undefined
  const effMax = typeof rawMax === "number" && rawMax > 0 ? rawMax : undefined

  // Fixed unit price from transaction or fallback
  const effectiveUnitPrice = share.share_value || shareValue || 0

  const originalQty = share.number_of_shares || 0
  const qty = Math.max(parseInt(shares || "0", 10) || 0, 0)

  // Transaction values and difference calculation
  const previousTransactionValue = Number(share.total_value || originalQty * effectiveUnitPrice)
  const newTransactionValue = qty * effectiveUnitPrice
  const valueDifference = newTransactionValue - previousTransactionValue
  const sharesDifference = qty - originalQty

  // Projected member holding
  const baseSharesWithoutThis = Math.max(currentShares - originalQty, 0)
  const projectedShares = baseSharesWithoutThis + qty

  const fmt = (n: number) => formatCurrency(n, currency)

  // Inline validation message shown directly under the shares input.
  let sharesHint: string | null = null
  if (qty > 0 && effMin && projectedShares < effMin) {
    sharesHint = `Minimum holding is ${effMin} share${effMin === 1 ? "" : "s"} — total holding would be ${projectedShares}.`
  } else if (qty > 0 && effMax && projectedShares > effMax) {
    sharesHint = `Maximum holding is ${effMax} share${effMax === 1 ? "" : "s"} — total holding would reach ${projectedShares}.`
  }

  const handleSubmit = () => {
    setError(null)

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Please enter a valid number of shares (minimum 1)")
      return
    }
    if (effMin && projectedShares < effMin) {
      setError(`Minimum holding requirement is ${effMin} share${effMin === 1 ? "" : "s"}.`)
      return
    }
    if (effMax && projectedShares > effMax) {
      setError(`Maximum holding limit is ${effMax} share${effMax === 1 ? "" : "s"}.`)
      return
    }
    if (!paymentDate) {
      setError("Please select a purchase date")
      return
    }
    const parsedDate = new Date(paymentDate)
    if (Number.isNaN(parsedDate.getTime())) {
      setError("The selected purchase date is invalid")
      return
    }
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    if (parsedDate.getTime() > endOfToday.getTime()) {
      setError("Purchase date cannot be in the future")
      return
    }
    if (BANK_ROUTED_MODES.includes(mode) && !bankAccountId && bankAccounts.length > 0) {
      setError("Please select a bank account")
      return
    }
    if (mode !== "Cash" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }

    void onSubmit({
      shareId: share.id,
      transactionId: share.transaction_id,
      numberOfShares: qty,
      shareValue: effectiveUnitPrice,
      totalValue: newTransactionValue,
      previousTotalValue: previousTransactionValue,
      valueDifference,
      sharesDifference,
      mode,
      paymentDate,
      referenceNumber: referenceNumber.trim() || undefined,
      description: `Updated shares purchase: ${qty} share(s) @ ${effectiveUnitPrice.toLocaleString()} each`,
      transaction_charges: mode !== "Cash" && transactionCharges ? Number(transactionCharges) || 0 : undefined,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
    })
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Transaction Details Header Badge */}
      <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3.5 text-xs text-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-orange-600" />
            <span>Txn Ref: <strong className="font-mono text-slate-900">{share.transaction_number || (share.transaction_id ? share.transaction_id.slice(0, 8).toUpperCase() : share.id.slice(0, 8).toUpperCase())}</strong></span>
          </div>
          <span className="text-slate-500">
            Price: <strong className="text-slate-800">{fmt(effectiveUnitPrice)}</strong> / share
          </span>
        </div>
      </div>

      {/* Current holding summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current Total</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">{currentShares.toLocaleString()} shares</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">New Holding</p>
          <p className="mt-0.5 text-base font-bold text-orange-600">{projectedShares.toLocaleString()} shares</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Holding Value</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">{fmt(currentTotalValue - previousTransactionValue + newTransactionValue)}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Number of shares */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Number of Shares <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="e.g. 10"
          className={inputClass}
        />
        {sharesHint ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {sharesHint}
          </p>
        ) : effMin || effMax ? (
          <p className="mt-1 text-xs text-gray-500">
            Limits: {effMin ? `min ${effMin}` : ""}{effMin && effMax ? " • " : ""}{effMax ? `max ${effMax}` : ""}
          </p>
        ) : null}
      </div>

      {/* Transaction Value Difference & Comparison Card (Rows) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 text-xs">
          <span className="font-semibold text-slate-700">Transaction Value Comparison</span>
          <span className="text-slate-500">
            Rate: <strong className="font-mono text-slate-800">{fmt(effectiveUnitPrice)}</strong> / share
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Row 1: Previous Value */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <div>
              <p className="font-medium text-slate-600">Previous Value</p>
              <p className="text-[10px] text-slate-400">
                {originalQty} share{originalQty === 1 ? "" : "s"} @ {fmt(effectiveUnitPrice)}
              </p>
            </div>
            <span className="font-bold text-slate-800 text-sm">{fmt(previousTransactionValue)}</span>
          </div>

          {/* Row 2: New Value */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <div>
              <p className="font-medium text-slate-600">New Value</p>
              <p className="text-[10px] text-slate-400">
                {qty} share{qty === 1 ? "" : "s"} @ {fmt(effectiveUnitPrice)}
              </p>
            </div>
            <span className="font-bold text-slate-900 text-sm">{fmt(newTransactionValue)}</span>
          </div>

          {/* Row 3: Difference */}
          <div
            className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
              valueDifference > 0
                ? "border-orange-200 bg-orange-50/70"
                : valueDifference < 0
                  ? "border-blue-200 bg-blue-50/70"
                  : "border-slate-200 bg-white"
            }`}
          >
            <div>
              <p
                className={`font-semibold ${
                  valueDifference > 0
                    ? "text-orange-900"
                    : valueDifference < 0
                      ? "text-blue-900"
                      : "text-slate-700"
                }`}
              >
                Difference (Net Adjustment)
              </p>
              <p className="text-[10px] text-slate-500">
                {sharesDifference > 0
                  ? `+${sharesDifference} shares to add`
                  : sharesDifference < 0
                    ? `${sharesDifference} shares to remove`
                    : "No quantity change"}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {valueDifference > 0 && <TrendingUp className="h-4 w-4 text-orange-600 shrink-0" />}
              {valueDifference < 0 && <TrendingDown className="h-4 w-4 text-blue-600 shrink-0" />}
              {valueDifference === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
              <span
                className={`text-sm font-bold ${
                  valueDifference > 0
                    ? "text-orange-600"
                    : valueDifference < 0
                      ? "text-blue-600"
                      : "text-slate-700"
                }`}
              >
                {valueDifference > 0
                  ? `+${fmt(valueDifference)}`
                  : valueDifference < 0
                    ? `-${fmt(Math.abs(valueDifference))}`
                    : fmt(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Informative helper note based on difference */}
        {valueDifference !== 0 ? (
          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              {valueDifference > 0
                ? `Net addition of ${fmt(valueDifference)} will be added to the member's share value.`
                : `Net adjustment of ${fmt(Math.abs(valueDifference))} will be deducted from the member's share value.`}
            </span>
          </p>
        ) : null}
      </div>

      {/* Mode & Payment date */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Payment Mode</label>
          <StyledSelect value={mode} onChange={setMode} placeholder="Select mode" options={PAYMENT_MODES} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Purchase Date</label>
          <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select date" />
        </div>
      </div>

      {/* Bank account (bank-routed modes) */}
      {BANK_ROUTED_MODES.includes(mode) && bankAccounts.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder="Select bank account"
            options={bankAccounts.map((ba) => ({
              value: ba.id,
              label: `${ba.bank_name} — ${ba.bank_account_number}`,
            }))}
          />
        </div>
      )}

      {/* Transaction charges + reference number (non-cash) */}
      {mode !== "Cash" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Transaction Charges ({currency})</label>
            <input
              type="number"
              min={0}
              value={transactionCharges}
              onChange={(e) => setTransactionCharges(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reference Number <span className="text-red-500">*</span>
            </label>
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. transaction ID or receipt"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Footer Submit / Cancel */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving Changes…" : "Update Share Record"}
        </button>
      </div>
    </div>
  )
}
