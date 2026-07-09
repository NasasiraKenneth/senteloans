"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

/** Who this cashflow is attributed to (maps to `staff_id` or `third_party_agent_id`). */
export type CashflowAssigneeType = "staff" | "third_party_agent" | ""

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

const PAYMENT_STATUS_OPTIONS = [
  { value: "fully_paid", label: "Fully Paid" },
  { value: "unpaid", label: "Unpaid" },
]

export interface FlowFormData {
  type: CashflowAssigneeType
  staffId: string
  thirdPartyAgentId: string
  amount: number
  description: string
  /** Business date (maps to `date` column); empty string if not set */
  date: string
  paymentStatus: string
  /** Payment mode; required for expense cashflows */
  transactionMode: string
  bankAccountId: string
  referenceNumber: string
  /** Optional fees for non-cash modes; 0 when unset */
  transactionCharges: number
}

const ASSIGNEE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "third_party_agent", label: "Third Party Agent" },
]

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export function isExpenseCashflowFullyPaidStatus(paymentStatus: string): boolean {
  return paymentStatus === "fully_paid"
}

export function emptyFlowForm(): FlowFormData {
  return {
    type: "",
    staffId: "",
    thirdPartyAgentId: "",
    amount: 0,
    description: "",
    date: "",
    paymentStatus: "",
    transactionMode: "",
    bankAccountId: "",
    referenceNumber: "",
    transactionCharges: 0,
  }
}

/** Expense cashflow outflows allow transaction charges for non-cash payment modes. */
export function allowsExpenseCashflowTransactionCharges(transactionMode: string): boolean {
  const mode = String(transactionMode || "").trim()
  return Boolean(mode) && mode !== "Cash"
}

/** Map an expense cashflow row (from API / table) into form state for editing. */
export function flowFormDataFromExpenseCashflowRow(row: {
  staff_id?: string | null
  third_party_agent_id?: string | null
  amount?: number
  description?: string | null
  date?: string | null
  payment_method?: string | null
  bank_account_id?: string | null
  reference_number?: string | null
  transaction_charges?: number | null
}): FlowFormData {
  const staffId = row.staff_id != null ? String(row.staff_id).trim() : ""
  const thirdPartyAgentId =
    row.third_party_agent_id != null ? String(row.third_party_agent_id).trim() : ""
  const type: CashflowAssigneeType = staffId ? "staff" : thirdPartyAgentId ? "third_party_agent" : ""
  const rawDate = row.date != null ? String(row.date).trim() : ""
  const date = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate
  return {
    type,
    staffId,
    thirdPartyAgentId,
    amount: Number(row.amount ?? 0),
    description: row.description != null ? String(row.description) : "",
    date,
    paymentStatus: "",
    transactionMode: row.payment_method != null ? String(row.payment_method).trim() : "",
    bankAccountId: row.bank_account_id != null ? String(row.bank_account_id).trim() : "",
    referenceNumber: row.reference_number != null ? String(row.reference_number).trim() : "",
    transactionCharges: Number(row.transaction_charges ?? 0),
  }
}

export function validateFlowForm(
  data: FlowFormData,
  opts?: { requireDate?: boolean },
): Record<string, string> {
  const err: Record<string, string> = {}
  if (!data.type) err.type = "Select staff or third party agent"
  if (data.type === "staff" && !String(data.staffId || "").trim()) {
    err.staffId = "Select a staff member"
  }
  if (data.type === "third_party_agent" && !String(data.thirdPartyAgentId || "").trim()) {
    err.thirdPartyAgentId = "Select a third party agent"
  }
  const requireDate = opts?.requireDate !== false
  if (requireDate && !String(data.date || "").trim()) err.date = "Select a cashflow date"
  if (Number.isNaN(data.amount) || data.amount <= 0) {
    err.amount = "Amount must be greater than zero"
  }

  if (!isExpenseCashflowFullyPaidStatus(data.paymentStatus)) {
    return err
  }

  if (!data.transactionMode) {
    err.transactionMode = "Select a transaction mode"
  } else {
    const isCash = data.transactionMode === "Cash"
    if (!isCash && !String(data.referenceNumber || "").trim()) {
      err.referenceNumber = `Reference number is required for ${data.transactionMode} payments`
    }
    if (isBankRoutedPaymentMode(data.transactionMode) && !String(data.bankAccountId || "").trim()) {
      err.bankAccountId = "Please select a bank account"
    }
    if (isCash && Number(data.transactionCharges || 0) > 0) {
      err.transactionCharges = "Transaction charges are not allowed for cash payments"
    }
    const charges = Number(data.transactionCharges || 0)
    const showCharges = allowsExpenseCashflowTransactionCharges(data.transactionMode)
    if (showCharges && data.transactionCharges != null && Number.isFinite(charges) && charges < 0) {
      err.transactionCharges = "Transaction charges must be zero or greater"
    }
    if (!showCharges && charges > 0) {
      err.transactionCharges = "Transaction charges are not allowed for cash payments"
    }
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
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [transactionChargesInput, setTransactionChargesInput] = useState("")

  const isFullyPaid = isExpenseCashflowFullyPaidStatus(value.paymentStatus)
  const isCashMode = value.transactionMode === "Cash"
  const isBankRoutedMode = isBankRoutedPaymentMode(value.transactionMode)
  const showChargesField = allowsExpenseCashflowTransactionCharges(value.transactionMode)

  const chargesNumber = transactionChargesInput.trim() === "" ? 0 : Number(transactionChargesInput)
  const invalidCharges =
    !isCashMode &&
    transactionChargesInput.trim() !== "" &&
    (!Number.isFinite(chargesNumber) || chargesNumber < 0)

  useEffect(() => {
    const charges = Number(value.transactionCharges || 0)
    setTransactionChargesInput(charges > 0 ? String(charges) : "")
  }, [value.transactionCharges])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch("/api/institution/finances/bank-accounts?rowsPerPage=100", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          rows?: BankAccount[]
          items?: BankAccount[]
          bankAccounts?: BankAccount[]
        }
        const rows = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.bankAccounts)
              ? data.bankAccounts
              : []
        if (!cancelled) setBankAccounts(rows)
      } catch {
        // Best-effort; select shows empty if load fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

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
          fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" }),
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
          const clients = Array.isArray(cBody?.third_party_agents) ? cBody.third_party_agents : []
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
      thirdPartyAgentId: t === "third_party_agent" ? value.thirdPartyAgentId : "",
    })
  }

  const handlePaymentStatusChange = (next: string) => {
    const patch: Partial<FlowFormData> = { paymentStatus: next }
    if (!isExpenseCashflowFullyPaidStatus(next)) {
      patch.transactionMode = ""
      patch.bankAccountId = ""
      patch.referenceNumber = ""
      patch.transactionCharges = 0
      setTransactionChargesInput("")
    }
    onChange(patch)
  }

  const handleTransactionModeChange = (mode: string) => {
    const patch: Partial<FlowFormData> = { transactionMode: mode }
    if (mode === "Cash") {
      patch.bankAccountId = ""
      patch.referenceNumber = ""
      patch.transactionCharges = 0
      setTransactionChargesInput("")
    } else if (!isBankRoutedPaymentMode(mode)) {
      patch.bankAccountId = ""
    }
    onChange(patch)
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
            placeholder="Select staff or Third Party Agent"
          />
        </div>
        {errors.type && <p className="text-xs text-red-600">{errors.type}</p>}
        {loadingLists && (
          <p className="text-xs text-muted-foreground">Loading staff and agents…</p>
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

      {value.type === "third_party_agent" && (
        <div className="space-y-1.5">
          <Label>Third Party Agent *</Label>
          <div className={disabled || (loadingLists && clientOptions.length === 0) ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.thirdPartyAgentId}
              onChange={(v) => onChange({ thirdPartyAgentId: v })}
              options={clientOptions}
              placeholder={loadingLists ? "Loading agents…" : "Select agent"}
              searchable
            />
          </div>
          {errors.thirdPartyAgentId && <p className="text-xs text-red-600">{errors.thirdPartyAgentId}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Payment status</Label>
        <div className={disabled ? "pointer-events-none opacity-70" : ""}>
          <StyledSelect
            value={value.paymentStatus}
            onChange={handlePaymentStatusChange}
            options={PAYMENT_STATUS_OPTIONS}
            placeholder="Select fully paid or unpaid"
          />
        </div>
      </div>

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

      {isFullyPaid ? (
        <div className="space-y-1.5">
          <Label>Transaction mode *</Label>
          <div className={disabled ? "pointer-events-none opacity-70" : ""}>
            <StyledSelect
              value={value.transactionMode}
              onChange={handleTransactionModeChange}
              options={PAYMENT_MODE_OPTIONS}
              placeholder="Select transaction mode"
            />
          </div>
          {errors.transactionMode && <p className="text-xs text-red-600">{errors.transactionMode}</p>}
        </div>
      ) : null}

      {isFullyPaid && value.transactionMode ? (
        <>
          {isBankRoutedMode ? (
            <div className="space-y-1.5">
              <Label>
                Bank account <span className="text-red-500">*</span>
              </Label>
              <div className={disabled ? "pointer-events-none opacity-70" : ""}>
                <StyledSelect
                  value={value.bankAccountId}
                  onChange={(v) => onChange({ bankAccountId: v })}
                  options={bankAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.bank_name} — ${account.bank_account_number}`,
                  }))}
                  placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
                  searchable
                />
              </div>
              {errors.bankAccountId && <p className="text-xs text-red-600">{errors.bankAccountId}</p>}
            </div>
          ) : null}

          {!isCashMode ? (
            showChargesField ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Transaction charges</Label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={transactionChargesInput}
                    onChange={(e) => {
                      setTransactionChargesInput(e.target.value)
                      const raw = e.target.value.trim()
                      const next = raw === "" ? 0 : Number(raw)
                      onChange({ transactionCharges: Number.isFinite(next) ? next : 0 })
                    }}
                    placeholder="0"
                    className={`${inputClass} ${invalidCharges || errors.transactionCharges ? "border-red-500" : ""}`}
                    disabled={disabled}
                  />
                  {errors.transactionCharges ? (
                    <p className="text-xs text-red-600">{errors.transactionCharges}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Optional fees for {value.transactionMode} payments.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Reference number <span className="text-red-500">*</span>
                  </Label>
                  <input
                    value={value.referenceNumber}
                    onChange={(e) => onChange({ referenceNumber: e.target.value })}
                    placeholder="e.g. transaction id"
                    className={`${inputClass} ${errors.referenceNumber ? "border-red-500" : ""}`}
                    disabled={disabled}
                  />
                  {errors.referenceNumber ? (
                    <p className="text-xs text-red-600">{errors.referenceNumber}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Required for {value.transactionMode} payments.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  Reference number <span className="text-red-500">*</span>
                </Label>
                <input
                  value={value.referenceNumber}
                  onChange={(e) => onChange({ referenceNumber: e.target.value })}
                  placeholder="e.g. transaction id"
                  className={`${inputClass} ${errors.referenceNumber ? "border-red-500" : ""}`}
                  disabled={disabled}
                />
                {errors.referenceNumber ? (
                  <p className="text-xs text-red-600">{errors.referenceNumber}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Required for {value.transactionMode} payments.
                  </p>
                )}
              </div>
            )
          ) : null}
        </>
      ) : null}

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
