"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker, { parseDateOnly } from "@/components/newUI/date_picker"
import { AlertCircle, Circle, CircleDot } from "lucide-react"
import { BANK_ROUTED_PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"
import { formatCurrency } from "@/lib/format-currency"

export type DisburseFormData = {
  disbursement_type: "complete" | "partial"
  amount: number
  /** Remaining disbursable balance after this partial disbursement; only for partial. */
  balance: number | undefined
  disbursement_mode: string
  disbursement_date: string
  reference_number?: string
  bank_account_id?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface DisburseFormProps {
  onSubmit: (data: DisburseFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  completeDisbursementAmount?: number
  /** When disbursement_balance is 0, complete disbursement uses principal as the required transaction amount. */
  principalAmount?: number
  initialMode?: string
  initialDate?: string
}

export default function DisburseForm({
  onSubmit,
  onCancel,
  loading = false,
  completeDisbursementAmount = 0,
  principalAmount = 0,
  initialMode = "Cash",
  initialDate = "",
}: DisburseFormProps) {
  const maxDisbursable = useMemo(
    () => Math.max(0, Number(completeDisbursementAmount || 0)),
    [completeDisbursementAmount],
  )

  /** Complete: disbursable bucket, or principal when bucket is unset (0). Partial: always the live bucket. */
  const completeCap = useMemo(() => {
    const d = maxDisbursable
    const p = Math.max(0, Number(principalAmount || 0))
    return d > 0 ? d : p
  }, [maxDisbursable, principalAmount])

  const [disbursementType, setDisbursementType] = useState<"complete" | "partial">("complete")
  const [amountInput, setAmountInput] = useState(String(completeCap))
  const [balanceInput, setBalanceInput] = useState("")
  const [mode, setMode] = useState(initialMode)
  const [disbursementDate, setDisbursementDate] = useState(initialDate)
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  useEffect(() => {
    if (disbursementType === "complete") {
      setAmountInput(String(completeCap))
    }
  }, [disbursementType, completeCap])

  useEffect(() => {
    setSubmitAttempted(false)
    setError(null)
    if (disbursementType === "partial") {
      setAmountInput("")
      setBalanceInput("")
    } else {
      setBalanceInput("")
    }
  }, [disbursementType])

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

  const amountNumber = Number(amountInput)
  const balanceNumber = Number(balanceInput)

  const completeAmountError =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? "Amount must be greater than 0."
      : completeCap <= 0
        ? "Nothing to disburse — set disbursement balance or principal on the loan."
        : amountNumber > completeCap
          ? `Amount cannot exceed the full disbursement amount (UGX ${completeCap.toLocaleString()}).`
          : ""

  const partialAmountError =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? "Amount must be greater than 0."
      : amountNumber > maxDisbursable
        ? `Amount cannot exceed the disbursable balance (UGX ${maxDisbursable.toLocaleString()}).`
        : ""

  const partialBalanceError = (() => {
    if (disbursementType !== "partial") return ""
    if (!Number.isFinite(balanceNumber) || balanceNumber < 0) {
      return "Balance must be zero or greater."
    }
    if (balanceNumber > maxDisbursable) {
      return `Balance cannot exceed the disbursable balance (${formatCurrency(maxDisbursable)}).`
    }
    return ""
  })()

  const invalidComplete = disbursementType === "complete" && Boolean(completeAmountError)

  const invalidPartial =
    disbursementType === "partial" &&
    (Boolean(partialAmountError) || Boolean(partialBalanceError))

  const parsedDisburseDate = parseDateOnly(disbursementDate)
  const invalidDate = !disbursementDate.trim() || parsedDisburseDate === null
  const dateError = invalidDate ? "Disbursement date is required." : ""

  const showCompleteErr = submitAttempted && Boolean(completeAmountError)
  const showPartialAmountErr = submitAttempted && Boolean(partialAmountError)
  const showPartialBalanceErr = submitAttempted && Boolean(partialBalanceError)
  const showDateErr = submitAttempted && Boolean(dateError)

  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    setError(null)

    if (BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number]) && !bankAccountId) {
      setError("Please select a bank account")
      return
    }
    if (mode !== "Cash" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }
    if (
      (disbursementType === "complete" ? invalidComplete : invalidPartial) ||
      invalidDate
    ) {
      return
    }

    await onSubmit({
      disbursement_type: disbursementType,
      amount: amountNumber,
      balance: disbursementType === "partial" ? balanceNumber : undefined,
      disbursement_mode: mode,
      disbursement_date: disbursementDate.trim(),
      reference_number: referenceNumber.trim() || undefined,
      bank_account_id: BANK_ROUTED_PAYMENT_MODES.includes(mode as (typeof BANK_ROUTED_PAYMENT_MODES)[number])
        ? bankAccountId || undefined
        : undefined,
    })
  }

  const handleCancel = () => {
    setSubmitAttempted(false)
    onCancel()
  }

  return (
    <div className="space-y-4 p-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}
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
        <div>
          <Label htmlFor="sacco-disbursement-reference" className="mb-2 block">
            Reference Number <span className="text-red-500">*</span>
          </Label>
          <input
            id="sacco-disbursement-reference"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. transaction id"
            className={productStyleInputClass()}
          />
          <p className="mt-1 text-xs text-gray-500">Required for {mode} payments.</p>
        </div>
      ) : null}

      {disbursementType === "complete" ? (
        <div>
          <Label htmlFor="sacco-disbursement-amount-complete" className="mb-2 block">
            Amount 
          </Label>
          <input
            id="sacco-disbursement-amount-complete"
            type="number"
            min="0"
            step="any"
            placeholder="0"
            className={productStyleInputClass(showCompleteErr)}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
          {showCompleteErr ? (
            <p className="mt-1 text-xs text-red-500">{completeAmountError}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Maximum disbursement: {formatCurrency(completeCap)}
              {maxDisbursable <= 0 && completeCap > 0 ? " (principal; disbursement balance unset)" : ""}
            </p>
          )}
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="sacco-disbursement-amount-partial" className="mb-2 block">
              Amount
            </Label>
            <input
              id="sacco-disbursement-amount-partial"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              className={productStyleInputClass(showPartialAmountErr)}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            {showPartialAmountErr ? (
              <p className="mt-1 text-xs text-red-500">{partialAmountError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Disbursable balance: {formatCurrency(maxDisbursable)}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sacco-disbursement-balance-partial" className="mb-2 block">
              Balance
            </Label>
            <input
              id="sacco-disbursement-balance-partial"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              className={productStyleInputClass(showPartialBalanceErr)}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
            />
            {showPartialBalanceErr ? (
              <p className="mt-1 text-xs text-red-500">{partialBalanceError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Remaining disbursable balance after this disbursement.
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <Label className="mb-2 block">Disbursement date</Label>
        <div className={showDateErr ? "rounded-md ring-2 ring-red-500 ring-offset-0" : ""}>
          <ReeveDatePicker
            value={disbursementDate}
            onChange={setDisbursementDate}
            placeholder="Select date"
          />
        </div>
        {showDateErr ? <p className="mt-1 text-xs text-red-500">{dateError}</p> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Disbursing..." : "Disburse Loan"}
        </Button>
      </div>
    </div>
  )
}
