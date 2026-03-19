"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { Circle, CircleDot } from "lucide-react"

export type DisburseFormData = {
  disbursement_type: "complete" | "partial"
  disbursement_amount: number
  disbursement_mode: string
}

interface DisburseFormProps {
  onSubmit: (data: DisburseFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  principalAmount?: number
  loanType?: "normal" | "top up" | "buy off" | string
  settlementOutstandingBalance?: number
  initialMode?: string
}

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

export default function DisburseForm({
  onSubmit,
  onCancel,
  loading = false,
  principalAmount = 0,
  loanType = "normal",
  settlementOutstandingBalance = 0,
  initialMode = "Cash",
}: DisburseFormProps) {
  const completeAmount = useMemo(() => {
    const principal = Number(principalAmount || 0)
    const settlement = Number(settlementOutstandingBalance || 0)
    if (loanType === "top up" || loanType === "buy off") {
      return Math.max(principal - settlement, 0)
    }
    return Math.max(principal, 0)
  }, [principalAmount, settlementOutstandingBalance, loanType])

  const [disbursementType, setDisbursementType] = useState<"complete" | "partial">("complete")
  const [amount, setAmount] = useState(String(completeAmount))
  const [mode, setMode] = useState(initialMode)
  const modeOptions = useMemo(
    () => PAYMENT_MODES.map((m) => ({ value: m, label: m })),
    []
  )

  useEffect(() => {
    if (disbursementType === "complete") {
      setAmount(String(completeAmount))
    }
  }, [disbursementType, completeAmount])

  const amountNumber = Number(amount)
  const invalidAmount =
    !Number.isFinite(amountNumber) ||
    amountNumber <= 0 ||
    (disbursementType === "partial" && amountNumber > completeAmount)

  const amountError =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? "Amount must be greater than 0."
      : disbursementType === "partial" && amountNumber > completeAmount
        ? `Amount cannot exceed disbursable amount (UGX ${completeAmount.toLocaleString()}).`
        : ""

  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  const handleSubmit = async () => {
    if (invalidAmount) return
    await onSubmit({
      disbursement_type: disbursementType,
      disbursement_amount: amountNumber,
      disbursement_mode: mode,
    })
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

      <div>
        <Label htmlFor="disbursement-amount" className="mb-2 block">
          Amount (UGX)
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
                Principal (UGX {Number(principalAmount || 0).toLocaleString()}) - Settlement outstanding (UGX{" "}
                {Number(settlementOutstandingBalance || 0).toLocaleString()}) = Disbursable (UGX{" "}
                {completeAmount.toLocaleString()})
              </>
            ) : (
              <>Disbursable amount: UGX {completeAmount.toLocaleString()}</>
            )}
          </p>
        )}
      </div>

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
