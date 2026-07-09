"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

export type SettlePreviousFormData = {
  payment_date: string
  mode: string
  reference_number?: string
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface SettlePreviousFormProps {
  memberId: string
  currency?: string
  settlementAmount?: number
  settledApplicationId?: string | null
  loanType?: string
  onSubmit: (data: SettlePreviousFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function SettlePreviousForm({
  memberId,
  currency = "UGX",
  settlementAmount = 0,
  settledApplicationId,
  loanType,
  onSubmit,
  onCancel,
  loading = false,
}: SettlePreviousFormProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState("Cash")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const amount = Math.max(0, Number(settlementAmount || 0))

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

  const productStyleInputClass = (hasError = false) =>
    `${inputClass} ${hasError ? "border-red-500" : ""}`

  const canSubmit = !loading && amount > 0

  const handleSubmit = async () => {
    setError(null)
    if (amount <= 0) {
      setError("Settlement amount is missing or invalid.")
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

      <div className="rounded-xl border border-[#f08c2b]/25 bg-linear-to-r from-[#fff3e8] to-white p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#de4925]">Settlement summary</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Loan type</p>
            <p className="font-medium capitalize">{loanType || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Settlement amount</p>
            <p className="font-medium">
              {currency} {amount.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {settledApplicationId && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Previous loan</p>
              <p className="font-medium">{settledApplicationId}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {loanType === "buy off"
            ? "This disburses the settlement from the new loan, records the transaction, and debits branch cash/bank to pay the external lender."
            : "This is an internal top-up settlement: the new loan settlement is recorded and the previous loan repayments are updated. No branch cash/bank movement."}
        </p>
      </div>

      <div>
        <Label className="text-sm font-medium">Payment date</Label>
        <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} className="mt-1.5" />
      </div>

      <div>
        <Label className="text-sm font-medium">Payment mode</Label>
        <StyledSelect
          className="mt-1.5"
          value={mode}
          onChange={setMode}
          options={PAYMENT_MODE_OPTIONS}
          placeholder="Select payment mode"
        />
      </div>

      {BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number]) && (
        <div>
          <Label className="text-sm font-medium">Bank account</Label>
          <StyledSelect
            className="mt-1.5"
            value={bankAccountId}
            onChange={setBankAccountId}
            options={bankAccounts.map((b) => ({
              value: b.id,
              label: `${b.bank_name} (${b.bank_account_number})`,
            }))}
            placeholder="Select bank account"
          />
        </div>
      )}

      {mode !== "Cash" && (
        <div>
          <Label className="text-sm font-medium">Reference number</Label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            className={productStyleInputClass(false)}
            placeholder="Enter reference number"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {loading ? "Settling…" : "Settle previous loan"}
        </Button>
      </div>
    </div>
  )
}
