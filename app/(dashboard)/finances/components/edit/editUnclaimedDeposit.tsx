"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import { toDateOnlyString } from "@/lib/finances/date-only"
import UnclaimedForm, { type UnclaimedFormData } from "../forms/unclaimedForm"

interface EditUnclaimedDepositProps {
  isOpen: boolean
  depositId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_amount: "Enter an amount greater than zero.",
  invalid_payment_mode: "Select a valid payment mode.",
  bank_account_required: "Select a bank account for bank transfer deposits.",
  invalid_bank_account: "The selected bank account is invalid for this branch.",
  "missing_permission:edit_unclaimed_deposit": "You do not have permission to edit unclaimed deposits.",
  branch_id_required: "Select a branch for this deposit.",
  invalid_branch: "The selected branch is invalid.",
  not_found: "This deposit no longer exists.",
  deposit_not_editable: "This deposit has been claimed and can no longer be edited.",
}

function formatError(code: string, message?: string): string {
  if (message?.trim()) return message.trim()
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

function toApiBody(data: UnclaimedFormData) {
  return {
    amount: Number(data.amount),
    mode: data.mode,
    date: data.date || null,
    transaction_number: data.transaction_number || null,
    bank_account_id: data.bank_account_id || null,
    notes: data.notes || null,
    branch_id: data.branch_id || null,
  }
}

export default function EditUnclaimedDeposit({ isOpen, depositId, onClose, onSuccess }: EditUnclaimedDepositProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [initialValues, setInitialValues] = useState<Partial<UnclaimedFormData> | null>(null)
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
    if (!isOpen || !depositId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchDeposit = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        await loadMeta()
        const res = await fetch(`/api/institution/finances/unclaimed-deposits/${depositId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.message || body?.error || "Failed to load deposit")

        const d = body?.deposit
        if (d && d.can_edit === false) {
          throw new Error("deposit_not_editable")
        }
        setInitialValues({
          amount: String(d?.amount ?? ""),
          mode: d?.mode || "Cash",
          date: toDateOnlyString(d?.date),
          transaction_number: d?.transaction_number || "",
          bank_account_id: d?.bank_account_id || "",
          notes: d?.notes || "",
          branch_id: d?.branch_id || "",
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        toast({
          title: message === "deposit_not_editable" ? "Cannot edit deposit" : "Failed to load deposit",
          description: formatError(message),
          variant: message === "deposit_not_editable" ? "warning" : "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchDeposit()
  }, [isOpen, depositId, loadMeta, toast])

  const handleUpdate = async (data: UnclaimedFormData) => {
    if (!depositId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/finances/unclaimed-deposits/${depositId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiBody(data)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || body?.error || "Failed to update deposit")

      toast({
        title: "Deposit updated",
        description: "Changes have been saved.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: message === "deposit_not_editable" ? "Cannot edit deposit" : "Failed to update deposit",
        description: formatError(message),
        variant: message === "deposit_not_editable" ? "warning" : "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const seededInitial = useMemo(() => initialValues ?? undefined, [initialValues])

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit unclaimed deposit" className="z-[1000] w-[32rem]">
      {fetching ? (
        <p className="p-4 text-sm text-muted-foreground">Loading deposit…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : seededInitial ? (
        <UnclaimedForm
          key={depositId}
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
