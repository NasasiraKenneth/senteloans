"use client"

import { useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { useToast } from "@/components/ui/toast"
import type { PartnerRole } from "../forms/partnersForm"

type EditablePartner = {
  id: string
  counterparty_id?: string | null
  counterparty_name?: string
  role: string | null
  status: string
  contribution_percentage: number
  contribution_amount: number
  ownership_percentage: number
}

interface EditPartnerProps {
  isOpen: boolean
  investmentId: string
  partner: EditablePartner | null
  onClose: () => void
  onSuccess: (next: EditablePartner) => void
}

type ProviderOption = { id: string; name: string }

export default function EditPartner({ isOpen, investmentId, partner, onClose, onSuccess }: EditPartnerProps) {
  const { toast } = useToast()
  const [counterpartyId, setCounterpartyId] = useState("")
  const [role, setRole] = useState<PartnerRole>("")
  const [status, setStatus] = useState<"Active" | "Inactive">("Active")
  const [contributionPercentage, setContributionPercentage] = useState<number>(0)
  const [contributionAmount, setContributionAmount] = useState<number>(0)
  const [ownershipPercentage, setOwnershipPercentage] = useState<number>(0)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !partner) return
    setCounterpartyId(String(partner.counterparty_id || ""))
    setRole((String(partner.role || "") as PartnerRole) || "")
    setStatus(String(partner.status || "").trim().toLowerCase() === "inactive" ? "Inactive" : "Active")
    setContributionPercentage(Number(partner.contribution_percentage || 0))
    setContributionAmount(Number(partner.contribution_amount || 0))
    setOwnershipPercentage(Number(partner.ownership_percentage || 0))
  }, [isOpen, partner])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadProviders = async () => {
      try {
        setLoadingProviders(true)
        const res = await fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        const list = Array.isArray(body) ? body : Array.isArray(body?.third_party_agents) ? body.third_party_agents : []
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

  const inputClass = useMemo(
    () =>
      "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400",
    [],
  )

  const handleSave = async () => {
    if (!partner?.id) return
    if (!counterpartyId || !role) {
      toast({ variant: "destructive", title: "Missing fields", description: "Counterparty and role are required." })
      return
    }
    try {
      setSaving(true)
      const res = await fetch(`/api/institution/investments/${investmentId}/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartyId,
          role,
          status,
          contributionPercentage,
          contributionAmount,
          ownershipPercentage,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to update partner")

      const selectedCounterpartyName = providers.find((p) => p.id === counterpartyId)?.name || partner.counterparty_name || "Counterparty"

      onSuccess({
        id: partner.id,
        counterparty_id: counterpartyId,
        counterparty_name: selectedCounterpartyName,
        role,
        status,
        contribution_percentage: Number(contributionPercentage || 0),
        contribution_amount: Number(contributionAmount || 0),
        ownership_percentage: Number(ownershipPercentage || 0),
      })
      toast({
        variant: "success",
        title: "Partner updated",
        description: `${selectedCounterpartyName} updated successfully.`,
      })
      onClose()
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to update partner", description: e?.message || "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit Partner" className="z-20">
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Counterparty</Label>
            <StyledSelect
              value={counterpartyId}
              onChange={setCounterpartyId}
              options={providers.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={loadingProviders ? "Loading counterparties..." : "Select counterparty"}
              searchable
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <StyledSelect
              value={role}
              onChange={(value) => setRole(value as PartnerRole)}
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
                value={contributionPercentage || ""}
                onChange={(e) => setContributionPercentage(Number(e.target.value || 0))}
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
                value={contributionAmount || ""}
                onChange={(e) => setContributionAmount(Number(e.target.value || 0))}
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
                value={ownershipPercentage || ""}
                onChange={(e) => setOwnershipPercentage(Number(e.target.value || 0))}
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
                  checked={status === "Active"}
                  onChange={(e) => setStatus(e.target.checked ? "Active" : "Inactive")}
                />
                <div className="w-10 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
                <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5 shadow" />
              </div>
              <span className="text-xs text-muted-foreground">{status}</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !counterpartyId || !role}>
            {saving ? "Saving..." : "Save Partner"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
