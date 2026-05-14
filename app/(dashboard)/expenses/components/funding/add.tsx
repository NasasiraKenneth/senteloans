"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import FundingForm, { type FundingFormLoanOption, type FundingFormRow } from "../forms/fundingForm"
import { describeExpenseFundingApiError } from "./fundingApiErrors"

interface AddFundingProps {
  isOpen: boolean
  expenseId: string
  onClose: () => void
  onSuccess: () => Promise<void> | void
}

const makeRow = (): FundingFormRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: "savings",
  amount: 0,
  loanId: "",
})

function rowIsValid(row: FundingFormRow): boolean {
  if (Number(row.amount || 0) <= 0) return false
  if (row.type === "loan" && !String(row.loanId || "").trim()) return false
  return true
}

export default function AddFunding({ isOpen, expenseId, onClose, onSuccess }: AddFundingProps) {
  const { toast } = useToast()
  const [row, setRow] = useState<FundingFormRow>(() => makeRow())
  const [loans, setLoans] = useState<FundingFormLoanOption[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [saving, setSaving] = useState(false)

  const resetRow = useCallback(() => {
    setRow(makeRow())
  }, [])

  useEffect(() => {
    if (!isOpen) return
    resetRow()
    let cancelled = false
    const loadLoans = async () => {
      try {
        setLoadingLoans(true)
        const res = await fetch("/api/institution/investments/loans?pageSize=200", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        const items = Array.isArray(body?.items) ? body.items : []
        if (cancelled) return
        setLoans(
          items.map((loan: Record<string, unknown>) => ({
            id: String(loan.id || ""),
            label: String(loan.label || "Loan"),
          })),
        )
      } finally {
        if (!cancelled) setLoadingLoans(false)
      }
    }
    void loadLoans()
    return () => {
      cancelled = true
    }
  }, [isOpen, resetRow])

  const onChangeRow = (id: string, patch: Partial<FundingFormRow>) => {
    setRow((prev) => {
      if (prev.id !== id) return prev
      const next = { ...prev, ...patch }
      if (patch.type != null && patch.type !== "loan") next.loanId = ""
      return next
    })
  }

  const handleSubmit = async () => {
    if (!rowIsValid(row)) {
      toast({
        variant: "destructive",
        title: "Invalid funding",
        description: "Enter a positive amount. Loan funding requires a selected loan.",
      })
      return
    }
    if (!expenseId) return
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/expenses/${expenseId}/funding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: row.type,
          amount: Number(row.amount || 0),
          loanId: row.type === "loan" ? row.loanId || null : null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not save funding",
          description: describeExpenseFundingApiError(body),
        })
        return
      }
      toast({ title: "Funding added", description: "Funding source saved." })
      await onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not save funding",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add funding" className="z-20">
      <div className="space-y-4 p-4">
        <FundingForm
          single
          rows={[row]}
          loans={loans}
          loadingLoans={loadingLoans}
          onAddRow={() => {}}
          onChangeRow={onChangeRow}
          onDeleteRow={() => {}}
        />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving…" : "Add funding"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
