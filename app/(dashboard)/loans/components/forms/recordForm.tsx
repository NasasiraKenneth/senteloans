"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type RecordPaymentFormData = {
  amount: number
  payment_date: string
  mode: string
  reference_number?: string
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface RecordFormProps {
  memberId: string
  currency?: string
  onSubmit: (data: RecordPaymentFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  initialAmount?: string
  initialDate?: string
  initialMode?: string
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function RecordForm({
  memberId,
  currency = "UGX",
  onSubmit,
  onCancel,
  loading = false,
  initialAmount = "",
  initialDate = new Date().toISOString().slice(0, 10),
  initialMode = "Cash",
}: RecordFormProps) {
  const [amount, setAmount] = useState(initialAmount)
  const [paymentDate, setPaymentDate] = useState(initialDate)
  const [mode, setMode] = useState(initialMode)
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)

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
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0

  const productStyleInputClass = (hasError = false) =>
    `${inputClass} ${hasError ? "border-red-500" : ""}`

  const handleSubmit = async () => {
    setError(null)

    if (invalidAmount) {
      setError("Amount must be greater than 0.")
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
      amount: amountNumber,
      payment_date: paymentDate,
      mode,
      reference_number: referenceNumber.trim() || undefined,
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

      <div>
        <Label htmlFor="record-payment-amount" className="mb-2 block">
          Amount ({currency})
        </Label>
        <input
          id="record-payment-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={productStyleInputClass(invalidAmount && amount.length > 0)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Payment Date</Label>
        <ReeveDatePicker
          value={paymentDate}
          onChange={setPaymentDate}
          placeholder="Select payment date"
        />
      </div>

      <div>
        <Label className="mb-2 block">Payment Mode</Label>
        <StyledSelect
          value={mode}
          onChange={setMode}
          placeholder="Choose payment mode"
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
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidAmount}>
          {loading ? "Recording..." : "Record Payment"}
        </Button>
      </div>
    </div>
  )
}
