"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import BankAccountForm, { type BankAccountFormData } from "../forms/bankAccountForm"

interface AddBankAccountProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  third_party_agent_id_required: "Select a third party agent for this bank account.",
  bank_account_number_required: "Account number is required.",
  "missing_permission:add_bank_account": "You do not have permission to add bank accounts.",
  branch_id_required: "Select a branch for this account.",
  invalid_branch: "The selected branch is invalid.",
  invalid_third_party_agent: "The selected third party agent is invalid for this branch.",
  bank_account_already_exists: "This bank account already exists for your institution.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

type AgentOption = { value: string; label: string; branch_id: string }

export default function AddBankAccount({ isOpen, onClose, onSuccess }: AddBankAccountProps) {
  const [loading, setLoading] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const [permRes, agentsRes] = await Promise.all([
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

      if (agentsRes.ok) {
        const agentsBody = await agentsRes.json().catch(() => ({}))
        const agents = Array.isArray(agentsBody?.third_party_agents) ? agentsBody.third_party_agents : []
        setAgentOptions(
          agents
            .map((a: { id?: string; name?: string; branch_id?: string }) => ({
              value: String(a.id || ""),
              label: String(a.name || "Agent").trim() || "Agent",
              branch_id: String(a.branch_id || ""),
            }))
            .filter((o: AgentOption) => Boolean(o.value)),
        )
      } else {
        setAgentOptions([])
      }
    } catch {
      setBranchOptions([])
      setAgentOptions([])
      setIsSuperAdmin(false)
    } finally {
      setAgentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setFormKey((k) => k + 1)
    void loadMeta()
  }, [isOpen, loadMeta])

  const handleCreate = async (data: BankAccountFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/finances/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          third_party_agent_id: data.third_party_agent_id,
          bank_account_number: data.bank_account_number,
          branch_id: data.branch_id || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create bank account")

      const agentLabel =
        agentOptions.find((a) => a.value === data.third_party_agent_id)?.label || "Bank account"

      toast({
        title: "Bank account added",
        description: `${agentLabel} has been registered.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to add bank account",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add bank account" className="z-[1000] w-[28rem]">
      <BankAccountForm
        key={formKey}
        onSubmit={handleCreate}
        onCancel={onClose}
        loading={loading}
        showBranchPicker={isSuperAdmin && branchOptions.length > 0}
        branchOptions={branchOptions}
        agentOptions={agentOptions}
        agentsLoading={agentsLoading}
      />
    </ReeveModal>
  )
}
