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
  bank_name_and_account_required: "Bank name and account number are required.",
  invalid_total_amount: "Enter a valid opening balance (0 or greater).",
  "missing_permission:add_bank_account": "You do not have permission to add bank accounts.",
  branch_id_required: "Select a branch for this account.",
  invalid_branch: "The selected branch is invalid.",
  bank_account_already_exists: "This bank account already exists for your institution.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

export default function AddBankAccount({ isOpen, onClose, onSuccess }: AddBankAccountProps) {
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

  const handleCreate = async (data: BankAccountFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/finances/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: data.bank_name,
          bank_account_number: data.bank_account_number,
          total_amount: Number(data.total_amount),
          branch_id: data.branch_id || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to create bank account")

      toast({
        title: "Bank account added",
        description: `${data.bank_name} has been registered.`,
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
      />
    </ReeveModal>
  )
}
