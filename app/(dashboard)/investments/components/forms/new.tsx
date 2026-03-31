"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { FaExclamationTriangle, FaSave, FaTimes, FaTrash } from "react-icons/fa"
import { MdFormatListBulletedAdd } from "react-icons/md"

type ProviderOption = {
  id: string
  name: string
}

export interface InvestmentFundingItem {
  id: string
  type: "savings" | "shares" | "reserves" | "loan" | "grant"
  amount: number
  loanId?: string
}

export interface InvestmentPartnerItem {
  id: string
  counterpartyId: string
  role: "lead_partner" | "co_investor" | "partner" | ""
  contributionPercentage: number
  contributionAmount: number
  ownershipPercentage: number
  status: "Active" | "Inactive"
}

export interface NewInvestmentFormData {
  clientId: string
  clientName: string
  investmentType: string
  riskLevel: string
  expectedPercentagePerAnnum: number
  principalAmount: number
  expectedReturns: number
  startDate: string
  maturityDate: string
  status: string
  description: string
  partners: InvestmentPartnerItem[]
  funding: InvestmentFundingItem[]
}

interface NewInvestmentFormProps {
  onSubmit: (data: NewInvestmentFormData) => Promise<void>
  onClose?: () => void
  loading?: boolean
  initialValues?: Partial<NewInvestmentFormData>
}

const INVESTMENT_TYPE_OPTIONS = [
  { value: "fixed_income", label: "Fixed Income" },
  { value: "project", label: "Project" },
  { value: "equity", label: "Equity" },
  { value: "partnership", label: "Partnership" },
]

const RISK_LEVEL_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
]

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Active", label: "Active" },
  { value: "Matured", label: "Matured" },
  { value: "Closed", label: "Closed" },
  { value: "Cancelled", label: "Cancelled" },
]

const FUNDING_TYPE_OPTIONS = [
  { value: "savings", label: "Savings" },
  { value: "shares", label: "Shares" },
  { value: "reserves", label: "Reserves" },
  { value: "loan", label: "Loan" },
  { value: "grant", label: "Grant" },
]

const PARTNER_ROLE_OPTIONS = [
  { value: "lead_partner", label: "Lead Partner" },
  { value: "co_investor", label: "Co Investor" },
]

const toYmd = (value: unknown): string => {
  if (!value) return ""
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function NewInvestmentForm({
  onSubmit,
  onClose,
  loading = false,
  initialValues = {},
}: NewInvestmentFormProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [loans, setLoans] = useState<Array<{ id: string; label: string }>>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<NewInvestmentFormData>({
    clientId: String(initialValues.clientId || ""),
    clientName: String(initialValues.clientName || ""),
    investmentType: String(initialValues.investmentType || ""),
    riskLevel: String(initialValues.riskLevel || ""),
    expectedPercentagePerAnnum: Number(initialValues.expectedPercentagePerAnnum || 0),
    principalAmount: Number(initialValues.principalAmount || 0),
    expectedReturns: Number(initialValues.expectedReturns || 0),
    startDate: toYmd(initialValues.startDate),
    maturityDate: toYmd(initialValues.maturityDate),
    status: String(initialValues.status || "Pending"),
    description: String(initialValues.description || ""),
    partners: Array.isArray(initialValues.partners) ? initialValues.partners : [],
    funding: Array.isArray(initialValues.funding) ? initialValues.funding : [],
  })

  useEffect(() => {
    let cancelled = false
    const fetchProviders = async () => {
      try {
        setLoadingProviders(true)
        const res = await fetch("/api/institution/clients?limit=200", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (Array.isArray(data?.clients) ? data.clients : [])
        if (cancelled) return
        setProviders(
          list.map((c: any) => ({
            id: String(c.id || ""),
            name: String(c.full_name || c.clientName || ""),
          })),
        )
      } finally {
        if (!cancelled) setLoadingProviders(false)
      }
    }
    void fetchProviders()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchLoans = async () => {
      try {
        setLoadingLoans(true)
        const res = await fetch("/api/institution/investments/loans?pageSize=200", { cache: "no-store" })
        if (!res.ok) return
        const body = await res.json().catch(() => ({}))
        const items = Array.isArray(body?.items) ? body.items : []
        if (cancelled) return
        setLoans(
          items.map((loan: any) => ({
            id: String(loan.id || ""),
            label: String(loan.label || "Loan"),
          })),
        )
      } finally {
        if (!cancelled) setLoadingLoans(false)
      }
    }
    void fetchLoans()
    return () => {
      cancelled = true
    }
  }, [])

  const setField = (field: keyof NewInvestmentFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const selectedClientName = useMemo(
    () => providers.find((c) => c.id === formData.clientId)?.name || formData.clientName,
    [providers, formData.clientId, formData.clientName],
  )

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!formData.investmentType) nextErrors.investmentType = "Investment type is required"
    if (!formData.riskLevel) nextErrors.riskLevel = "Risk level is required"
    if (!formData.startDate) nextErrors.startDate = "Start date is required"
    if (!formData.maturityDate) nextErrors.maturityDate = "Maturity date is required"
    if (formData.expectedPercentagePerAnnum < 0) nextErrors.expectedPercentagePerAnnum = "Expected percentage cannot be negative"
    if (formData.principalAmount <= 0) nextErrors.principalAmount = "Principal amount must be greater than zero"
    if (formData.expectedReturns < 0) nextErrors.expectedReturns = "Expected returns cannot be negative"

    const start = formData.startDate ? new Date(`${formData.startDate}T00:00:00`) : null
    const maturity = formData.maturityDate ? new Date(`${formData.maturityDate}T00:00:00`) : null
    if (start && maturity && maturity < start) {
      nextErrors.maturityDate = "Maturity date cannot be before start date"
    }
    for (const row of formData.funding) {
      if (!row.type) nextErrors.funding = "Funding type is required"
      if (Number(row.amount || 0) <= 0) nextErrors.funding = "Funding amount must be greater than zero"
      if (row.type === "loan" && !row.loanId) nextErrors.funding = "Select a loan for funding type loan"
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...formData,
      clientName: selectedClientName || "",
    })
  }

  const addFundingRow = () => {
    const row: InvestmentFundingItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "savings",
      amount: 0,
    }
    setFormData((prev) => ({ ...prev, funding: [...prev.funding, row] }))
    if (errors.funding) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.funding
        return next
      })
    }
  }

  const updateFundingRow = (id: string, patch: Partial<InvestmentFundingItem>) => {
    setFormData((prev) => ({
      ...prev,
      funding: prev.funding.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if (next.type !== "loan") delete next.loanId
        return next
      }),
    }))
    if (errors.funding) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.funding
        return next
      })
    }
  }

  const removeFundingRow = (id: string) => {
    setFormData((prev) => ({ ...prev, funding: prev.funding.filter((row) => row.id !== id) }))
  }

  const addPartnerRow = () => {
    const row: InvestmentPartnerItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      counterpartyId: "",
      role: "",
      contributionPercentage: 0,
      contributionAmount: 0,
      ownershipPercentage: 0,
      status: "Active",
    }
    setFormData((prev) => ({ ...prev, partners: [...prev.partners, row] }))
  }

  const updatePartnerRow = (id: string, patch: Partial<InvestmentPartnerItem>) => {
    setFormData((prev) => ({
      ...prev,
      partners: prev.partners.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  const removePartnerRow = (id: string) => {
    setFormData((prev) => ({ ...prev, partners: prev.partners.filter((row) => row.id !== id) }))
  }

  return (
    <div className="w-full max-h-[85vh] overflow-auto max-w-6xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <h3 className="text-lg font-medium">New Investment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <StyledSelect
                value={formData.clientId}
                onChange={(value) => setField("clientId", value)}
                placeholder={loadingProviders ? "Loading providers..." : "Select provider"}
                options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                searchable
              />
              {errors.clientId && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.clientId}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Investment Type *</Label>
              <StyledSelect
                value={formData.investmentType}
                onChange={(value) => setField("investmentType", value)}
                placeholder="Select investment type"
                options={INVESTMENT_TYPE_OPTIONS}
              />
              {errors.investmentType && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.investmentType}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Risk Level *</Label>
              <StyledSelect
                value={formData.riskLevel}
                onChange={(value) => setField("riskLevel", value)}
                placeholder="Select risk level"
                options={RISK_LEVEL_OPTIONS}
              />
              {errors.riskLevel && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.riskLevel}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <StyledSelect
                value={formData.status}
                onChange={(value) => setField("status", value)}
                placeholder="Select status"
                options={STATUS_OPTIONS}
              />
            </div>

            <div className="space-y-2">
              <Label>Expected % Per Annum</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.expectedPercentagePerAnnum || ""}
                onChange={(e) => setField("expectedPercentagePerAnnum", Number(e.target.value || 0))}
                placeholder="Enter expected percentage per annum"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errors.expectedPercentagePerAnnum && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.expectedPercentagePerAnnum}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Principal Amount *</Label>
              <input
                type="number"
                min={0}
                value={formData.principalAmount || ""}
                onChange={(e) => setField("principalAmount", Number(e.target.value || 0))}
                placeholder="Enter principal amount"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errors.principalAmount && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.principalAmount}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Expected Returns</Label>
              <input
                type="number"
                min={0}
                value={formData.expectedReturns || ""}
                onChange={(e) => setField("expectedReturns", Number(e.target.value || 0))}
                placeholder="Enter expected returns"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errors.expectedReturns && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.expectedReturns}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Start Date *</Label>
              <ReeveDatePicker
                value={formData.startDate}
                onChange={(value) => setField("startDate", value)}
                placeholder="Select start date"
              />
              {errors.startDate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.startDate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Maturity Date *</Label>
              <ReeveDatePicker
                value={formData.maturityDate}
                onChange={(value) => setField("maturityDate", value)}
                placeholder="Select maturity date"
              />
              {errors.maturityDate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.maturityDate}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <textarea
              value={formData.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={4}
              placeholder="Additional details about this investment"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {String(formData.investmentType || "").toLowerCase() === "partnership" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Partners</Label>
                <Button type="button" variant="outline" onClick={addPartnerRow} title="Add partner" aria-label="Add partner">
                  <MdFormatListBulletedAdd className="h-4 w-4" />
                </Button>
              </div>

              {formData.partners.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No partners added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.partners.map((row) => (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-md border p-3">
                      <div className="md:col-span-3 space-y-1.5">
                        <Label>Counterparty</Label>
                        <StyledSelect
                          value={row.counterpartyId}
                          onChange={(value) => updatePartnerRow(row.id, { counterpartyId: value })}
                          options={providers.map((p) => ({ value: p.id, label: p.name }))}
                          placeholder={loadingProviders ? "Loading counterparties..." : "Select counterparty"}
                          searchable
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Role</Label>
                        <StyledSelect
                          value={row.role}
                          onChange={(value) => updatePartnerRow(row.id, { role: value as InvestmentPartnerItem["role"] })}
                          options={PARTNER_ROLE_OPTIONS}
                          placeholder="Select role"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Contribution %</Label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.contributionPercentage || ""}
                          onChange={(e) => updatePartnerRow(row.id, { contributionPercentage: Number(e.target.value || 0) })}
                          placeholder="0"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Contribution Amt</Label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.contributionAmount || ""}
                          onChange={(e) => updatePartnerRow(row.id, { contributionAmount: Number(e.target.value || 0) })}
                          placeholder="0"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>

                      <div className="md:col-span-1 space-y-1.5">
                        <Label>Owner %</Label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.ownershipPercentage || ""}
                          onChange={(e) => updatePartnerRow(row.id, { ownershipPercentage: Number(e.target.value || 0) })}
                          placeholder="0"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus:ring-ring"
                        />
                      </div>

                      <div className="md:col-span-1 space-y-1.5">
                        <Label>Status</Label>
                        <div className="h-10 flex items-center">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <div className="relative">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={row.status === "Active"}
                                onChange={(e) => updatePartnerRow(row.id, { status: e.target.checked ? "Active" : "Inactive" })}
                              />
                              <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
                              <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow" />
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="md:col-span-1 flex items-end justify-center">
                        <button
                          type="button"
                          onClick={() => removePartnerRow(row.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Remove partner row"
                          title="Remove"
                        >
                          <FaTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Investment Funding</Label>
              <Button type="button" variant="outline" onClick={addFundingRow} title="Add funding source" aria-label="Add funding source">
                <MdFormatListBulletedAdd className="h-4 w-4" />
              </Button>
            </div>

            {formData.funding.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                No funding source added yet.
              </div>
            ) : (
              <div className="space-y-3">
                {formData.funding.map((row) => (
                  <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-md border p-3">
                    <div className="md:col-span-4 space-y-1.5">
                      <Label>Type</Label>
                      <StyledSelect
                        value={row.type}
                        onChange={(value) => updateFundingRow(row.id, { type: value as InvestmentFundingItem["type"] })}
                        options={FUNDING_TYPE_OPTIONS}
                        placeholder="Select funding type"
                      />
                    </div>
                    <div className={row.type === "loan" ? "md:col-span-3 space-y-1.5" : "md:col-span-6 space-y-1.5"}>
                      <Label>Amount</Label>
                      <input
                        type="number"
                        min={0}
                        value={row.amount || ""}
                        onChange={(e) => updateFundingRow(row.id, { amount: Number(e.target.value || 0) })}
                        placeholder="Enter amount"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    {row.type === "loan" && (
                      <div className="md:col-span-4 space-y-1.5">
                        <Label>Select Loan</Label>
                        <StyledSelect
                          value={row.loanId || ""}
                          onChange={(value) => updateFundingRow(row.id, { loanId: value })}
                          options={loans.map((loan) => ({ value: loan.id, label: loan.label }))}
                          placeholder={loadingLoans ? "Loading loans..." : "Select loan"}
                          searchable
                        />
                      </div>
                    )}
                    <div className="md:col-span-1 flex items-end">
                      <button
                        type="button"
                        onClick={() => removeFundingRow(row.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="Remove funding row"
                        title="Remove"
                      >
                        <FaTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {errors.funding && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <FaExclamationTriangle className="w-3 h-3" />
                {errors.funding}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            <FaTimes className="mr-2 h-3 w-3" />
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <FaSave className="mr-2 h-3 w-3" />
                Create Investment
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
