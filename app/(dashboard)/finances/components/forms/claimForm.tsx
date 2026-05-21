"use client"

import { useEffect, useState } from "react"
import { CalendarDays, CreditCard, Hash, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { formatCurrency, formatDate } from "../../utils"

type RawTransaction = {
  id?: string
  transaction_number?: string
  type?: string
  amount?: number | string
  mode?: string
  date?: string
}

function transactionLabel(t: RawTransaction): string {
  const ref = String(t.transaction_number || "").trim() || "—"
  const type = String(t.type || "").trim()
  const amount = Number(t.amount || 0)
  const parts = [ref]
  if (type) parts.push(type)
  if (Number.isFinite(amount) && amount > 0) parts.push(formatCurrency(amount))
  return parts.join(" · ")
}

export type ClaimFormData = {
  assignee_type: "member" | "client" | ""
  member_id: string
  client_id: string
  transaction_id: string
}

interface ClaimFormProps {
  onSubmit: (data: ClaimFormData) => void
  onCancel: () => void
  loading?: boolean
  branchId?: string
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
  transaction_id: "",
}

const ASSIGNEE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "client", label: "Client" },
]

const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

export default function ClaimForm({
  onSubmit,
  onCancel,
  loading = false,
  branchId = "",
  depositSummary,
}: ClaimFormProps) {
  const [form, setForm] = useState<ClaimFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof ClaimFormData, string>>>({})
  const [memberOptions, setMemberOptions] = useState<{ value: string; label: string }[]>([])
  const [clientOptions, setClientOptions] = useState<{ value: string; label: string }[]>([])
  const [transactionOptions, setTransactionOptions] = useState<{ value: string; label: string }[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const disabled = loading

  useEffect(() => {
    let cancelled = false
    setLoadingLists(true)
    const branchQuery = branchId ? `&branches=${encodeURIComponent(branchId)}` : ""
    void (async () => {
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`/api/institution/members?limit=200${branchQuery}`, { cache: "no-store" }),
          fetch(`/api/institution/clients?limit=200${branchQuery}`, { cache: "no-store" }),
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
  }, [branchId])

  useEffect(() => {
    const assigneeId =
      form.assignee_type === "member"
        ? form.member_id
        : form.assignee_type === "client"
          ? form.client_id
          : ""

    if (!assigneeId) {
      setTransactionOptions([])
      return
    }

    let cancelled = false
    setLoadingTransactions(true)
    const params = new URLSearchParams()
    params.set("limit", "100")
    params.set("pageSize", "100")
    if (branchId) params.set("branches", branchId)
    if (form.assignee_type === "member") params.set("member_id", assigneeId)
    else params.set("client_id", assigneeId)

    void (async () => {
      try {
        const res = await fetch(`/api/institution/transactions?${params.toString()}`, { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setTransactionOptions([])
          return
        }
        const body = await res.json().catch(() => ({}))
        const items: RawTransaction[] = Array.isArray(body?.items) ? body.items : []
        if (cancelled) return
        setTransactionOptions(
          items
            .map((t) => ({
              value: String(t.id || ""),
              label: transactionLabel(t),
            }))
            .filter((o) => Boolean(o.value)),
        )
      } catch {
        if (!cancelled) setTransactionOptions([])
      } finally {
        if (!cancelled) setLoadingTransactions(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [branchId, form.assignee_type, form.member_id, form.client_id])

  const set = (field: keyof ClaimFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "assignee_type") {
        next.member_id = ""
        next.client_id = ""
        next.transaction_id = ""
      }
      if (field === "member_id" || field === "client_id") {
        next.transaction_id = ""
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
      transaction_id: form.transaction_id.trim(),
    })
  }

  const assigneeSelected =
    (form.assignee_type === "member" && !!form.member_id.trim()) ||
    (form.assignee_type === "client" && !!form.client_id.trim())

  const transactionPlaceholder = !assigneeSelected
    ? `Select a ${form.assignee_type || "member or client"} first`
    : loadingTransactions
      ? "Loading transactions…"
      : transactionOptions.length === 0
        ? "No transactions for this assignee"
        : "Select a transaction (optional)"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {depositSummary && (
        <div className="overflow-hidden rounded-xl border border-[#f08c2b]/20 bg-gradient-to-br from-[#f08c2b]/10 via-white to-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#f08c2b]/15 bg-[#f08c2b]/5 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#f08c2b]/20 bg-white text-[#f08c2b]">
                <Inbox className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#f08c2b]/80">
                  Deposit
                </p>
                <p className="text-base font-semibold leading-tight text-gray-900">
                  {formatCurrency(depositSummary.amount)}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Unclaimed
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 text-xs">
              <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Payment mode
                </p>
                <p className="truncate text-sm text-gray-800">{depositSummary.mode || "—"}</p>
              </div>
            </div>

            {depositSummary.date ? (
              <div className="flex items-start gap-2 text-xs">
                <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Deposit date
                  </p>
                  <p className="truncate text-sm text-gray-800">{formatDate(depositSummary.date)}</p>
                </div>
              </div>
            ) : null}

            {depositSummary.transaction_number ? (
              <div className="flex items-start gap-2 text-xs sm:col-span-2">
                <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Reference
                  </p>
                  <p className="truncate font-mono text-sm text-gray-800">
                    {depositSummary.transaction_number}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
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

      {form.assignee_type && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Transaction</label>
          <div
            className={`${disabled || loadingTransactions || !assigneeSelected || transactionOptions.length === 0 ? "pointer-events-none opacity-60" : ""}`}
          >
            <StyledSelect
              value={form.transaction_id}
              onChange={(v) => set("transaction_id", v)}
              placeholder={transactionPlaceholder}
              options={transactionOptions}
              searchable
            />
          </div>
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
