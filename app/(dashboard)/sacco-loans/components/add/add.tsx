"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/toast"
import SaccoLoanForm, { SaccoLoanFormData } from "../forms/saccoloanForm"
import { SlideModal } from "@/components/modals/SlideModal"

interface AddSaccoLoanProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

type ThirdPartyAgentOption = {
  id: string
  name: string
}

function mapCreateLoanError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "invalid_total_amount":
      return "Enter the total repayment amount."
    case "invalid_interest_amount":
      return "Enter the interest charges amount."
    case "invalid_monthly_payment":
      return "Enter the monthly instalment amount."
    case "total_below_principal":
      return "Total repayment cannot be less than the principal."
    case "repayment_breakdown_mismatch":
      return "Total repayment must equal principal plus interest charges."
    default:
      return c || "Failed to create external loan"
  }
}

export default function AddSaccoLoan({ isOpen, onClose, onCreated }: AddSaccoLoanProps) {
  const { toast } = useToast()
  const [thirdPartyAgents, setThirdPartyAgents] = useState<ThirdPartyAgentOption[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadThirdPartyAgents = async () => {
      try {
        setLoadingAgents(true)
        const res = await fetch(
          "/api/institution/third-party-agents?limit=300&status=Active",
          { cache: "no-store" },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load third party agents")
        const list = Array.isArray(body?.third_party_agents) ? body.third_party_agents : []
        if (cancelled) return
        setThirdPartyAgents(
          list
            .filter((c: { status?: string }) => String(c.status || "Active") === "Active")
            .map((c: { id?: string; name?: string; full_name?: string }) => ({
              id: String(c.id || ""),
              name: String(c.name || c.full_name || ""),
            }))
            .filter((c: { id: string }) => c.id),
        )
      } catch (e: any) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Failed to load third party agents",
            description: e?.message || "Please try again.",
          })
        }
      } finally {
        if (!cancelled) setLoadingAgents(false)
      }
    }
    void loadThirdPartyAgents()
    return () => {
      cancelled = true
    }
  }, [isOpen, toast])

  const handleSubmit = async (data: SaccoLoanFormData) => {
    try {
      setSaving(true)
      const res = await fetch("/api/institution/sacco-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = typeof body?.error === "string" ? body.error : ""
        throw new Error(mapCreateLoanError(code))
      }
      toast({
        title: "Application submitted",
        description: "The external loan was created and is awaiting approval.",
      })
      onCreated?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({
        variant: "destructive",
        title: "Could not save loan",
        description: message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideModal isOpen={isOpen} onClose={onClose} title="New External Loan" className="z-20">
      <SaccoLoanForm onSubmit={handleSubmit} onClose={onClose} loading={saving || loadingAgents} thirdPartyAgents={thirdPartyAgents} />
    </SlideModal>
  )
}
