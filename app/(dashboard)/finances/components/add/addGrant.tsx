"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import GrantForm, { type GrantFormData } from "../forms/grantForm"

interface AddGrantProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  third_party_agent_id_required: "Select a third party agent for this grant.",
  invalid_total_amount: "Enter a valid total grant amount (0 or greater).",
  invalid_available_balance: "Available balance must be between 0 and the total grant amount.",
  "missing_permission:add_grant": "You do not have permission to add grants.",
  branch_id_required: "Select a branch for this grant.",
  invalid_third_party_agent: "The selected third party agent is invalid for this branch.",
  invalid_payment_mode: "Select a valid payment mode.",
  reference_number_required: "Reference number is required for this payment mode.",
  bank_account_required: "Select a bank account for bank-routed payments.",
  invalid_bank_account: "The selected bank account is invalid.",
  insufficient_bank_balance: "Insufficient bank account balance.",
  insufficient_cash_balance: "Insufficient cash balance.",
  insufficient_mobile_money_balance: "Insufficient mobile money balance.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

type ClientOption = { value: string; label: string; branch_id: string }

export default function AddGrant({ isOpen, onClose, onSuccess }: AddGrantProps) {
  const [loading, setLoading] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    setClientsLoading(true)
    try {
      const [permRes, clientsRes] = await Promise.all([
        fetch("/api/institution/finances/permissions", { cache: "no-store" }),
        fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" }),
      ])

      if (permRes.ok) {
        const permBody = await permRes.json().catch(() => ({}))
        const p = permBody?.permissions
        setIsSuperAdmin(!!p?.isSuperAdmin)
        setBranchOptions((p?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })))
      } else {
        setIsSuperAdmin(false)
        setBranchOptions([])
      }

      if (clientsRes.ok) {
        const clientsBody = await clientsRes.json().catch(() => ({}))
        const agents = Array.isArray(clientsBody?.third_party_agents) ? clientsBody.third_party_agents : []
        setClientOptions(
          agents
            .map((c: { id?: string; name?: string; branch_id?: string }) => ({
              value: String(c.id || ""),
              label: String(c.name || "Client").trim() || "Client",
              branch_id: String(c.branch_id || ""),
            }))
            .filter((o: ClientOption) => Boolean(o.value)),
        )
      } else {
        setClientOptions([])
      }
    } catch {
      setBranchOptions([])
      setClientOptions([])
      setIsSuperAdmin(false)
    } finally {
      setClientsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setFormKey((k) => k + 1)
    void loadMeta()
  }, [isOpen, loadMeta])

  const handleCreate = async (data: GrantFormData) => {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        third_party_agent_id: data.third_party_agent_id,
        total_amount: Number(data.total_amount),
        branch_id: data.branch_id || null,
        mode: data.mode,
        reference_number: data.reference_number || null,
        bank_account_id: data.bank_account_id || null,
        date: data.date || null,
      }
      if (data.available_balance.trim() !== "") {
        payload.available_balance = Number(data.available_balance)
      }

      const res = await fetch("/api/institution/finances/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create grant")

      const agentLabel = clientOptions.find((c) => c.value === data.third_party_agent_id)?.label || "Third party agent"
      toast({
        title: "Grant added",
        description: `Grant for ${agentLabel} has been created.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to add grant",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add grant" className="z-[1000] w-[32rem]">
      <GrantForm
        key={formKey}
        onSubmit={handleCreate}
        onCancel={onClose}
        loading={loading}
        showBranchPicker={isSuperAdmin && branchOptions.length > 0}
        branchOptions={branchOptions}
        clientOptions={clientOptions}
        clientsLoading={clientsLoading}
      />
    </ReeveModal>
  )
}
