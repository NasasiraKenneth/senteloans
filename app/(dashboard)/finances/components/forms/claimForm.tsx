"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { formatCurrency, formatDate } from "../../utils"

export type ClaimFormData = {
  assignee_type: "member" | "client" | ""
  member_id: string
  client_id: string
}

interface ClaimFormProps {
  onSubmit: (data: ClaimFormData) => void
  onCancel: () => void
  loading?: boolean
  depositSummary?: {
    amount: number
    transaction_number: string
    date: string
    mode: string
  }
}

const defaultValues: ClaimFormData = {
  assignee_type: "",
  member_id: "",
  client_id: "",
}

const ASSIGNEE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "client", label: "Client" },
]

const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

export default function ClaimForm({ onSubmit, onCancel, loading = false, depositSummary }: ClaimFormProps) {
  const [form, setForm] = useState<ClaimFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof ClaimFormData, string>>>({})
  const [memberOptions, setMemberOptions] = useState<{ value: string; label: string }[]>([])
  const [clientOptions, setClientOptions] = useState<{ value: string; label: string }[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const disabled = loading

  useEffect(() => {
    let cancelled = false
    setLoadingLists(true)
    void (async () => {
      try {
        const [mRes, cRes] = await Promise.all([
          fetch("/api/institution/members?limit=200", { cache: "no-store" }),
          fetch("/api/institution/clients?limit=200", { cache: "no-store" }),
        ])
        const mBody = await mRes.json().catch(() => ({}))
        const cBody = await cRes.json().catch(() => ({}))
        if (!cancelled && mRes.ok) {
          const members = Array.isArray(mBody?.members) ? mBody.members : []
          setMemberOptions(
            members
              .map((m: { id?: string; full_name?: string; name?: string }) => ({
                value: String(m.id || ""),
                label: String(m.full_name || m.name || "Member").trim() || "Member",
              }))
              .filter((o: { value: string }) => Boolean(o.value)),
          )
        } else if (!cancelled) setMemberOptions([])

        if (!cancelled && cRes.ok) {
          const clients = Array.isArray(cBody?.clients) ? cBody.clients : []
          setClientOptions(
            clients
              .map((c: { id?: string; name?: string }) => ({
                value: String(c.id || ""),
                label: String(c.name || "Client").trim() || "Client",
              }))
              .filter((o: { value: string }) => Boolean(o.value)),
          )
        } else if (!cancelled) setClientOptions([])
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const set = (field: keyof ClaimFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "assignee_type") {
        next.member_id = ""
        next.client_id = ""
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof ClaimFormData, string>> = {}
    if (!form.assignee_type) e.assignee_type = "Select member or client"
    if (form.assignee_type === "member" && !form.member_id.trim()) e.member_id = "Select a member"
    if (form.assignee_type === "client" && !form.client_id.trim()) e.client_id = "Select a client"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      assignee_type: form.assignee_type,
      member_id: form.assignee_type === "member" ? form.member_id.trim() : "",
      client_id: form.assignee_type === "client" ? form.client_id.trim() : "",
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {depositSummary && (
        <div className="rounded-lg border border-[#f08c2b]/20 bg-[#f08c2b]/5 p-3 text-sm">
          <p className="font-medium text-gray-900">{formatCurrency(depositSummary.amount)}</p>
          <p className="mt-1 text-muted-foreground">
            {depositSummary.transaction_number
              ? `Ref: ${depositSummary.transaction_number} · `
              : ""}
            {depositSummary.mode}
            {depositSummary.date ? ` · ${formatDate(depositSummary.date)}` : ""}
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Assign to <span className="text-red-500">*</span>
        </label>
        <div className={disabled ? "pointer-events-none opacity-60" : ""}>
          <StyledSelect
            value={form.assignee_type}
            onChange={(v) => set("assignee_type", v as ClaimFormData["assignee_type"])}
            placeholder="Select type"
            options={ASSIGNEE_OPTIONS}
          />
        </div>
        {errors.assignee_type ? <p className="mt-1 text-xs text-red-600">{errors.assignee_type}</p> : null}
      </div>

      {form.assignee_type === "member" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Member <span className="text-red-500">*</span>
          </label>
          <div className={`${selectWrap(!!errors.member_id)} ${disabled || loadingLists ? "pointer-events-none opacity-60" : ""}`}>
            <StyledSelect
              value={form.member_id}
              onChange={(v) => set("member_id", v)}
              placeholder={loadingLists ? "Loading members…" : "Select member"}
              options={memberOptions}
              searchable
            />
          </div>
          {errors.member_id ? <p className="mt-1 text-xs text-red-600">{errors.member_id}</p> : null}
        </div>
      )}

      {form.assignee_type === "client" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Client <span className="text-red-500">*</span>
          </label>
          <div className={`${selectWrap(!!errors.client_id)} ${disabled || loadingLists ? "pointer-events-none opacity-60" : ""}`}>
            <StyledSelect
              value={form.client_id}
              onChange={(v) => set("client_id", v)}
              placeholder={loadingLists ? "Loading clients…" : "Select client"}
              options={clientOptions}
              searchable
            />
          </div>
          {errors.client_id ? <p className="mt-1 text-xs text-red-600">{errors.client_id}</p> : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Claiming links this deposit to the selected member or client and marks it as claimed.
      </p>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {loading ? "Claiming…" : "Claim deposit"}
        </Button>
      </div>
    </form>
  )
}
