"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import GrantForm, { type GrantFormData } from "../forms/grantForm"

interface EditGrantProps {
  isOpen: boolean
  grantId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  client_id_required: "Select a client for this grant.",
  invalid_total_amount: "Enter a valid total grant amount (0 or greater).",
  invalid_available_balance: "Available balance must be between 0 and the total grant amount.",
  "missing_permission:edit_grant": "You do not have permission to edit grants.",
  branch_id_required: "Select a branch for this grant.",
  invalid_branch: "The selected branch is invalid.",
  invalid_client: "The selected client is invalid for this branch.",
  not_found: "This grant no longer exists.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

type ClientOption = { value: string; label: string; branch_id: string }

export default function EditGrant({ isOpen, grantId, onClose, onSuccess }: EditGrantProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [initialValues, setInitialValues] = useState<Partial<GrantFormData> | null>(null)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    setClientsLoading(true)
    try {
      const [permRes, clientsRes] = await Promise.all([
        fetch("/api/institution/finances/permissions", { cache: "no-store" }),
        fetch("/api/institution/clients?limit=200", { cache: "no-store" }),
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
        const clients = Array.isArray(clientsBody?.clients) ? clientsBody.clients : []
        setClientOptions(
          clients
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
    if (!isOpen || !grantId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchGrant = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        await loadMeta()
        const res = await fetch(`/api/institution/finances/grants/${grantId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load grant")

        const g = body?.grant
        setInitialValues({
          client_id: g?.client_id || "",
          total_amount: String(g?.total_amount ?? ""),
          available_balance: String(g?.available_balance ?? ""),
          branch_id: g?.branch_id || "",
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        toast({
          title: "Failed to load grant",
          description: formatError(message),
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchGrant()
  }, [isOpen, grantId, loadMeta, toast])

  const handleUpdate = async (data: GrantFormData) => {
    if (!grantId) return
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        client_id: data.client_id,
        total_amount: Number(data.total_amount),
        branch_id: data.branch_id || null,
      }
      if (data.available_balance.trim() !== "") {
        payload.available_balance = Number(data.available_balance)
      }

      const res = await fetch(`/api/institution/finances/grants/${grantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to update grant")

      const clientLabel = clientOptions.find((c) => c.value === data.client_id)?.label || "Grant"
      toast({
        title: "Grant updated",
        description: `${clientLabel} has been saved.`,
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to update grant",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const seededInitial = useMemo(() => initialValues ?? undefined, [initialValues])

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Edit grant" className="z-[1000] w-[32rem]">
      {fetching ? (
        <p className="p-4 text-sm text-muted-foreground">Loading grant…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : seededInitial ? (
        <GrantForm
          key={grantId}
          mode="edit"
          initialValues={seededInitial}
          onSubmit={handleUpdate}
          onCancel={onClose}
          loading={loading}
          showBranchPicker={isSuperAdmin && branchOptions.length > 0}
          branchOptions={branchOptions}
          clientOptions={clientOptions}
          clientsLoading={clientsLoading}
        />
      ) : null}
    </ReeveModal>
  )
}
