"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import ReeveDatePicker, { parseDateOnly, toDateOnlyString } from "@/components/newUI/date_picker"
import StyledSelect from "@/components/newUI/styled_select"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type SaccoRecordPaymentFormData = {
  amount: number
  payment_date: string
  mode: string
  next_payment_date?: string
  reference_number?: string
  bank_account_id?: string
  transaction_charges?: number
}

interface RecordPaymentFormProps {
  onSubmit: (data: SaccoRecordPaymentFormData) => Promise<void> | void
  onCancel: () => void
  isOpen?: boolean
  loading?: boolean
  initialAmount?: string
  initialDate?: string
  initialNextPaymentDate?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const normalizeDateOnly = (value: string): string => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const sliced = raw.slice(0, 10)
  if (parseDateOnly(sliced)) return sliced

  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw)
  if (named) {
    const day = Number(named[1])
    const monthName = named[2].toLowerCase()
    const year = Number(named[3])
    const monthMap: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    }
    const month = monthMap[monthName]
    if (Number.isInteger(month) && day > 0 && year > 0) {
      return toDateOnlyString(new Date(year, month, day, 12, 0, 0))
    }
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return toDateOnlyString(d)
}

export default function RecordPaymentForm({
  onSubmit,
  onCancel,
  isOpen = false,
  loading = false,
  initialAmount = "",
  initialDate = new Date().toISOString().slice(0, 10),
  initialNextPaymentDate = "",
}: RecordPaymentFormProps) {
  const [amount, setAmount] = useState(initialAmount)
  const [paymentDate, setPaymentDate] = useState(initialDate)
  const [mode, setMode] = useState("Cash")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [transactionCharges, setTransactionCharges] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const computedNextPaymentDate = useMemo(() => {
    const base = normalizeDateOnly(initialNextPaymentDate)
    const d = parseDateOnly(base)
    if (!d) return ""
    const next = new Date(d)
    next.setMonth(next.getMonth() + 1)
    return toDateOnlyString(next)
  }, [initialNextPaymentDate])
  const [nextPaymentDate, setNextPaymentDate] = useState(computedNextPaymentDate)

  useEffect(() => {
    setNextPaymentDate(computedNextPaymentDate)
  }, [computedNextPaymentDate])

  useEffect(() => {
    if (isOpen) {
      setNextPaymentDate(computedNextPaymentDate)
      setMode("Cash")
      setReferenceNumber("")
      setTransactionCharges("")
      setBankAccountId("")
      setError(null)
    }
  }, [isOpen, computedNextPaymentDate])

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
        // Best-effort; the select simply shows no options if this fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const amountNumber = Number(amount)
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0
  const chargesNumber = transactionCharges.trim() === "" ? 0 : Number(transactionCharges)
  const invalidCharges =
    mode !== "Cash" &&
    transactionCharges.trim() !== "" &&
    (!Number.isFinite(chargesNumber) || chargesNumber < 0)

  const handleSubmit = async () => {
    setError(null)

    if (invalidAmount) {
      setError("Amount must be greater than 0.")
      return
    }
    if (invalidCharges) {
      setError("Transaction charges must be a valid, non-negative amount.")
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
      next_payment_date: nextPaymentDate,
      reference_number: referenceNumber.trim() || undefined,
      bank_account_id: BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number])
        ? bankAccountId || undefined
        : undefined,
      transaction_charges:
        mode !== "Cash" && transactionCharges.trim() !== "" && Number.isFinite(chargesNumber) && chargesNumber > 0
          ? chargesNumber
          : undefined,
    })
  }

  return (
    <div className="space-y-4 p-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div>
        <Label htmlFor="sacco-record-payment-amount" className="mb-2 block">
          Amount 
        </Label>
        <input
          id="sacco-record-payment-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={inputClass(invalidAmount && amount.length > 0)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Payment date</Label>
        <ReeveDatePicker
          value={paymentDate}
          onChange={setPaymentDate}
          placeholder="Select payment date"
        />
      </div>

      <div>
        <Label className="mb-2 block">Payment mode</Label>
        <StyledSelect
          value={mode}
          onChange={setMode}
          placeholder="Select payment mode"
          options={PAYMENT_MODE_OPTIONS}
        />
      </div>

      {BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number]) ? (
        <div>
          <Label className="mb-2 block">
            Bank Account <span className="text-red-500">*</span>
          </Label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
            options={bankAccounts.map((account) => ({
              value: account.id,
              label: `${account.bank_name} — ${account.bank_account_number}`,
            }))}
          />
        </div>
      ) : null}

      {mode !== "Cash" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sacco-record-payment-charges" className="mb-2 block">
              Transaction Charges 
            </Label>
            <input
              id="sacco-record-payment-charges"
              type="number"
              min={0}
              step="any"
              value={transactionCharges}
              onChange={(e) => setTransactionCharges(e.target.value)}
              placeholder="0"
              className={inputClass(invalidCharges)}
            />
            {invalidCharges ? (
              <p className="mt-1 text-xs text-red-500">Charges must be zero or greater.</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="sacco-record-payment-reference" className="mb-2 block">
              Reference Number <span className="text-red-500">*</span>
            </Label>
            <input
              id="sacco-record-payment-reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. transaction id"
              className={inputClass(false)}
            />
            <p className="mt-1 text-xs text-gray-500">Required for {mode} payments.</p>
          </div>
        </div>
      ) : null}

      <div>
        <Label className="mb-2 block">Next payment date</Label>
        <ReeveDatePicker
          value={nextPaymentDate}
          onChange={setNextPaymentDate}
          placeholder="Select next payment date"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidAmount}>
          {loading ? "Recording..." : "Record payment"}
        </Button>
      </div>
    </div>
  )
}
