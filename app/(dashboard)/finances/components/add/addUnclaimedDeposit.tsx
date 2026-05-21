"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import UnclaimedForm, { type UnclaimedFormData } from "../forms/unclaimedForm"

interface AddUnclaimedDepositProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_amount: "Enter an amount greater than zero.",
  invalid_payment_mode: "Select a valid payment mode.",
  "missing_permission:add_unclaimed_deposit": "You do not have permission to add unclaimed deposits.",
  branch_id_required: "Select a branch for this deposit.",
  invalid_branch: "The selected branch is invalid.",
  unclaimed_deposit_number_generation_failed:
    "Could not generate a unique deposit number. Please try again.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

function toApiBody(data: UnclaimedFormData) {
  return {
    amount: Number(data.amount),
    mode: data.mode,
    date: data.date || null,
    transaction_number: data.transaction_number || null,
    notes: data.notes || null,
    branch_id: data.branch_id || null,
  }
}

export default function AddUnclaimedDeposit({ isOpen, onClose, onSuccess }: AddUnclaimedDepositProps) {
  const [loading, setLoading] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) {
        setBranchOptions([])
        setIsSuperAdmin(false)
        return
      }
      const body = await res.json().catch(() => ({}))
      const p = body?.permissions
      setIsSuperAdmin(!!p?.isSuperAdmin)
      setBranchOptions((p?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })))
    } catch {
      setBranchOptions([])
      setIsSuperAdmin(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setFormKey((k) => k + 1)
    void loadMeta()
  }, [isOpen, loadMeta])

  const handleCreate = async (data: UnclaimedFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/finances/unclaimed-deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiBody(data)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create unclaimed deposit")

      toast({
        title: "Deposit recorded",
        description: "The unclaimed deposit has been added.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to add deposit",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add unclaimed deposit" className="z-[1000] w-[32rem]">
      <UnclaimedForm
        key={formKey}
        onSubmit={handleCreate}
        onCancel={onClose}
        loading={loading}
        showBranchPicker={isSuperAdmin && branchOptions.length > 0}
        branchOptions={branchOptions}
      />
    </ReeveModal>
  )
}
