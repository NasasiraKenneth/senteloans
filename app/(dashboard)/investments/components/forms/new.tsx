"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { FaExclamationTriangle, FaSave, FaTimes, FaTrash } from "react-icons/fa"
import { MdFormatListBulletedAdd } from "react-icons/md"
import {
  Briefcase,
  Building2,
  CalendarClock,
  HandCoins,
  Info,
  PiggyBank,
  Users2,
} from "lucide-react"

type ProviderOption = {
  id: string
  name: string
  address: string
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
  investmentName: string
  investmentAddress: string
  riskLevel: string
  expectedPercentagePerAnnum: number
  principalAmount: number
  expectedReturns: number
  periodValue: number
  periodUnit: "months" | "years"
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
  { value: "securities", label: "Securities" },
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

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

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
    investmentName: String(initialValues.investmentName || ""),
    investmentAddress: String(initialValues.investmentAddress || ""),
    riskLevel: String(initialValues.riskLevel || ""),
    expectedPercentagePerAnnum: Number(initialValues.expectedPercentagePerAnnum || 0),
    principalAmount: Number(initialValues.principalAmount || 0),
    expectedReturns: Number(initialValues.expectedReturns || 0),
    periodValue: Number(initialValues.periodValue || 0),
    periodUnit: (initialValues.periodUnit as "months" | "years") || "months",
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
        const res = await fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (Array.isArray(data?.third_party_agents) ? data.third_party_agents : [])
        if (cancelled) return
        setProviders(
          list.map((c: any) => ({
            id: String(c.id || ""),
            name: String(c.name || c.full_name || c.clientName || ""),
            address: String(c.address || ""),
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
    const startDate = String(formData.startDate || "").trim()
    const periodValue = Number(formData.periodValue || 0)
    const periodUnit = formData.periodUnit
    if (!startDate || !(periodValue > 0)) return

    const base = new Date(`${startDate}T00:00:00`)
    if (Number.isNaN(base.getTime())) return

    const maturity = new Date(base)
    if (periodUnit === "years") {
      maturity.setFullYear(maturity.getFullYear() + periodValue)
    } else {
      maturity.setMonth(maturity.getMonth() + periodValue)
    }

    const nextMaturityDate = toYmd(maturity)
    if (!nextMaturityDate) return
    if (nextMaturityDate === formData.maturityDate) return

    setFormData((prev) => ({
      ...prev,
      maturityDate: nextMaturityDate,
    }))
  }, [formData.startDate, formData.periodValue, formData.periodUnit, formData.maturityDate])

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
    setFormData((prev) => {
      const next: NewInvestmentFormData = { ...prev, [field]: value }

      // Project investments do not have a provider; clear any selection if type switches to project.
      if (field === "investmentType" && String(value || "").toLowerCase() === "project") {
        next.clientId = ""
        next.clientName = ""
      }

      // When a provider is picked, prefill the investment address with the provider's address.
      if (field === "clientId") {
        const provider = providers.find((p) => p.id === String(value || ""))
        if (provider?.address) {
          next.investmentAddress = provider.address
        }
      }

      return next
    })
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
    if (formData.periodValue <= 0) nextErrors.periodValue = "Period must be greater than zero"

    const start = formData.startDate ? new Date(`${formData.startDate}T00:00:00`) : null
    const maturity = formData.maturityDate ? new Date(`${formData.maturityDate}T00:00:00`) : null
    if (start && maturity && maturity < start) {
      nextErrors.maturityDate = "Maturity date cannot be before start date"
    }
    if (String(formData.investmentType || "").toLowerCase() === "partnership" && formData.partners.length === 0) {
      nextErrors.partners = "Add at least one partner for partnership investments"
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

  const investmentTypeLower = String(formData.investmentType || "").toLowerCase()
  const showProvider = investmentTypeLower !== "project"
  const showPartners = investmentTypeLower === "partnership"
  const partnerCount = formData.partners.length

  return (
    <div className="w-full max-h-[88vh] overflow-auto max-w-6xl mx-auto rounded-bl-lg">
      <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-6">

        <div className="rounded-xl border border-[#f08c2b]/20 bg-linear-to-r from-[#fff7ed] via-white to-white px-5 py-4 flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#f08c2b]/10 text-[#f08c2b]">
            <Briefcase className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-900">New investment</h2>
            <p className="mt-0.5 text-xs text-gray-600">
              Capture the investment basics, financial terms, schedule, and (for partnerships) the counterparties involved.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={<Building2 className="h-4 w-4" />}
            title="Investment details"
            description="What this investment is and where it lives."
          />
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Investment Type" required error={errors.investmentType}>
                <StyledSelect
                  value={formData.investmentType}
                  onChange={(value) => setField("investmentType", value)}
                  placeholder="Select investment type"
                  options={INVESTMENT_TYPE_OPTIONS}
                />
              </Field>

              {showProvider && (
                <Field
                  label="Provider"
                  error={errors.clientId}
                  hint={
                    formData.clientId
                      ? "Investment address has been prefilled from this provider."
                      : "Optional. Select the counterparty providing this investment."
                  }
                >
                  <StyledSelect
                    value={formData.clientId}
                    onChange={(value) => setField("clientId", value)}
                    placeholder={loadingProviders ? "Loading providers..." : "Select provider"}
                    options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                    searchable
                  />
                </Field>
              )}

              <Field label="Investment Name">
                <input
                  type="text"
                  value={formData.investmentName}
                  onChange={(e) => setField("investmentName", e.target.value)}
                  placeholder="e.g. Mukono Rental Block A"
                  className={inputClass(false)}
                />
              </Field>

              <Field label="Investment Address">
                <input
                  type="text"
                  value={formData.investmentAddress}
                  onChange={(e) => setField("investmentAddress", e.target.value)}
                  placeholder="e.g. Plot 12, Industrial Area, Kampala"
                  className={inputClass(false)}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={<PiggyBank className="h-4 w-4" />}
            title="Financial details"
            description="Principal committed and expected performance."
          />
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Risk Level" required error={errors.riskLevel}>
                <StyledSelect
                  value={formData.riskLevel}
                  onChange={(value) => setField("riskLevel", value)}
                  placeholder="Select risk level"
                  options={RISK_LEVEL_OPTIONS}
                />
              </Field>

              <Field label="Expected % Per Annum" error={errors.expectedPercentagePerAnnum}>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.expectedPercentagePerAnnum || ""}
                    onChange={(e) => setField("expectedPercentagePerAnnum", Number(e.target.value || 0))}
                    placeholder="0.00"
                    className={`${inputClass(!!errors.expectedPercentagePerAnnum)} pr-9`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                    %
                  </span>
                </div>
              </Field>

              <Field label="Principal Amount" required error={errors.principalAmount}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                    UGX
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={formData.principalAmount || ""}
                    onChange={(e) => setField("principalAmount", Number(e.target.value || 0))}
                    placeholder="0"
                    className={`${inputClass(!!errors.principalAmount)} pl-12`}
                  />
                </div>
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={<CalendarClock className="h-4 w-4" />}
            title="Schedule"
            description="When the investment starts and matures. Choose a period and the maturity date updates automatically."
          />
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Start Date" required error={errors.startDate}>
                <ReeveDatePicker
                  value={formData.startDate}
                  onChange={(value) => setField("startDate", value)}
                  placeholder="Select start date"
                />
              </Field>

              <Field
                label="Period"
                required
                error={errors.periodValue}
                hint={
                  !errors.periodValue && formData.periodValue > 0
                    ? `Investment runs for ${formData.periodValue} ${formData.periodUnit}.`
                    : undefined
                }
              >
                <div
                  className={`flex items-center rounded-md border transition-all duration-200 focus-within:ring-[1.5px] focus-within:ring-[#f08c2b] focus-within:border-transparent ${
                    errors.periodValue ? "border-red-500" : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="number"
                    min={0}
                    value={formData.periodValue || ""}
                    onChange={(e) => setField("periodValue", Number(e.target.value || 0))}
                    placeholder={`e.g. ${formData.periodUnit === "years" ? "5" : "12"}`}
                    className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none"
                  />
                  <div
                    role="group"
                    aria-label="Period unit"
                    className="mr-1 my-1 inline-flex items-center rounded-md bg-gray-100 p-0.5 text-[11px] font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setField("periodUnit", "months")}
                      aria-pressed={formData.periodUnit === "months"}
                      className={`rounded px-2.5 py-1 transition-colors ${
                        formData.periodUnit === "months"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setField("periodUnit", "years")}
                      aria-pressed={formData.periodUnit === "years"}
                      className={`rounded px-2.5 py-1 transition-colors ${
                        formData.periodUnit === "years"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Years
                    </button>
                  </div>
                </div>
              </Field>

              <Field
                label="Maturity Date"
                required
                error={errors.maturityDate}
                hint={
                  !errors.maturityDate && formData.startDate && formData.periodValue > 0
                    ? "Auto-calculated. You can still override it."
                    : undefined
                }
              >
                <ReeveDatePicker
                  value={formData.maturityDate}
                  onChange={(value) => setField("maturityDate", value)}
                  placeholder="Select maturity date"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={<Info className="h-4 w-4" />}
            title="Description"
            description="Any extra context that will help the team understand this investment."
          />
          <div className="px-5 py-5">
            <Field label="Description">
              <textarea
                value={formData.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={4}
                placeholder="Additional details about this investment"
                className={`${inputClass(false)} resize-y`}
              />
            </Field>
          </div>
        </div>

        {showPartners && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#f08c2b]/10 text-[#f08c2b]">
                  <Users2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    Partners
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                      {partnerCount}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500">Counterparties contributing to this partnership.</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addPartnerRow}
                className="shrink-0 h-9"
              >
                <MdFormatListBulletedAdd className="h-4 w-4 mr-1.5" />
                Add partner
              </Button>
            </div>

            <div className="px-5 py-5 space-y-3">
              {partnerCount === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-8 text-center">
                  <HandCoins className="mx-auto h-7 w-7 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-700">No partners added yet</p>
                  <p className="text-xs text-gray-500">
                    Partnership investments require at least one counterparty.
                  </p>
                </div>
              ) : (
                formData.partners.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-gray-200 bg-white overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#f08c2b]/10 text-[11px] font-semibold text-[#f08c2b]">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Partner #{idx + 1}
                        </span>
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            row.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePartnerRow(row.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="Remove partner row"
                        title="Remove partner"
                      >
                        <FaTrash className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-5 space-y-1.5">
                        <Label>Counterparty</Label>
                        <StyledSelect
                          value={row.counterpartyId}
                          onChange={(value) => updatePartnerRow(row.id, { counterpartyId: value })}
                          options={providers.map((p) => ({ value: p.id, label: p.name }))}
                          placeholder={loadingProviders ? "Loading counterparties..." : "Select counterparty"}
                          searchable
                        />
                      </div>

                      <div className="md:col-span-3 space-y-1.5">
                        <Label>Role</Label>
                        <StyledSelect
                          value={row.role}
                          onChange={(value) => updatePartnerRow(row.id, { role: value as InvestmentPartnerItem["role"] })}
                          options={PARTNER_ROLE_OPTIONS}
                          placeholder="Select role"
                        />
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <Label>Status</Label>
                        <label className="flex h-10 cursor-pointer items-center gap-3 rounded-md border border-gray-300 px-3">
                          <div className="relative">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={row.status === "Active"}
                              onChange={(e) =>
                                updatePartnerRow(row.id, { status: e.target.checked ? "Active" : "Inactive" })
                              }
                            />
                            <div className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#f08c2b]" />
                            <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                          </div>
                          <span className="text-xs font-medium text-gray-700">
                            {row.status === "Active" ? "Active partner" : "Inactive"}
                          </span>
                        </label>
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <Label>Contribution %</Label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.contributionPercentage || ""}
                            onChange={(e) =>
                              updatePartnerRow(row.id, { contributionPercentage: Number(e.target.value || 0) })
                            }
                            placeholder="0.00"
                            className={`${inputClass(false)} pr-9`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                            %
                          </span>
                        </div>
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <Label>Contribution Amount</Label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                            UGX
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.contributionAmount || ""}
                            onChange={(e) =>
                              updatePartnerRow(row.id, { contributionAmount: Number(e.target.value || 0) })
                            }
                            placeholder="0"
                            className={`${inputClass(false)} pl-12`}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <Label>Ownership %</Label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.ownershipPercentage || ""}
                            onChange={(e) =>
                              updatePartnerRow(row.id, { ownershipPercentage: Number(e.target.value || 0) })
                            }
                            placeholder="0.00"
                            className={`${inputClass(false)} pr-9`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {errors.partners && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <FaExclamationTriangle className="h-3 w-3" />
                  {errors.partners}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-2 border-t border-gray-200 bg-white/95 px-4 sm:px-6 py-3 backdrop-blur supports-backdrop-filter:bg-white/80">
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
        </div>
      </form>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-gray-100 px-5 py-3.5">
      <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#f08c2b]/10 text-[#f08c2b]">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <FaExclamationTriangle className="w-3 h-3" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-gray-500">{hint}</p>
      ) : null}
    </div>
  )
}
