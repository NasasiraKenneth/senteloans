"use client"

import { useState } from "react"
import { Calculator, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format-currency"

interface ShareCalculatorFormProps {
  shareValue?: number
  currency?: string
  onClose?: () => void
  onBuyShares?: () => void
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function ShareCalculatorForm({
  shareValue = 0,
  currency = "UGX",
  onClose,
  onBuyShares,
}: ShareCalculatorFormProps) {
  const [shares, setShares] = useState("")

  const qty = Math.max(parseInt(shares || "0", 10) || 0, 0)
  const total = qty * shareValue

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f08c2b]/10">
          <Calculator className="h-4 w-4 text-[#f08c2b]" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Shares Calculator</h2>
          <p className="text-xs text-muted-foreground">Estimate the cost of buying shares</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Number of Shares</label>
        <input
          type="number"
          min={0}
          placeholder="e.g. 10"
          value={shares}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShares(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Value per Share</span>
          <span className="font-medium">{fmt(shareValue)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-medium">Total Cost</span>
          <span className="text-lg font-bold tracking-tight text-[#f08c2b]">{fmt(total)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
        {onBuyShares && (
          <Button size="sm" onClick={onBuyShares}>
            <Plus className="mr-2 h-4 w-4" />
            Buy Shares
          </Button>
        )}
      </div>
    </>
  )
}
