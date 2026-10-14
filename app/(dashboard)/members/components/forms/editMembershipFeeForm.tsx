"use client"

import React, { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"

export interface EditMembershipFeePayload {
  transaction_id: string
  amount: number
  mode: string
  paymentDate: string
  reason: string
  reference_number?: string
  transaction_charges?: number
  bank_account_id?: string
}

export interface FeePaymentRecord {
  id: string
  transaction_id?: string | null
  transaction_number: string
  amount: number
  mode: string
  description?: string
  reference_number?: string
  bank_account_id?: string | null
  transaction_charges?: number
  transaction_date: string
  status: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface EditMembershipFeeFormProps {
  memberId: string
  payment: FeePaymentRecord
  currency?: string
  totalFee?: number
  currentPaid?: number
  onSubmit: (data: EditMembershipFeePayload) => void | Promise<void>
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const PAYMENT_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
]

const BANK_ROUTED_MODES = ["Bank Transfer"]

export default function EditMembershipFeeForm({
  memberId,
  payment,
  currency = "UGX",
  totalFee = 0,
  currentPaid = 0,
  onSubmit,
  loading = false,
}: EditMembershipFeeFormProps) {
  const initialMode =
    payment.mode === "Cheque" || payment.mode === "Card"
      ? "Bank Transfer"
      : payment.mode || "Cash"

  const [amount, setAmount] = useState(String(payment.amount || ""))
  const [mode, setMode] = useState(initialMode)
  const [paymentDate, setPaymentDate] = useState(
    payment.transaction_date ? payment.transaction_date.split("T")[0] : ""
  )
  const [referenceNumber, setReferenceNumber] = useState(payment.reference_number || "")
  const [transactionCharges, setTransactionCharges] = useState(
    payment.transaction_charges ? String(payment.transaction_charges) : ""
  )
  const [reason, setReason] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState(payment.bank_account_id || "")
  const [error, setError] = useState<string | null>(null)

  // Max allowed for this edit = remaining fee without this payment
  const originalAmount = Number(payment.amount || 0)
  const paidWithoutOld = Math.max(0, currentPaid - originalAmount)
  const maxAllowed = totalFee > 0 ? Math.max(0, totalFee - paidWithoutOld) : 0

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch(`/api/institution/members/${memberId}/bank-accounts`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { bankAccounts?: BankAccount[] }
        if (!cancelled) setBankAccounts(data.bankAccounts || [])
      } catch {
        // Best-effort
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
    const amt = Number(amount)

    if (!payment.transaction_id) {
      setError("This transaction cannot be edited because it has no transaction ID.")
      return
    }
    if (amt <= 0 || !Number.isFinite(amt)) {
      setError("Please enter a valid payment amount")
      return
    }
    if (maxAllowed > 0 && amt > maxAllowed + 0.01) {
      setError(`Amount cannot exceed ${fmt(maxAllowed)} (total fee limit)`)
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
    if (!reason.trim()) {
      setError("Please provide a reason for editing this payment")
      return
    }

    void onSubmit({
      transaction_id: payment.transaction_id,
      amount: amt,
      mode,
      paymentDate,
      reason: reason.trim(),
      reference_number: referenceNumber.trim() || undefined,
      transaction_charges: mode !== "Cash" && transactionCharges ? Number(transactionCharges) || 0 : undefined,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
    })
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Original Payment Information */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-2 text-xs text-amber-900">
        <div className="flex items-center justify-between font-semibold text-sm text-amber-950">
          <span>Editing Payment: {payment.transaction_number}</span>
          <span>{fmt(originalAmount)}</span>
        </div>
        <p className="text-amber-800">
          Editing this payment will void transaction <strong>{payment.transaction_number}</strong> via financial outflow,
          and issue a replacement transaction reflecting your updated values.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Payment Amount ({currency}) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter payment amount"
          min={1}
          max={maxAllowed > 0 ? maxAllowed : undefined}
          className={inputClass}
        />
        {maxAllowed > 0 && (
          <p className="mt-1 text-xs text-gray-500">Max allowable: {fmt(maxAllowed)}</p>
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
              placeholder="e.g. transaction reference"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Reason for Edit */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Reason for Modification <span className="text-red-500">*</span>
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Corrected payment amount / updated payment mode"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">Recorded in the audit trail.</p>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Updating…" : "Apply Changes"}
        </button>
      </div>
    </div>
  )
}
