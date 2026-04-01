"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { useToast } from "@/components/ui/toast"
import type { FundingFormRow } from "../forms/fundingForm"

interface EditFundingProps {
  isOpen: boolean
  investmentId: string
  funding: FundingFormRow | null
  onClose: () => void
  onSuccess: (row: FundingFormRow) => void
}

export default function EditFunding({ isOpen, investmentId, funding, onClose, onSuccess }: EditFundingProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<FundingFormRow>({
    id: "",
    type: "savings",
    amount: 0,
    loanId: "",
  })
  const [loans, setLoans] = useState<Array<{ id: string; label: string }>>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !funding) return
    setForm({
      id: funding.id,
      type: funding.type,
      amount: Number(funding.amount || 0),
      loanId: funding.loanId || "",
    })
  }, [isOpen, funding])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadLoans = async () => {
      try {
        setLoadingLoans(true)
        const res = await fetch("/api/institution/investments/loans?pageSize=200", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        const items = Array.isArray(body?.items) ? body.items : []
        if (cancelled) return
        setLoans(
          items.map((loan: any) => ({
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
  }, [isOpen])

  const inputClass =
    "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

  const handleSave = async () => {
    if (!form.id) return
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/investments/${investmentId}/funding/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: Number(form.amount || 0),
          loanId: form.loanId || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to update funding")
      onSuccess(form)
      toast({ title: "Funding updated" })
      onClose()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to update funding",
        description: e?.message || "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit Funding" className="z-20">
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Funding Type</Label>
            <StyledSelect
              value={form.type}
              onChange={(value) => setForm((prev) => ({ ...prev, type: value as FundingFormRow["type"], loanId: value === "loan" ? prev.loanId : "" }))}
              options={[
                { value: "savings", label: "Savings" },
                { value: "shares", label: "Shares" },
                { value: "reserves", label: "Reserves" },
                { value: "loan", label: "Loan" },
                { value: "grant", label: "Grant" },
              ]}
              placeholder="Select funding type"
            />
          </div>
          {form.type === "loan" && (
            <div className="space-y-1.5">
              <Label>Select Loan</Label>
              <StyledSelect
                value={form.loanId || ""}
                onChange={(value) => setForm((prev) => ({ ...prev, loanId: value }))}
                options={loans.map((loan) => ({ value: loan.id, label: loan.label }))}
                placeholder={loadingLoans ? "Loading loans..." : "Select loan"}
                searchable
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <input
              type="number"
              min={0}
              value={form.amount || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value || 0) }))}
              placeholder="Enter amount"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || Number(form.amount || 0) <= 0 || (form.type === "loan" && !form.loanId)}
          >
            {saving ? "Saving..." : "Save Funding"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
