"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"
import ReportsForm, { buildReportPeriod, emptyReportForm, ReportFormData, validateReportForm } from "../forms/reportsForm"
import { Check } from "lucide-react"
import { useToast } from "@/components/ui/toast"

interface AddReportProps {
  isOpen: boolean
  onClose: () => void
  investmentId: string
  onSubmit?: (data: ReportFormData, selectedCashflowIds: string[]) => Promise<void> | void
}

type ReportCashflowPreview = {
  id: string
  type: "inflow" | "outflow"
  category: string
  amount: number
  description: string | null
  date: string | null
  created_at: string
  report_id: string | null
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))
const formatDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString("en-UG") : "—")
const truncateWithDots = (v?: string | null, max = 80) => {
  const text = String(v || "").trim()
  if (!text) return "No description"
  return text.length > max ? `${text.slice(0, max)}.....` : text
}

export default function AddReport({ isOpen, onClose, investmentId, onSubmit }: AddReportProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<ReportFormData>(emptyReportForm())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cashflows, setCashflows] = useState<ReportCashflowPreview[]>([])
  const [loadingCashflows, setLoadingCashflows] = useState(false)
  const [selectedCashflowIds, setSelectedCashflowIds] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyReportForm())
    setErrors({})
    setSelectedCashflowIds([])
    let cancelled = false
    const loadCashflows = async () => {
      try {
        setLoadingCashflows(true)
        const res = await fetch(`/api/institution/investments/${investmentId}/cashflows`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load cashflows")
        const rawItems = (Array.isArray(body?.items) ? body.items : []) as unknown[]
        if (cancelled) return
        const mapped: ReportCashflowPreview[] = rawItems.map((item) => {
          const c = item as Record<string, unknown>
          return {
            id: String(c.id ?? ""),
            type: (String(c.type ?? "").toLowerCase() === "outflow" ? "outflow" : "inflow") as "inflow" | "outflow",
            category: String(c.category ?? ""),
            amount: Number(c.amount ?? 0),
            description: c.description != null ? String(c.description) : null,
            date: c.date != null ? String(c.date) : null,
            created_at: String(c.created_at ?? ""),
            report_id: c.report_id != null ? String(c.report_id) : null,
          }
        })
        setCashflows(
          mapped
            .filter((c) => !c.report_id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        )
      } finally {
        if (!cancelled) setLoadingCashflows(false)
      }
    }
    void loadCashflows()
    return () => {
      cancelled = true
    }
  }, [isOpen, investmentId])

  const patchForm = (patch: Partial<ReportFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setErrors({})
  }

  const updateCashflowSelection = (id: string, checked: boolean) => {
    setSelectedCashflowIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

  const handleSave = async () => {
    const selected = cashflows.filter((c) => selectedCashflowIds.includes(c.id))
    const totalCheckedCapitalOutflows = selected
      .filter((c) => c.category === "capital" && c.type === "outflow")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0)
    const totalCheckedIncomeInflows = selected
      .filter((c) => c.category === "income" && c.type === "inflow")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0)
    const totalCheckedExpenseOutflows = selected
      .filter((c) => c.category === "expense" && c.type === "outflow")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0)

    const mismatchCapital = Math.abs(Number(form.capitalAdded || 0) - totalCheckedCapitalOutflows) > 0.01
    const mismatchIncome = Math.abs(Number(form.income || 0) - totalCheckedIncomeInflows) > 0.01
    const mismatchExpenses = Math.abs(Number(form.expenses || 0) - totalCheckedExpenseOutflows) > 0.01
    if (mismatchCapital || mismatchIncome || mismatchExpenses) {
      toast({
        variant: "warning",
        title: "Checked cashflows do not match report totals",
        description:
          `Capital Added must equal checked capital outflows (${formatCurrency(totalCheckedCapitalOutflows)}), ` +
          `Income must equal checked income inflows (${formatCurrency(totalCheckedIncomeInflows)}), ` +
          `Expenses must equal checked expense outflows (${formatCurrency(totalCheckedExpenseOutflows)}).`,
      })
      return
    }

    const v = validateReportForm(form)
    if (Object.keys(v).length > 0) {
      setErrors(v)
      return
    }
    try {
      setSaving(true)
      if (onSubmit) await onSubmit(form, selectedCashflowIds)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Monthly Report" className="z-20">
      <div className="p-4 space-y-4 max-h-[min(80vh,36rem)] overflow-y-auto">
        <ReportsForm value={form} onChange={patchForm} disabled={saving} errors={errors} />
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Cashflows (latest first)</h4>
          {loadingCashflows ? (
            <p className="text-xs text-muted-foreground">Loading cashflows...</p>
          ) : cashflows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cashflows found.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {cashflows.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 flex items-start gap-2.5"
                >
                  <label className="mt-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedCashflowIds.includes(c.id)}
                      disabled={saving}
                      onChange={(e) => updateCashflowSelection(c.id, e.target.checked)}
                    />
                    <div
                      className={`relative mt-0.5 h-[18px] w-[18px] border-2 flex items-center justify-center rounded-full transition-all ${
                        selectedCashflowIds.includes(c.id)
                          ? "bg-[#f08c2b] border-[#f08c2b]"
                          : "bg-white border-gray-400"
                      }`}
                    >
                      {selectedCashflowIds.includes(c.id) && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                  </label>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800">
                      {c.type.toUpperCase()} · {c.category.toUpperCase()} · {formatCurrency(c.amount)}
                    </p>
                    <p className="text-[11px] text-gray-500">{formatDateTime(c.created_at)}</p>
                    <p className="text-xs text-gray-600" title={c.description || undefined}>
                      {truncateWithDots(c.description)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Report"}
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
