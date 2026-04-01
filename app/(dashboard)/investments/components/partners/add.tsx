"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { PartnerFormRow, PartnerProviderOption, PartnerRole } from "../forms/partnersForm"

interface AddPartnerProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (row: PartnerFormRow) => Promise<void> | void
}

const makeRow = (): PartnerFormRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  counterpartyId: "",
  role: "",
  contributionPercentage: 0,
  contributionAmount: 0,
  ownershipPercentage: 0,
  status: "Active",
})

export default function AddPartner({ isOpen, onClose, onSuccess }: AddPartnerProps) {
  const [form, setForm] = useState<PartnerFormRow>(makeRow())
  const [providers, setProviders] = useState<PartnerProviderOption[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(makeRow())
    let cancelled = false
    const loadProviders = async () => {
      try {
        setLoadingProviders(true)
        const res = await fetch("/api/institution/clients?limit=200", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        const list = Array.isArray(body) ? body : Array.isArray(body?.clients) ? body.clients : []
        if (cancelled) return
        setProviders(
          list.map((c: any) => ({
            id: String(c?.id || ""),
            name: String(c?.name || c?.full_name || c?.clientName || ""),
          })),
        )
      } finally {
        if (!cancelled) setLoadingProviders(false)
      }
    }
    void loadProviders()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const inputClass =
    "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

  const handleSave = async () => {
    if (!form.counterpartyId || !form.role) return
    const selectedCounterparty = providers.find((p) => p.id === form.counterpartyId)
    try {
      setSaving(true)
      await onSuccess({ ...form, counterpartyName: selectedCounterparty?.name || "" })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add Partner" className="z-20">
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Counterparty</Label>
            <StyledSelect
              value={form.counterpartyId}
              onChange={(value) => setForm((prev) => ({ ...prev, counterpartyId: value }))}
              options={providers.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={loadingProviders ? "Loading counterparties..." : "Select counterparty"}
              searchable
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <StyledSelect
              value={form.role}
              onChange={(value) => setForm((prev) => ({ ...prev, role: value as PartnerRole }))}
              options={[
                { value: "lead_partner", label: "Lead Partner" },
                { value: "co_investor", label: "Co Investor" },
              ]}
              placeholder="Select role"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Contribution %</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.contributionPercentage || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, contributionPercentage: Number(e.target.value || 0) }))}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contribution Amount</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.contributionAmount || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, contributionAmount: Number(e.target.value || 0) }))}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ownership %</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.ownershipPercentage || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, ownershipPercentage: Number(e.target.value || 0) }))}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <label className="flex items-center gap-2.5 cursor-pointer h-10">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.status === "Active"}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.checked ? "Active" : "Inactive" }))}
                />
                <div className="w-10 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
                <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5 shadow" />
              </div>
              <span className="text-xs text-muted-foreground">{form.status}</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !form.counterpartyId || !form.role}>
            {saving ? "Saving..." : "Add Partner"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
