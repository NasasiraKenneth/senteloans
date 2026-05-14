"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import FundingForm, { type FundingFormLoanOption, type FundingFormRow, type FundingType } from "../forms/fundingForm"
import { describeExpenseFundingApiError } from "./fundingApiErrors"

interface EditFundingProps {
  isOpen: boolean
  expenseId: string
  funding: FundingFormRow | null
  onClose: () => void
  onSuccess: () => Promise<void> | void
}

const emptyRow = (): FundingFormRow => ({
  id: "",
  type: "savings",
  amount: 0,
  loanId: "",
})

const FUNDING_TYPES: FundingType[] = ["savings", "shares", "reserves", "loan", "grant"]

function normalizeFundingRow(funding: FundingFormRow): FundingFormRow {
  const t = String(funding.type || "savings").toLowerCase()
  const type = (FUNDING_TYPES.includes(t as FundingType) ? t : "savings") as FundingType
  return {
    id: funding.id,
    type,
    amount: Number(funding.amount || 0),
    loanId: funding.loanId ?? "",
  }
}

function rowIsValid(row: FundingFormRow): boolean {
  if (!String(row.id || "").trim()) return false
  if (Number(row.amount || 0) <= 0) return false
  if (row.type === "loan" && !String(row.loanId || "").trim()) return false
  return true
}

export default function EditFunding({ isOpen, expenseId, funding, onClose, onSuccess }: EditFundingProps) {
  const { toast } = useToast()
  const [row, setRow] = useState<FundingFormRow>(emptyRow)
  const [loans, setLoans] = useState<FundingFormLoanOption[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen || !funding) return
    setRow(normalizeFundingRow(funding))
  }, [isOpen, funding])

  const loadLoans = useCallback(async () => {
    try {
      setLoadingLoans(true)
      const res = await fetch("/api/institution/investments/loans?pageSize=200", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      const items = Array.isArray(body?.items) ? body.items : []
      setLoans(
        items.map((loan: Record<string, unknown>) => ({
          id: String(loan.id || ""),
          label: String(loan.label || "Loan"),
        })),
      )
    } finally {
      setLoadingLoans(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    void loadLoans()
  }, [isOpen, loadLoans])

  const onChangeRow = (id: string, patch: Partial<FundingFormRow>) => {
    setRow((prev) => {
      if (prev.id !== id) return prev
      const next = { ...prev, ...patch }
      if (patch.type != null && patch.type !== "loan") next.loanId = ""
      return next
    })
  }

  const handleSave = async () => {
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
      const res = await fetch(`/api/institution/expenses/${expenseId}/funding/${row.id}`, {
        method: "PATCH",
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
          title: "Failed to update funding",
          description: describeExpenseFundingApiError(body),
        })
        return
      }
      toast({ title: "Funding updated" })
      await onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update funding",
        description: String((e as Error)?.message || "Please try again."),
      })
    } finally {
      setSaving(false)
    }
  }

  const showForm = isOpen && !!funding && !!row.id

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit funding" className="z-20">
      <div className="space-y-4 p-4">
        {showForm ? (
          <>
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
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save funding"}
              </Button>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        )}
      </div>
    </ReeveModal>
  )
}
