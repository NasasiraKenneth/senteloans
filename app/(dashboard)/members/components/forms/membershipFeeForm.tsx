"use client"

import React, { useEffect, useState } from "react"
import { Check, AlertCircle } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"

export interface MembershipFeePayload {
  amount: number
  mode: string
  paymentDate: string
  reference_number?: string
  transaction_charges?: number
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface MembershipFeeFormProps {
  memberId: string
  currency?: string
  onSubmit: (data: MembershipFeePayload) => void | Promise<void>
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const PAYMENT_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
]

// Payment modes that settle into a branch bank account (require account selection).
const BANK_ROUTED_MODES = ["Bank Transfer"]

export default function MembershipFeeForm({
  memberId,
  currency = "UGX",
  onSubmit,
  loading = false,
}: MembershipFeeFormProps) {
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [membershipFee, setMembershipFee] = useState(0)
  const [membershipFeePaid, setMembershipFeePaid] = useState(0)

  const [paymentType, setPaymentType] = useState<"remaining" | "custom">("remaining")
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [transactionCharges, setTransactionCharges] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const remaining = Math.max(membershipFee - membershipFeePaid, 0)
  const percentage = membershipFee > 0 ? Math.min((membershipFeePaid / membershipFee) * 100, 100) : 0
  const isFullyPaid = membershipFee > 0 && membershipFeePaid >= membershipFee

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingInfo(true)
      try {
        const res = await fetch(`/api/institution/members/${memberId}/membership-fee`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load membership fee")
        if (!cancelled) {
          const fee = Number(data.membershipFee || 0)
          const paid = Number(data.membershipFeePaid || 0)
          const rem = Math.max(fee - paid, 0)
          setMembershipFee(fee)
          setMembershipFeePaid(paid)
          if (rem <= 0 && fee === 0) {
            setPaymentType("custom")
          }
        }
      } catch {
        // Non-fatal: the form still works, the user just sees zeroed totals.
      } finally {
        if (!cancelled) setLoadingInfo(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [memberId])

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

  const fmt = (n: number) => formatCurrency(n, currency)

  const handleSubmit = () => {
    setError(null)
    const amt = paymentType === "remaining" ? remaining : Number(amount) || 0

    if (amt <= 0) {
      setError("Please enter a valid payment amount")
      return
    }
    if (remaining > 0 && amt > remaining + 0.01) {
      setError(`Amount cannot exceed the remaining fee of ${fmt(remaining)}`)
      return
    }
    if (!paymentDate) {
      setError("Please select a payment date")
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
      amount: amt,
      mode,
      paymentDate,
      reference_number: referenceNumber.trim() || undefined,
      transaction_charges: mode !== "Cash" && transactionCharges ? Number(transactionCharges) || 0 : undefined,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
    })
  }

  if (loadingInfo) {
    return (
      <div className="p-5">
        <p className="text-sm text-gray-500">Loading membership fee…</p>
      </div>
    )
  }

  if (isFullyPaid) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">Membership fee fully paid</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Summary */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Paid</p>
            <p className="text-lg font-bold text-gray-900">{fmt(membershipFeePaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Fee</p>
            <p className="text-sm font-semibold text-gray-600">{fmt(membershipFee)}</p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[#f08c2b] transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#f08c2b]">{Math.round(percentage)}% paid</span>
          <span className="text-gray-500">Remaining: {fmt(remaining)}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Payment type */}
      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="feePaymentType"
            value="remaining"
            checked={paymentType === "remaining"}
            onChange={() => setPaymentType("remaining")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Pay Remaining ({fmt(remaining)})</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="feePaymentType"
            value="custom"
            checked={paymentType === "custom"}
            onChange={() => setPaymentType("custom")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Custom Amount</span>
        </label>
      </div>

      {/* Amount */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Amount ({currency})</label>
        {paymentType === "remaining" ? (
          <input value={fmt(remaining)} readOnly className={`${inputClass} bg-gray-50 font-semibold text-gray-700`} />
        ) : (
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={remaining > 0 ? `Max: ${remaining.toLocaleString()}` : "Enter payment amount"}
            min={1}
            max={remaining > 0 ? remaining : undefined}
            className={inputClass}
          />
        )}
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
          {loading ? "Processing…" : "Record Payment"}
        </button>
      </div>
    </div>
  )
}
