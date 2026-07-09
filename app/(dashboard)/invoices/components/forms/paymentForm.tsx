"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Calendar, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"
import { formatInvoiceStatusLabel, isPaidInvoiceStatus, normalizeInvoiceStatus } from "@/lib/invoices/status"

export type InvoicePaymentSummary = {
  id: string
  invoice_number: string
  client_name: string
  invoice_due: string | null
  total_amount: number
  paid_amount?: number
  outstanding?: number
  status: string
}

export interface InvoicePaymentPayload {
  amount: number
  mode: string
  paymentDate: string
  reference_number?: string
  bank_account_id?: string
  description?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

interface InvoicePaymentFormProps {
  invoice: InvoicePaymentSummary
  onSubmit: (data: InvoicePaymentPayload) => void | Promise<void>
  onCancel?: () => void
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const PAYMENT_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const todayYmd = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function InvoicePaymentForm({
  invoice,
  onSubmit,
  onCancel,
  loading = false,
}: InvoicePaymentFormProps) {
  const [currency, setCurrency] = useState("UGX")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [paymentType, setPaymentType] = useState<"outstanding" | "custom">("outstanding")
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState(todayYmd())
  const [referenceNumber, setReferenceNumber] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  const total = Number(invoice.total_amount || 0)
  const paid = Number(invoice.paid_amount || 0)
  const outstanding = useMemo(() => {
    if (typeof invoice.outstanding === "number") {
      return Math.max(invoice.outstanding, 0)
    }
    return Math.max(total - paid, 0)
  }, [invoice.outstanding, total, paid])

  const percentage = total > 0 ? Math.min((paid / total) * 100, 100) : 0
  const isFullyPaid = isPaidInvoiceStatus(invoice.status) || outstanding <= 0
  const statusLabel = formatInvoiceStatusLabel(normalizeInvoiceStatus(invoice.status))

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.config?.currency) {
          setCurrency(String(data.config.currency))
        }
      } catch {
        // ignore
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch("/api/institution/finances/bank-accounts?limit=100", { cache: "no-store" })
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
        // best-effort
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const fmt = (n: number) => formatCurrency(n, currency)

  const handleSubmit = () => {
    setError(null)
    const amt = paymentType === "outstanding" ? outstanding : Number(amount) || 0

    if (amt <= 0) {
      setError("Please enter a valid payment amount")
      return
    }
    if (outstanding > 0 && amt > outstanding + 0.01) {
      setError(`Amount cannot exceed the outstanding balance of ${fmt(outstanding)}`)
      return
    }
    if (!paymentDate) {
      setError("Please select a payment date")
      return
    }
    if (BANK_ROUTED_MODES.includes(mode) && !bankAccountId) {
      setError("Please select a bank account")
      return
    }
    if (mode !== "Cash" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }

    void onSubmit({
      amount: amt,
      mode,
      paymentDate,
      reference_number: referenceNumber.trim() || undefined,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
      description: description.trim() || undefined,
    })
  }

  if (isFullyPaid) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          This invoice is already fully paid.
        </div>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      <div className="rounded-lg border border-[#f08c2b]/20 bg-linear-to-r from-[#fff8f2] to-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#f08c2b]/10 p-2">
            <Receipt className="h-5 w-5 text-[#f08c2b]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
            <p className="truncate text-sm text-gray-600">{invoice.client_name || "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due {formatDate(invoice.invoice_due)}
              </span>
              <span>·</span>
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Paid so far</p>
            <p className="text-lg font-bold text-gray-900">{fmt(paid)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Invoice total</p>
            <p className="text-sm font-semibold text-gray-600">{fmt(total)}</p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[#f08c2b] transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#f08c2b]">{Math.round(percentage)}% settled</span>
          <span className="font-medium text-gray-700">Outstanding: {fmt(outstanding)}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="invoicePaymentType"
            value="outstanding"
            checked={paymentType === "outstanding"}
            onChange={() => setPaymentType("outstanding")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Pay outstanding ({fmt(outstanding)})</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="invoicePaymentType"
            value="custom"
            checked={paymentType === "custom"}
            onChange={() => setPaymentType("custom")}
            className="h-4 w-4 accent-[#f08c2b]"
          />
          <span className="text-sm text-gray-700">Partial / custom amount</span>
        </label>
      </div>

      <div className="space-y-2">
        <Label>Payment amount ({currency})</Label>
        {paymentType === "outstanding" ? (
          <input value={outstanding.toLocaleString()} readOnly className={`${inputClass} bg-gray-50 text-gray-600`} />
        ) : (
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max ${outstanding.toLocaleString()}`}
            className={inputClass}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>Payment mode</Label>
        <StyledSelect value={mode} onChange={setMode} placeholder="Select mode" options={PAYMENT_MODES} />
      </div>

      <div className="space-y-2">
        <Label>Payment date</Label>
        <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select payment date" />
      </div>

      {BANK_ROUTED_MODES.includes(mode) && (
        <div className="space-y-2">
          <Label>
            Bank account <span className="text-red-500">*</span>
          </Label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
            options={bankAccounts.map((ba) => ({
              value: ba.id,
              label: `${ba.bank_name} — ${ba.bank_account_number}`,
            }))}
          />
        </div>
      )}

      {mode !== "Cash" && (
        <div className="space-y-2">
          <Label>
            Reference number <span className="text-red-500">*</span>
          </Label>
          <input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. transaction id"
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Payment notes for the ledger"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={loading}>
          {loading ? "Processing…" : "Record payment"}
        </Button>
      </div>
    </div>
  )
}
