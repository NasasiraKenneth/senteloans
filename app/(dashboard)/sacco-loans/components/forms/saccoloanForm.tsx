"use client"

import { useMemo, useState } from "react"
import { Building2, Calculator, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"

type ThirdPartyAgentOption = {
  id: string
  name: string
}

export interface SaccoLoanFormData {
  thirdPartyAgentId: string
  loanProduct: string
  principalAmount: number
  interestRate: number
  tenureMonths: number
  totalAmount: number
  interestAmount: number
  monthlyPayment: number
  loanType: string
  purpose: string
  collateralDescription: string
  applicationDate: string
}

interface SaccoLoanFormProps {
  thirdPartyAgents: ThirdPartyAgentOption[]
  onSubmit: (data: SaccoLoanFormData) => Promise<void> | void
  onClose?: () => void
  loading?: boolean
  initialValues?: Partial<SaccoLoanFormData>
}

const LOAN_TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "top_up", label: "Top Up" },
  { value: "buy_off", label: "Buy Off" },
  { value: "sell_off", label: "Sell Off" },
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

const todayYmd = () => toYmd(new Date())

export const emptySaccoLoanForm = (): SaccoLoanFormData => ({
  thirdPartyAgentId: "",
  loanProduct: "",
  principalAmount: 0,
  interestRate: 0,
  tenureMonths: 12,
  totalAmount: 0,
  interestAmount: 0,
  monthlyPayment: 0,
  loanType: "normal",
  purpose: "",
  collateralDescription: "",
  applicationDate: todayYmd(),
})

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-xs text-red-600 flex items-center gap-1">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  )
}

function formatMoney(amount: number, currency = "UGX") {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function SaccoLoanForm({
  thirdPartyAgents,
  onSubmit,
  onClose,
  loading = false,
  initialValues = {},
}: SaccoLoanFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<SaccoLoanFormData>(() => ({
    ...emptySaccoLoanForm(),
    ...initialValues,
    applicationDate: toYmd(initialValues.applicationDate) || todayYmd(),
  }))

  const thirdPartyAgentOptions = useMemo(
    () => thirdPartyAgents.map((c) => ({ value: c.id, label: c.name })),
    [thirdPartyAgents],
  )

  const selectedAgentName = useMemo(
    () => thirdPartyAgents.find((a) => a.id === formData.thirdPartyAgentId)?.name || "",
    [thirdPartyAgents, formData.thirdPartyAgentId],
  )

  const setField = (field: keyof SaccoLoanFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    const principal = Number(formData.principalAmount || 0)
    const interest = Number(formData.interestAmount || 0)
    const total = Number(formData.totalAmount || 0)
    const monthly = Number(formData.monthlyPayment || 0)

    if (!formData.thirdPartyAgentId) nextErrors.thirdPartyAgentId = "Select the external lender"
    if (principal <= 0) nextErrors.principalAmount = "Principal must be greater than zero"
    if (Number(formData.interestRate || 0) < 0) nextErrors.interestRate = "Interest rate cannot be negative"
    if (Number(formData.tenureMonths || 0) <= 0) nextErrors.tenureMonths = "Tenure must be at least one month"
    if (!formData.applicationDate) nextErrors.applicationDate = "Application date is required"
    if (interest < 0) nextErrors.interestAmount = "Interest charges cannot be negative"
    if (total <= 0) nextErrors.totalAmount = "Enter the total repayment amount"
    if (monthly <= 0) nextErrors.monthlyPayment = "Enter the monthly instalment amount"
    if (total > 0 && principal > 0 && total < principal) {
      nextErrors.totalAmount = "Total repayment cannot be less than the principal"
    }
    if (total > 0 && principal > 0 && interest >= 0 && Math.abs(total - principal - interest) > 0.01) {
      nextErrors.totalAmount = "Total repayment should equal principal plus interest charges"
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit(formData)
  }

  return (
    <div className="w-full max-h-[85vh] overflow-auto">
      <form onSubmit={handleSubmit} className="space-y-5 p-4">
        <div className="rounded-lg border border-[#f08c2b]/25 bg-linear-to-r from-[#fff3e8] to-white px-4 py-3 text-sm text-gray-900">
          New external loans are submitted as{" "}
          <span className="font-semibold text-[#de4925]">Applied</span>. Approval and disbursement happen from the loan
          detail page after creation.
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-[#f08c2b]" />
              Lender & product
            </CardTitle>
            <CardDescription>Who is providing this facility and what it is for.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>External lender *</Label>
              <StyledSelect
                value={formData.thirdPartyAgentId}
                onChange={(v) => setField("thirdPartyAgentId", v)}
                options={thirdPartyAgentOptions}
                placeholder={
                  thirdPartyAgents.length === 0
                    ? "No active external lenders available"
                    : "Select external lender"
                }
                searchable
              />
              <FieldError message={errors.thirdPartyAgentId} />
              {thirdPartyAgents.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add an active third-party agent before opening an external loan.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Loan product</Label>
              <input
                type="text"
                value={formData.loanProduct}
                onChange={(e) => setField("loanProduct", e.target.value)}
                placeholder="e.g. Agricultural loan"
                className={inputClass(false)}
              />
            </div>

            <div className="space-y-2">
              <Label>Loan type</Label>
              <StyledSelect
                value={formData.loanType}
                onChange={(v) => setField("loanType", v)}
                options={LOAN_TYPE_OPTIONS}
                placeholder="Select loan type"
              />
            </div>

            <div className="space-y-2">
              <Label>Application date *</Label>
              <ReeveDatePicker
                value={formData.applicationDate}
                onChange={(v) => setField("applicationDate", v)}
                placeholder="Select application date"
              />
              <FieldError message={errors.applicationDate} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-[#f08c2b]" />
              Financial terms
            </CardTitle>
            <CardDescription>Enter the agreed loan figures from the lender.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Principal amount *</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.principalAmount || ""}
                  onChange={(e) => setField("principalAmount", Number(e.target.value || 0))}
                  placeholder="0"
                  className={inputClass(!!errors.principalAmount)}
                />
                <FieldError message={errors.principalAmount} />
              </div>

              <div className="space-y-2">
                <Label>Interest rate (%) *</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.interestRate || ""}
                  onChange={(e) => setField("interestRate", Number(e.target.value || 0))}
                  placeholder="0"
                  className={inputClass(!!errors.interestRate)}
                />
                <FieldError message={errors.interestRate} />
              </div>

              <div className="space-y-2">
                <Label>Tenure (months) *</Label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={formData.tenureMonths || ""}
                  onChange={(e) => setField("tenureMonths", Number(e.target.value || 0))}
                  placeholder="12"
                  className={inputClass(!!errors.tenureMonths)}
                />
                <FieldError message={errors.tenureMonths} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Total repayment *</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.totalAmount || ""}
                  onChange={(e) => setField("totalAmount", Number(e.target.value || 0))}
                  placeholder="0"
                  className={inputClass(!!errors.totalAmount)}
                />
                <p className="text-xs text-muted-foreground">Principal plus interest over the full term</p>
                <FieldError message={errors.totalAmount} />
              </div>

              <div className="space-y-2">
                <Label>Interest charges *</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.interestAmount || ""}
                  onChange={(e) => setField("interestAmount", Number(e.target.value || 0))}
                  placeholder="0"
                  className={inputClass(!!errors.interestAmount)}
                />
                <p className="text-xs text-muted-foreground">Total interest payable on this facility</p>
                <FieldError message={errors.interestAmount} />
              </div>

              <div className="space-y-2">
                <Label>Monthly instalment *</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.monthlyPayment || ""}
                  onChange={(e) => setField("monthlyPayment", Number(e.target.value || 0))}
                  placeholder="0"
                  className={inputClass(!!errors.monthlyPayment)}
                />
                <p className="text-xs text-muted-foreground">Amount due each repayment period</p>
                <FieldError message={errors.monthlyPayment} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-[#f08c2b]" />
              Additional details
            </CardTitle>
            <CardDescription>Optional context for reviewers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Purpose</Label>
              <textarea
                rows={3}
                value={formData.purpose}
                onChange={(e) => setField("purpose", e.target.value)}
                placeholder="Why is the institution taking this loan?"
                className={inputClass(false)}
              />
            </div>

            <div className="space-y-2">
              <Label>Collateral / security</Label>
              <textarea
                rows={3}
                value={formData.collateralDescription}
                onChange={(e) => setField("collateralDescription", e.target.value)}
                placeholder="Describe any collateral and guarantees"
                className={inputClass(false)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || thirdPartyAgents.length === 0}>
            {loading ? "Submitting…" : "Submit application"}
          </Button>
        </div>
      </form>
    </div>
  )
}
