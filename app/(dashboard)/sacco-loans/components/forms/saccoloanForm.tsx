"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { FaExclamationTriangle, FaSave, FaTimes } from "react-icons/fa"

type ClientOption = {
  id: string
  name: string
}

export type SaccoLoanStatus =
  | "Applied"
  | "Under Review"
  | "Reviewed"
  | "Approved"
  | "Partially Disbursed"
  | "Fully Disbursed"
  | "Active"
  | "Closed"
  | "Defaulted"
  | "Rejected"

export interface SaccoLoanFormData {
  clientId: string
  loanProduct: string
  principalAmount: number
  interestRate: number
  tenureMonths: number
  totalAmount: number
  status: SaccoLoanStatus
  loanType: string
  purpose: string
  collateralDescription: string
  applicationDate: string
  approvedAt: string
  rejectedAt: string
}

interface SaccoLoanFormProps {
  clients: ClientOption[]
  onSubmit: (data: SaccoLoanFormData) => Promise<void> | void
  onClose?: () => void
  loading?: boolean
  initialValues?: Partial<SaccoLoanFormData>
}

const STATUS_OPTIONS: Array<{ value: SaccoLoanStatus; label: string }> = [
  { value: "Applied", label: "Applied" },
  { value: "Under Review", label: "Under Review" },
  { value: "Reviewed", label: "Reviewed" },
  { value: "Approved", label: "Approved" },
  { value: "Partially Disbursed", label: "Partially Disbursed" },
  { value: "Fully Disbursed", label: "Fully Disbursed" },
  { value: "Active", label: "Active" },
  { value: "Closed", label: "Closed" },
  { value: "Defaulted", label: "Defaulted" },
  { value: "Rejected", label: "Rejected" },
]

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

export const emptySaccoLoanForm = (): SaccoLoanFormData => ({
  clientId: "",
  loanProduct: "",
  principalAmount: 0,
  interestRate: 0,
  tenureMonths: 1,
  totalAmount: 0,
  status: "Applied",
  loanType: "normal",
  purpose: "",
  collateralDescription: "",
  applicationDate: "",
  approvedAt: "",
  rejectedAt: "",
})

export default function SaccoLoanForm({
  clients,
  onSubmit,
  onClose,
  loading = false,
  initialValues = {},
}: SaccoLoanFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<SaccoLoanFormData>({
    ...emptySaccoLoanForm(),
    ...initialValues,
    applicationDate: toYmd(initialValues.applicationDate),
  })

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients],
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
    if (!formData.clientId) nextErrors.clientId = "Client is required"
    if (Number(formData.principalAmount || 0) <= 0) nextErrors.principalAmount = "Principal must be greater than zero"
    if (Number(formData.interestRate || 0) < 0) nextErrors.interestRate = "Interest rate cannot be negative"
    if (Number(formData.tenureMonths || 0) <= 0) nextErrors.tenureMonths = "Tenure must be greater than zero"
    if (!formData.applicationDate) nextErrors.applicationDate = "Application date is required"

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit(formData)
  }

  return (
    <div className="w-full max-h-[85vh] overflow-auto max-w-5xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <h3 className="text-lg font-medium">Sacco Loan</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <StyledSelect
                value={formData.clientId}
                onChange={(v) => setField("clientId", v)}
                options={clientOptions}
                placeholder="Select client"
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
              <Label>Loan Product</Label>
              <input
                type="text"
                value={formData.loanProduct}
                onChange={(e) => setField("loanProduct", e.target.value)}
                placeholder="e.g. School Fees Loan"
                className={inputClass(false)}
              />
            </div>

            <div className="space-y-2">
              <Label>Principal Amount *</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.principalAmount || ""}
                onChange={(e) => setField("principalAmount", Number(e.target.value || 0))}
                className={inputClass(!!errors.principalAmount)}
              />
              {errors.principalAmount && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.principalAmount}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Interest Rate (%) *</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.interestRate || ""}
                onChange={(e) => setField("interestRate", Number(e.target.value || 0))}
                className={inputClass(!!errors.interestRate)}
              />
              {errors.interestRate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.interestRate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tenure (Months) *</Label>
              <input
                type="number"
                min={1}
                step={1}
                value={formData.tenureMonths || ""}
                onChange={(e) => setField("tenureMonths", Number(e.target.value || 0))}
                className={inputClass(!!errors.tenureMonths)}
              />
              {errors.tenureMonths && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.tenureMonths}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <StyledSelect
                value={formData.status}
                onChange={(v) => setField("status", v)}
                options={STATUS_OPTIONS}
                placeholder="Select status"
              />
            </div>

            <div className="space-y-2">
              <Label>Loan Type</Label>
              <StyledSelect
                value={formData.loanType}
                onChange={(v) => setField("loanType", v)}
                options={LOAN_TYPE_OPTIONS}
                placeholder="Select loan type"
              />
            </div>

            <div className="space-y-2">
              <Label>Application Date *</Label>
              <ReeveDatePicker
                value={formData.applicationDate}
                onChange={(v) => setField("applicationDate", v)}
                placeholder="Select application date"
              />
              {errors.applicationDate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.applicationDate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Total Amount</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.totalAmount || ""}
                onChange={(e) => setField("totalAmount", Number(e.target.value || 0))}
                className={inputClass(false)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <textarea
              rows={3}
              value={formData.purpose}
              onChange={(e) => setField("purpose", e.target.value)}
              placeholder="Loan purpose"
              className={inputClass(false)}
            />
          </div>

          <div className="space-y-2">
            <Label>Collateral Description</Label>
            <textarea
              rows={3}
              value={formData.collateralDescription}
              onChange={(e) => setField("collateralDescription", e.target.value)}
              placeholder="Collateral details"
              className={inputClass(false)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            <FaTimes className="mr-2 h-3 w-3" />
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            <FaSave className="mr-2 h-3 w-3" />
            {loading ? "Saving..." : "Save Sacco Loan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
