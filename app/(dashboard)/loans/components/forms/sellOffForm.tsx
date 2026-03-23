"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export type SellOffFormData = {
  external_lender_name: string
  amount: number
}

interface SellOffFormProps {
  onSubmit: (data: SellOffFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  outstandingBalance?: number
}

export default function SellOffForm({
  onSubmit,
  onCancel,
  loading = false,
  outstandingBalance = 0,
}: SellOffFormProps) {
  const [externalLenderName, setExternalLenderName] = useState("")
  const [amount, setAmount] = useState(String(Math.max(0, Number(outstandingBalance || 0))))

  useEffect(() => {
    setAmount(String(Math.max(0, Number(outstandingBalance || 0))))
  }, [outstandingBalance])

  const amountNumber = Number(amount)
  const invalidName = !externalLenderName.trim()
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0

  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  const handleSubmit = async () => {
    if (invalidName || invalidAmount) return
    await onSubmit({
      external_lender_name: externalLenderName.trim(),
      amount: amountNumber,
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <Label htmlFor="selloff-lender" className="mb-2 block">
          External Lender Name
        </Label>
        <input
          id="selloff-lender"
          type="text"
          placeholder="e.g. ABC Finance"
          className={productStyleInputClass(invalidName && externalLenderName.length > 0)}
          value={externalLenderName}
          onChange={(e) => setExternalLenderName(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="selloff-amount" className="mb-2 block">
          Amount (UGX)
        </Label>
        <input
          id="selloff-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={productStyleInputClass(invalidAmount && amount.length > 0)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled
        />
        {invalidAmount && amount.length > 0 && (
          <p className="mt-1 text-xs text-red-500">Amount must be greater than 0.</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading || invalidName || invalidAmount}>
          {loading ? "Saving..." : "Submit Sell Off"}
        </Button>
      </div>
    </div>
  )
}
