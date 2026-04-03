"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker, { parseDateOnly } from "@/components/newUI/date_picker"
import { Circle, CircleDot } from "lucide-react"

export type DisburseFormData = {
  disbursement_type: "complete" | "partial"
  amount: number
  /** Remaining disbursable balance after this partial disbursement; only for partial. */
  balance: number | undefined
  disbursement_mode: string
  disbursement_date: string
}

interface DisburseFormProps {
  onSubmit: (data: DisburseFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  completeDisbursementAmount?: number
  processingFeeAmount?: number
  processingFeePercentage?: number
  settlementOutstandingBalance?: number
  loanType?: "normal" | "top up" | "buy off" | string
  initialMode?: string
  initialDate?: string
}

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

export default function DisburseForm({
  onSubmit,
  onCancel,
  loading = false,
  completeDisbursementAmount = 0,
  processingFeeAmount = 0,
  processingFeePercentage = 0,
  settlementOutstandingBalance = 0,
  loanType = "normal",
  initialMode = "Cash",
  initialDate = "",
}: DisburseFormProps) {
  const maxDisbursable = useMemo(
    () => Math.max(0, Number(completeDisbursementAmount || 0)),
    [completeDisbursementAmount],
  )

  const [disbursementType, setDisbursementType] = useState<"complete" | "partial">("complete")
  const [amountInput, setAmountInput] = useState(String(maxDisbursable))
  const [balanceInput, setBalanceInput] = useState("")
  const [mode, setMode] = useState(initialMode)
  const [disbursementDate, setDisbursementDate] = useState(initialDate)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const modeOptions = useMemo(
    () => PAYMENT_MODES.map((m) => ({ value: m, label: m })),
    [],
  )

  useEffect(() => {
    if (disbursementType === "complete") {
      setAmountInput(String(maxDisbursable))
    }
  }, [disbursementType, maxDisbursable])

  useEffect(() => {
    setSubmitAttempted(false)
    if (disbursementType === "partial") {
      setAmountInput("")
      setBalanceInput("")
    } else {
      setBalanceInput("")
    }
  }, [disbursementType])

  const amountNumber = Number(amountInput)
  const balanceNumber = Number(balanceInput)

  const completeAmountError =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? "Amount must be greater than 0."
      : amountNumber > maxDisbursable
        ? `Amount cannot exceed the disbursable balance (UGX ${maxDisbursable.toLocaleString()}).`
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
      return `Balance cannot exceed the disbursable balance (UGX ${maxDisbursable.toLocaleString()}).`
    }
    if (Number.isFinite(amountNumber) && amountNumber > 0) {
      const sum = amountNumber + balanceNumber
      if (Math.abs(sum - maxDisbursable) > 0.0001) {
        return `Amount and balance must add up to the disbursable balance (UGX ${maxDisbursable.toLocaleString()}).`
      }
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

  const helperLine = (
    <p className="mt-1 text-xs text-gray-500">
      {loanType === "top up" || loanType === "buy off" ? (
        <>
          Processing fee ({Number(processingFeePercentage || 0)}%): UGX{" "}
          {Number(processingFeeAmount || 0).toLocaleString()} | Settlement: UGX{" "}
          {Number(settlementOutstandingBalance || 0).toLocaleString()} | Disbursable: UGX{" "}
          {maxDisbursable.toLocaleString()}
        </>
      ) : (
        <>
          Processing fee ({Number(processingFeePercentage || 0)}%): UGX{" "}
          {Number(processingFeeAmount || 0).toLocaleString()} | Disbursable: UGX {maxDisbursable.toLocaleString()}
        </>
      )}
    </p>
  )

  const handleSubmit = async () => {
    setSubmitAttempted(true)
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
    })
  }

  const handleCancel = () => {
    setSubmitAttempted(false)
    onCancel()
  }

  return (
    <div className="space-y-4 p-4">
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
          options={modeOptions}
        />
      </div>

      {disbursementType === "complete" ? (
        <div>
          <Label htmlFor="sacco-disbursement-amount-complete" className="mb-2 block">
            Amount (UGX)
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
            disabled
          />
          {showCompleteErr ? (
            <p className="mt-1 text-xs text-red-500">{completeAmountError}</p>
          ) : (
            helperLine
          )}
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="sacco-disbursement-amount-partial" className="mb-2 block">
              Amount (UGX)
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
              helperLine
            )}
          </div>
          <div>
            <Label htmlFor="sacco-disbursement-balance-partial" className="mb-2 block">
              Balance (UGX)
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
                Remaining disbursable after this disbursement; must equal disbursable minus amount.
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
