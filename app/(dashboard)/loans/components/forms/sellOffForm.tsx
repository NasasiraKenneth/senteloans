"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type SellOffFormData = {
  external_lender_id: string
  amount: number
  payment_date: string
  mode: string
  reference_number?: string
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface SellOffFormProps {
  memberId: string
  currency?: string
  onSubmit: (data: SellOffFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  outstandingBalance?: number
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function SellOffForm({
  memberId,
  currency = "UGX",
  onSubmit,
  onCancel,
  loading = false,
  outstandingBalance = 0,
}: SellOffFormProps) {
  const [externalLenderId, setExternalLenderId] = useState("")
  const [amount, setAmount] = useState(String(Math.max(0, Number(outstandingBalance || 0))))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState("Cash")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [lenderClients, setLenderClients] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAmount(String(Math.max(0, Number(outstandingBalance || 0))))
  }, [outstandingBalance])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load clients")
        const rows = Array.isArray(data?.third_party_agents) ? data.third_party_agents : []
        if (!stop)
          setLenderClients(
            rows
              .map((c: { id?: string; name?: string }) => ({
                id: String(c.id || ""),
                name: String(c.name || "").trim(),
              }))
              .filter((c: { id: string }) => Boolean(c.id)),
          )
      } catch {
        if (!stop) setLenderClients([])
      }
    })()
    return () => {
      stop = true
    }
  }, [])

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

  const lenderOptions = useMemo(
    () => lenderClients.map((c) => ({ value: String(c.id), label: c.name || "Client" })),
    [lenderClients],
  )

  const outstanding = Math.max(0, Number(outstandingBalance || 0))
  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const amountNumber = Number(amount)
  const invalidLender = !String(externalLenderId || "").trim()
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0
  const belowOutstanding = !invalidAmount && round2(amountNumber) < round2(outstanding)
  const amountHasError = (invalidAmount && amount.length > 0) || belowOutstanding

  const productStyleInputClass = (hasError = false) =>
    `${inputClass} ${hasError ? "border-red-500" : ""}`

  const canSubmit = !loading && !invalidLender && !invalidAmount && !belowOutstanding

  const handleSubmit = async () => {
    setError(null)

    if (invalidLender) {
      setError("Please select an external lender.")
      return
    }
    if (invalidAmount) {
      setError("Amount must be greater than 0.")
      return
    }
    if (belowOutstanding) {
      setError("Amount must be at least the full outstanding balance.")
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
      external_lender_id: String(externalLenderId).trim(),
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
        <Label htmlFor="selloff-lender" className="mb-2 block">
          Select external lender
        </Label>
        <StyledSelect
          value={externalLenderId}
          onChange={setExternalLenderId}
          placeholder={lenderOptions.length ? "Choose client (external lender)" : "No clients loaded"}
          options={lenderOptions}
          searchable
        />
      </div>

      <div>
        <Label htmlFor="selloff-amount" className="mb-2 block">
          Amount ({currency})
        </Label>
        <input
          id="selloff-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={productStyleInputClass(amountHasError)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
        {belowOutstanding && (
          <p className="mt-1 text-xs text-red-500">
            Amount must be at least the full outstanding balance (
            {round2(outstanding).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {currency}).
          </p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Sell-off Date</Label>
        <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select sell-off date" />
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
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? "Saving..." : "Submit Sell Off"}
        </Button>
      </div>
    </div>
  )
}
