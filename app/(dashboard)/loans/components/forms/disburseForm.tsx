"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Circle, CircleDot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type DisburseFormData = {
  disbursement_type: "complete" | "partial"
  disbursement_amount: number
  disbursement_mode: string
  notes?: string
  reference_number?: string
  transaction_charges?: number
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface DisburseFormProps {
  memberId: string
  currency?: string
  onSubmit: (data: DisburseFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  completeDisbursementAmount?: number
  processingFeeAmount?: number
  processingFeePercentage?: number
  settlementOutstandingBalance?: number
  loanType?: "normal" | "top up" | "buy off" | string
  initialMode?: string
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function DisburseForm({
  memberId,
  currency = "UGX",
  onSubmit,
  onCancel,
  loading = false,
  completeDisbursementAmount = 0,
  processingFeeAmount = 0,
  processingFeePercentage = 0,
  settlementOutstandingBalance = 0,
  loanType = "normal",
  initialMode = "Cash",
}: DisburseFormProps) {
  const completeAmount = useMemo(
    () => Math.max(0, Number(completeDisbursementAmount || 0)),
    [completeDisbursementAmount],
  )

  const [disbursementType, setDisbursementType] = useState<"complete" | "partial">("complete")
  const [amount, setAmount] = useState(String(completeAmount))
  const [mode, setMode] = useState(initialMode)
  const [notes, setNotes] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [transactionCharges, setTransactionCharges] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (disbursementType === "complete") {
      setAmount(String(completeAmount))
    }
  }, [disbursementType, completeAmount])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      if (!memberId) return
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

  const amountNumber = Number(amount)
  const invalidAmount =
    !Number.isFinite(amountNumber) ||
    amountNumber <= 0 ||
    amountNumber > completeAmount

  const amountError =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? "Amount must be greater than 0."
      : amountNumber > completeAmount
        ? `Amount cannot exceed disbursable amount (${currency} ${completeAmount.toLocaleString()}).`
        : ""

  const productStyleInputClass = (hasError = false) =>
    `${inputClass} ${hasError ? "border-red-500" : ""}`

  const handleSubmit = async () => {
    setError(null)

    if (invalidAmount) {
      setError(amountError || "Enter a valid disbursement amount.")
      return
    }
    if (BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number]) && !bankAccountId) {
      setError("Please select a bank account")
      return
    }
    if (mode !== "Cash" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }

    await onSubmit({
      disbursement_type: disbursementType,
      disbursement_amount: amountNumber,
      disbursement_mode: mode,
      notes: disbursementType === "partial" ? notes.trim() : undefined,
      reference_number: referenceNumber.trim() || undefined,
      transaction_charges: mode !== "Cash" && transactionCharges ? Number(transactionCharges) || 0 : undefined,
      bank_account_id: BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number])
        ? bankAccountId || undefined
        : undefined,
    })
  }

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="rounded-xl border border-[#f08c2b]/25 bg-linear-to-r from-[#fff3e8] to-white p-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-[#de4925]">Disbursement Type</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["complete", "partial"] as const).map((type) => {
            const selected = disbursementType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setDisbursementType(type)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? "border-[#f08c2b] bg-[#f08c2b]/10 text-[#de4925]"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {selected ? (
                  <CircleDot className="h-4 w-4 text-[#f08c2b]" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400" />
                )}
                {type === "complete" ? "Complete" : "Partial"}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Disbursement Mode</Label>
        <StyledSelect
          value={mode}
          onChange={setMode}
          placeholder="Choose disbursement mode"
          options={PAYMENT_MODE_OPTIONS}
        />
      </div>

      {BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number]) && (
        <div>
          <Label className="mb-2 block">
            Bank Account <span className="text-red-500">*</span>
          </Label>
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

      {mode !== "Cash" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block">Transaction Charges ({currency})</Label>
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
            <Label className="mb-2 block">
              Reference Number <span className="text-red-500">*</span>
            </Label>
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

      <div>
        <Label htmlFor="disbursement-amount" className="mb-2 block">
          Amount ({currency})
        </Label>
        <input
          id="disbursement-amount"
          type="number"
          min="0"
          step="any"
          placeholder="0"
          className={productStyleInputClass(Boolean(amountError))}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disbursementType === "complete"}
        />
        {amountError ? (
          <p className="mt-1 text-xs text-red-500">{amountError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            {loanType === "top up" || loanType === "buy off" ? (
              <>
                Processing fee ({Number(processingFeePercentage || 0)}%): {currency}{" "}
                {Number(processingFeeAmount || 0).toLocaleString()} | Settlement: {currency}{" "}
                {Number(settlementOutstandingBalance || 0).toLocaleString()} | Disbursable: {currency}{" "}
                {completeAmount.toLocaleString()}
              </>
            ) : (
              <>
                Processing fee ({Number(processingFeePercentage || 0)}%): {currency}{" "}
                {Number(processingFeeAmount || 0).toLocaleString()} | Disbursable: {currency}{" "}
                {completeAmount.toLocaleString()}
              </>
            )}
          </p>
        )}
      </div>

      {disbursementType === "partial" && (
        <div>
          <Label htmlFor="disbursement-notes" className="mb-2 block">
            Notes
          </Label>
          <textarea
            id="disbursement-notes"
            rows={3}
            placeholder="Add a note for this partial disbursement..."
            className={productStyleInputClass()}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidAmount}>
          {loading ? "Disbursing..." : "Disburse Loan"}
        </Button>
      </div>
    </div>
  )
}
