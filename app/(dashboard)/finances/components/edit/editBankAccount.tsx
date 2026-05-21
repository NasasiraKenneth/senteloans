"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import BankAccountForm, { type BankAccountFormData } from "../forms/bankAccountForm"

interface EditBankAccountProps {
  isOpen: boolean
  accountId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  bank_name_and_account_required: "Bank name and account number are required.",
  "missing_permission:edit_bank_account": "You do not have permission to edit bank accounts.",
  branch_id_required: "Select a branch for this account.",
  invalid_branch: "The selected branch is invalid.",
  bank_account_already_exists: "This bank account already exists for your institution.",
  not_found: "This bank account no longer exists.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

export default function EditBankAccount({ isOpen, accountId, onClose, onSuccess }: EditBankAccountProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [initialValues, setInitialValues] = useState<Partial<BankAccountFormData> | null>(null)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) return
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
    if (!isOpen || !accountId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchAccount = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        await loadMeta()
        const res = await fetch(`/api/institution/finances/bank-accounts/${accountId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load bank account")

        const account = body?.account
        setInitialValues({
          bank_name: account?.bank_name || "",
          bank_account_number: account?.bank_account_number || "",
          total_amount: String(account?.total_amount ?? ""),
          branch_id: account?.branch_id || "",
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        toast({
          title: "Failed to load bank account",
          description: formatError(message),
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchAccount()
  }, [isOpen, accountId, loadMeta, toast])

  const handleUpdate = async (data: BankAccountFormData) => {
    if (!accountId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/finances/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: data.bank_name,
          bank_account_number: data.bank_account_number,
          branch_id: data.branch_id || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to update bank account")

      toast({
        title: "Bank account updated",
        description: `${data.bank_name} has been saved.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to update bank account",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const seededInitial = useMemo(() => initialValues ?? undefined, [initialValues])

  const showPanel = isOpen && !!accountId
  const showLoading = showPanel && !fetchError && (fetching || !seededInitial)

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit bank account" className="z-[1000] w-[28rem]">
      {!showPanel ? null : showLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading bank account…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : seededInitial ? (
        <BankAccountForm
          key={accountId}
          mode="edit"
          initialValues={seededInitial}
          onSubmit={handleUpdate}
          onCancel={onClose}
          loading={loading}
          showBranchPicker={isSuperAdmin && branchOptions.length > 0}
          branchOptions={branchOptions}
        />
      ) : null}
    </ReeveModal>
  )
}
