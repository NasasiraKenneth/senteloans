"use client"

import React, { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"

export interface SharesPayload {
  numberOfShares: number
  mode: string
  paymentDate: string
  referenceNumber?: string
  transaction_charges?: number
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface SharesFormProps {
  memberId: string
  currency?: string
  shareValue?: number
  currentShares?: number
  currentTotalValue?: number
  minShares?: number
  maxShares?: number
  onSubmit: (data: SharesPayload) => void | Promise<void>
  loading?: boolean
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

export default function SharesForm({
  memberId,
  currency = "UGX",
  shareValue = 0,
  currentShares = 0,
  currentTotalValue = 0,
  minShares,
  maxShares,
  onSubmit,
  loading = false,
}: SharesFormProps) {
  const [shares, setShares] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [transactionCharges, setTransactionCharges] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [cfgMinShares, setCfgMinShares] = useState<number | undefined>(undefined)
  const [cfgMaxShares, setCfgMaxShares] = useState<number | undefined>(undefined)
  const [cfgShareValue, setCfgShareValue] = useState<number | undefined>(undefined)
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
  // with what the API enforces. Props (when provided) take precedence.
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
            shareValue?: number | null
          }
        }
        if (cancelled) return
        const min = data.config?.minimumShares
        const max = data.config?.maximumShares
        const sv = data.config?.shareValue
        setCfgMinShares(min == null ? undefined : Number(min))
        setCfgMaxShares(max == null ? undefined : Number(max))
        setCfgShareValue(sv == null ? undefined : Number(sv))
      } catch {
        // Best-effort; client-side hints simply won't show if this fails.
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

  // Price from the current branch config (what the API charges), falling back
  // to the historical per-share value passed in as a prop. This keeps the cost
  // preview in sync with the amount the server will actually bill.
  const effShareValue =
    typeof cfgShareValue === "number" && cfgShareValue > 0 ? cfgShareValue : shareValue

  const qty = Math.max(parseInt(shares || "0", 10) || 0, 0)
  const totalCost = qty * effShareValue

  // Limits apply to the resulting holding, not just this purchase.
  const projectedShares = currentShares + qty

  const fmt = (n: number) => formatCurrency(n, currency)

  // Inline validation message shown directly under the shares input.
  let sharesHint: string | null = null
  if (qty > 0 && effMin && projectedShares < effMin) {
    const needed = Math.max(effMin - currentShares, 1)
    sharesHint = `Minimum holding is ${effMin} share${effMin === 1 ? "" : "s"} — buy at least ${needed} more (you have ${currentShares}).`
  } else if (qty > 0 && effMax && projectedShares > effMax) {
    const remaining = Math.max(effMax - currentShares, 0)
    sharesHint =
      remaining > 0
        ? `Maximum holding is ${effMax} share${effMax === 1 ? "" : "s"} — buy at most ${remaining} more (you have ${currentShares}).`
        : `Maximum holding of ${effMax} share${effMax === 1 ? "" : "s"} already reached.`
  }

  const handleSubmit = () => {
    setError(null)

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Please enter a valid number of shares")
      return
    }
    if (effMin && projectedShares < effMin) {
      const needed = Math.max(effMin - currentShares, 1)
      setError(`Minimum holding is ${effMin} share${effMin === 1 ? "" : "s"} — buy at least ${needed} more.`)
      return
    }
    if (effMax && projectedShares > effMax) {
      const remaining = Math.max(effMax - currentShares, 0)
      setError(
        remaining > 0
          ? `Maximum holding is ${effMax} share${effMax === 1 ? "" : "s"} — buy at most ${remaining} more.`
          : `Maximum holding of ${effMax} share${effMax === 1 ? "" : "s"} already reached.`
      )
      return
    }
    if (!paymentDate) {
      setError("Please select a payment date")
      return
    }
    const parsedDate = new Date(paymentDate)
    if (Number.isNaN(parsedDate.getTime())) {
      setError("The selected payment date is invalid")
      return
    }
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    if (parsedDate.getTime() > endOfToday.getTime()) {
      setError("Payment date cannot be in the future")
      return
    }
    if (BANK_ROUTED_MODES.includes(mode) && !bankAccountId) {
      setError("Please select a bank account")
      return
    }
    if (mode !== "Cash" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }

    void onSubmit({
      numberOfShares: qty,
      mode,
      paymentDate,
      referenceNumber: referenceNumber.trim() || undefined,
      transaction_charges: mode !== "Cash" && transactionCharges ? Number(transactionCharges) || 0 : undefined,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
    })
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Current holding summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Shares</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">{currentShares.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Value/Share</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">{fmt(effShareValue)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Value</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">{fmt(currentTotalValue)}</p>
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
            Holding limit:{" "}
            {effMin ? `min ${effMin}` : ""}
            {effMin && effMax ? " • " : ""}
            {effMax ? `max ${effMax}` : ""} share{(effMax ?? effMin) === 1 ? "" : "s"} (you have {currentShares})
          </p>
        ) : null}
      </div>

      {/* Cost preview */}
      <div className="flex items-center justify-between rounded-lg border border-[#f08c2b]/30 bg-[#f08c2b]/5 p-4">
        <span className="text-sm font-medium text-gray-700">Total Cost</span>
        <span className="text-lg font-bold text-[#f08c2b]">{fmt(totalCost)}</span>
      </div>

      {/* Mode */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Payment Mode</label>
        <StyledSelect value={mode} onChange={setMode} placeholder="Select mode" options={PAYMENT_MODES} />
      </div>

      {/* Payment date */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
        <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select payment date" />
      </div>

      {/* Bank account (bank-routed modes) */}
      {BANK_ROUTED_MODES.includes(mode) && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
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
              placeholder="e.g. transaction id"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">Required for {mode} payments.</p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Processing…" : "Buy Shares"}
        </button>
      </div>
    </div>
  )
}
