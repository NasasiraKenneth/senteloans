"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"

/** Who this cashflow is attributed to (maps to `staff_id` or `client_id`). */
export type CashflowAssigneeType = "staff" | "clients" | ""

export interface FlowFormData {
  type: CashflowAssigneeType
  staffId: string
  clientId: string
  amount: number
  description: string
  /** Business date (maps to `date` column); empty string if not set */
  date: string
  /** Optional payment / transaction mode (select); empty string if not set */
  transactionMode: string
}

const ASSIGNEE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "clients", label: "Clients" },
]

const TRANSACTION_MODE_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export function emptyFlowForm(): FlowFormData {
  return {
    type: "",
    staffId: "",
    clientId: "",
    amount: 0,
    description: "",
    date: "",
    transactionMode: "",
  }
}

/** Map an expense cashflow row (from API / table) into form state for editing. */
export function flowFormDataFromExpenseCashflowRow(row: {
  staff_id?: string | null
  client_id?: string | null
  amount?: number
  description?: string | null
  date?: string | null
  payment_method?: string | null
}): FlowFormData {
  const staffId = row.staff_id != null ? String(row.staff_id).trim() : ""
  const clientId = row.client_id != null ? String(row.client_id).trim() : ""
  const type: CashflowAssigneeType = staffId ? "staff" : clientId ? "clients" : ""
  const rawDate = row.date != null ? String(row.date).trim() : ""
  const date = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate
  return {
    type,
    staffId,
    clientId,
    amount: Number(row.amount ?? 0),
    description: row.description != null ? String(row.description) : "",
    date,
    transactionMode: row.payment_method != null ? String(row.payment_method).trim() : "",
  }
}

export function validateFlowForm(
  data: FlowFormData,
  opts?: { requireDate?: boolean },
): Record<string, string> {
  const err: Record<string, string> = {}
  if (!data.type) err.type = "Select staff or clients"
  if (data.type === "staff" && !String(data.staffId || "").trim()) {
    err.staffId = "Select a staff member"
  }
  if (data.type === "clients" && !String(data.clientId || "").trim()) {
    err.clientId = "Select a client"
  }
  const requireDate = opts?.requireDate !== false
  if (requireDate && !String(data.date || "").trim()) err.date = "Select a cashflow date"
  if (Number.isNaN(data.amount) || data.amount <= 0) {
    err.amount = "Amount must be greater than zero"
  }
  return err
}

interface FlowFormProps {
  expenseId: string
  value: FlowFormData
  onChange: (patch: Partial<FlowFormData>) => void
  disabled?: boolean
  errors?: Partial<Record<keyof FlowFormData | "root", string>>
}

export default function FlowForm({
  expenseId,
  value,
  onChange,
  disabled = false,
  errors = {},
}: FlowFormProps) {
  const [staffOptions, setStaffOptions] = useState<{ value: string; label: string }[]>([])
  const [clientOptions, setClientOptions] = useState<{ value: string; label: string }[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!expenseId) {
      setStaffOptions([])
      setClientOptions([])
      return
    }
    setLoadingLists(true)
    void (async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch(`/api/institution/expenses/${expenseId}/cashflow-staff`, { cache: "no-store" }),
          fetch("/api/institution/clients?limit=200", { cache: "no-store" }),
        ])
        const sBody = await sRes.json().catch(() => ({}))
        const cBody = await cRes.json().catch(() => ({}))
        if (!cancelled && sRes.ok) {
          const staff = Array.isArray(sBody?.staff) ? sBody.staff : []
          setStaffOptions(
            staff
              .map((u: { id?: string; full_name?: string; email?: string }) => {
                const name = String(u.full_name || "").trim()
                const email = String(u.email || "").trim()
                const label = name ? (email ? `${name} (${email})` : name) : email || "Staff"
                return { value: String(u.id || ""), label }
              })
              .filter((o: { value: string }) => Boolean(o.value)),
          )
        } else if (!cancelled) setStaffOptions([])
        if (!cancelled && cRes.ok) {
          const clients = Array.isArray(cBody?.clients) ? cBody.clients : []
          setClientOptions(
            clients.map((c: { id?: string; name?: string }) => ({
              value: String(c.id || ""),
              label: String(c.name || "Client").trim() || "Client",
            })).filter((o: { value: string }) => Boolean(o.value)),
          )
        } else if (!cancelled) setClientOptions([])
      } catch {
        if (!cancelled) {
          setStaffOptions([])
          setClientOptions([])
        }
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [expenseId])

  const handleAssigneeTypeChange = (next: string) => {
    const t = next as CashflowAssigneeType
    onChange({
      type: t,
      staffId: t === "staff" ? value.staffId : "",
      clientId: t === "clients" ? value.clientId : "",
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Type *</Label>
        <div className={disabled ? "pointer-events-none opacity-70" : ""}>
          <StyledSelect
            value={value.type}
            onChange={handleAssigneeTypeChange}
            options={ASSIGNEE_OPTIONS}
            placeholder="Select staff or clients"
          />
        </div>
        {errors.type && <p className="text-xs text-red-600">{errors.type}</p>}
        {loadingLists && (
          <p className="text-xs text-muted-foreground">Loading staff and clients…</p>
        )}
      </div>

      {value.type === "staff" && (
        <div className="space-y-1.5">
          <Label>Staff *</Label>
          <div className={disabled || (loadingLists && staffOptions.length === 0) ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.staffId}
              onChange={(v) => onChange({ staffId: v })}
              options={staffOptions}
              placeholder={loadingLists ? "Loading staff…" : "Select staff"}
              searchable
            />
          </div>
          {errors.staffId && <p className="text-xs text-red-600">{errors.staffId}</p>}
        </div>
      )}

      {value.type === "clients" && (
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <div className={disabled || (loadingLists && clientOptions.length === 0) ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.clientId}
              onChange={(v) => onChange({ clientId: v })}
              options={clientOptions}
              placeholder={loadingLists ? "Loading clients…" : "Select client"}
              searchable
            />
          </div>
          {errors.clientId && <p className="text-xs text-red-600">{errors.clientId}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cashflow date *</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <ReeveDatePicker
              value={value.date}
              onChange={(d) => onChange({ date: d })}
              placeholder="Select date"
            />
          </div>
          {errors.date && <p className="text-xs text-red-600">{errors.date}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Transaction mode (optional)</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.transactionMode}
              onChange={(v) => onChange({ transactionMode: v })}
              options={TRANSACTION_MODE_OPTIONS}
              placeholder="Select transaction mode"
            />
          </div>
          {errors.transactionMode && <p className="text-xs text-red-600">{errors.transactionMode}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Amount *</Label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value.amount || ""}
          onChange={(e) => onChange({ amount: Number(e.target.value || 0) })}
          placeholder="0"
          className={inputClass}
          disabled={disabled}
        />
        {errors.amount && <p className="text-xs text-red-600">{errors.amount}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Optional notes"
          className={inputClass}
          disabled={disabled}
        />
        {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
      </div>

      {errors.root && <p className="text-xs text-red-600">{errors.root}</p>}
    </div>
  )
}
