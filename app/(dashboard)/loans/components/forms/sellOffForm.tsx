"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"

export type SellOffFormData = {
  external_lender_id: string
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
  const [externalLenderId, setExternalLenderId] = useState("")
  const [amount, setAmount] = useState(String(Math.max(0, Number(outstandingBalance || 0))))
  const [lenderClients, setLenderClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    setAmount(String(Math.max(0, Number(outstandingBalance || 0))))
  }, [outstandingBalance])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/clients?limit=200", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load clients")
        const rows = Array.isArray(data?.clients) ? data.clients : []
        if (!stop)
          setLenderClients(
            rows.map((c: { id?: string; name?: string }) => ({ id: String(c.id || ""), name: String(c.name || "").trim() })).filter((c: { id: string }) => Boolean(c.id))
          )
      } catch {
        if (!stop) setLenderClients([])
      }
    })()
    return () => {
      stop = true
    }
  }, [])

  const lenderOptions = useMemo(
    () => lenderClients.map((c) => ({ value: String(c.id), label: c.name || "Client" })),
    [lenderClients]
  )

  const amountNumber = Number(amount)
  const invalidLender = !String(externalLenderId || "").trim()
  const invalidAmount = !Number.isFinite(amountNumber) || amountNumber <= 0

  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  const handleSubmit = async () => {
    if (invalidLender || invalidAmount) return
    await onSubmit({
      external_lender_id: String(externalLenderId).trim(),
      amount: amountNumber,
    })
  }

  return (
    <div className="space-y-4 p-4">
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
        <Button onClick={handleSubmit} disabled={loading || invalidLender || invalidAmount}>
          {loading ? "Saving..." : "Submit Sell Off"}
        </Button>
      </div>
    </div>
  )
}
