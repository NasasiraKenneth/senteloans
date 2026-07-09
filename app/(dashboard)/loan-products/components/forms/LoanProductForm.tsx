"use client"

import React, { useState, useEffect } from "react"
import Popover from "@mui/material/Popover"
import { getInstitutionCurrency } from "@/lib/session"
import { FaTrash } from "react-icons/fa"

export interface LoanProductFormData {
  product_name: string
  product_code: string
  description: string
  minimum_amount: string
  maximum_amount: string
  interest_rate: string
  minimum_tenure_months: string
  maximum_tenure_months: string
  interest_calculation_method: string
  collateral_required: boolean
  guarantors_required: string
  processing_fee_percentage: string
  insurance_required: boolean
  status: string
  eligibilities: LoanProductEligibilityForm[]
}

export interface LoanProductEligibilityForm {
  id: string
  eligibility: string
  status: "Active" | "Inactive"
}

interface LoanProductFormProps {
  initialValues?: Partial<LoanProductFormData>
  onSubmit: (data: LoanProductFormData) => void
  loading?: boolean
  editMode?: boolean
}

const methodOptions = [
  { value: "reducing_balance", label: "Reducing Balance" },
  { value: "flat_rate", label: "Flat Rate" },
  { value: "compound", label: "Compound" },
]

const statusOptions = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Suspended", label: "Suspended" },
]

const defaultValues: LoanProductFormData = {
  product_name: "",
  product_code: "",
  description: "",
  minimum_amount: "",
  maximum_amount: "",
  interest_rate: "",
  minimum_tenure_months: "",
  maximum_tenure_months: "",
  interest_calculation_method: "reducing_balance",
  collateral_required: false,
  guarantors_required: "0",
  processing_fee_percentage: "0",
  insurance_required: false,
  status: "Active",
  eligibilities: [],
}

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export default function LoanProductForm({
  initialValues = {},
  onSubmit,
  loading = false,
  editMode = false,
}: LoanProductFormProps) {
  const [form, setForm] = useState<LoanProductFormData>({ ...defaultValues, ...initialValues })
  const [errors, setErrors] = useState<Partial<Record<keyof LoanProductFormData, string>>>({})
  const [currency, setCurrency] = useState("UGX")
  const [methodAnchor, setMethodAnchor] = useState<HTMLElement | null>(null)
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setCurrency(getInstitutionCurrency("UGX"))
  }, [])

  const set = (field: keyof LoanProductFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const addEligibility = () => {
    const row: LoanProductEligibilityForm = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eligibility: "",
      status: "Active",
    }
    setForm((prev) => ({ ...prev, eligibilities: [...(prev.eligibilities || []), row] }))
  }

  const updateEligibility = (id: string, field: keyof LoanProductEligibilityForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      eligibilities: (prev.eligibilities || []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }))
  }

  const toggleEligibilityStatus = (id: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      eligibilities: (prev.eligibilities || []).map((item) =>
        item.id === id ? { ...item, status: checked ? "Active" : "Inactive" } : item
      ),
    }))
  }

  const removeEligibility = (id: string) => {
    setForm((prev) => ({
      ...prev,
      eligibilities: (prev.eligibilities || []).filter((item) => item.id !== id),
    }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof LoanProductFormData, string>> = {}
    if (!form.product_name.trim()) e.product_name = "Product name is required"
    if (!form.product_code.trim()) e.product_code = "Short code is required (e.g. AG)"
    if (!form.minimum_amount || Number(form.minimum_amount) <= 0) e.minimum_amount = "Must be greater than 0"
    if (!form.maximum_amount || Number(form.maximum_amount) <= 0) e.maximum_amount = "Must be greater than 0"
    if (Number(form.maximum_amount) < Number(form.minimum_amount)) e.maximum_amount = "Must be ≥ minimum amount"
    if (!form.interest_rate || Number(form.interest_rate) < 0) e.interest_rate = "Must be ≥ 0"
    if (!form.minimum_tenure_months || Number(form.minimum_tenure_months) <= 0) e.minimum_tenure_months = "Must be ≥ 1"
    if (!form.maximum_tenure_months || Number(form.maximum_tenure_months) <= 0) e.maximum_tenure_months = "Must be ≥ 1"
    if (Number(form.maximum_tenure_months) < Number(form.minimum_tenure_months)) e.maximum_tenure_months = "Must be ≥ minimum tenure"
    if ((form.eligibilities || []).some((el) => !el.eligibility.trim())) {
      e.eligibilities = "Eligibility name cannot be empty"
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(100vh-10rem)] overflow-y-auto">
      {/* Product Identity */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Product Identity</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Personal Loan"
              className={inputClass(!!errors.product_name)}
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
            />
            {errors.product_name && <p className="mt-1 text-xs text-red-500">{errors.product_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Code (Short) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. PL"
              className={inputClass(!!errors.product_code)}
              value={form.product_code}
              onChange={(e) => set("product_code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            {errors.product_code && <p className="mt-1 text-xs text-red-500">{errors.product_code}</p>}
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            rows={2}
            placeholder="Brief description of the loan product..."
            className={inputClass(false)}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Amount & Interest */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Amount &amp; Interest</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Amount ({currency}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 50000"
              className={inputClass(!!errors.minimum_amount)}
              value={form.minimum_amount}
              onChange={(e) => set("minimum_amount", e.target.value)}
            />
            {errors.minimum_amount && <p className="mt-1 text-xs text-red-500">{errors.minimum_amount}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Amount ({currency}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000000"
              className={inputClass(!!errors.maximum_amount)}
              value={form.maximum_amount}
              onChange={(e) => set("maximum_amount", e.target.value)}
            />
            {errors.maximum_amount && <p className="mt-1 text-xs text-red-500">{errors.maximum_amount}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Interest Rate (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 15"
              className={inputClass(!!errors.interest_rate)}
              value={form.interest_rate}
              onChange={(e) => set("interest_rate", e.target.value)}
            />
            {errors.interest_rate && <p className="mt-1 text-xs text-red-500">{errors.interest_rate}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Calculation Method</label>
            <div
              onClick={(e) => setMethodAnchor(e.currentTarget)}
              className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                Boolean(methodAnchor)
                  ? "ring-[1.5px] ring-[#f08c2b] border-transparent"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <span className="text-gray-900">
                {methodOptions.find((o) => o.value === form.interest_calculation_method)?.label || "Select method"}
              </span>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${Boolean(methodAnchor) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <Popover
              open={Boolean(methodAnchor)}
              anchorEl={methodAnchor}
              onClose={() => setMethodAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              PaperProps={{
                sx: {
                  width: methodAnchor?.offsetWidth || 200,
                  borderRadius: "10px",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                  mt: 0.5,
                },
              }}
            >
              <div className="p-2">
                {methodOptions.map((opt) => {
                  const isSelected = form.interest_calculation_method === opt.value
                  return (
                    <div
                      key={opt.value}
                      onClick={() => { set("interest_calculation_method", opt.value); setMethodAnchor(null) }}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                        isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-800">{opt.label}</span>
                    </div>
                  )
                })}
              </div>
            </Popover>
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Tenure */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Tenure (Months)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 1"
              className={inputClass(!!errors.minimum_tenure_months)}
              value={form.minimum_tenure_months}
              onChange={(e) => set("minimum_tenure_months", e.target.value)}
            />
            {errors.minimum_tenure_months && <p className="mt-1 text-xs text-red-500">{errors.minimum_tenure_months}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 36"
              className={inputClass(!!errors.maximum_tenure_months)}
              value={form.maximum_tenure_months}
              onChange={(e) => set("maximum_tenure_months", e.target.value)}
            />
            {errors.maximum_tenure_months && <p className="mt-1 text-xs text-red-500">{errors.maximum_tenure_months}</p>}
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Requirements & Fees */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Requirements &amp; Fees</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Processing Fee (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              className={inputClass(false)}
              value={form.processing_fee_percentage}
              onChange={(e) => set("processing_fee_percentage", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guarantors Required</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              className={inputClass(false)}
              value={form.guarantors_required}
              onChange={(e) => set("guarantors_required", e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-8 mt-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.collateral_required}
                onChange={(e) => set("collateral_required", e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
              <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow" />
            </div>
            <span className="text-sm text-gray-700">Collateral Required</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.insurance_required}
                onChange={(e) => set("insurance_required", e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
              <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow" />
            </div>
            <span className="text-sm text-gray-700">Insurance Required</span>
          </label>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Eligibilities */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Eligibilities</h4>
          <button
            type="button"
            onClick={addEligibility}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#f08c2b] rounded-md hover:bg-[#d97a1f] transition-colors"
          >
            Add Eligibility
          </button>
        </div>

        {(form.eligibilities || []).length === 0 ? (
          <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-3">
            No eligibilities added yet.
          </div>
        ) : (
          <div className="space-y-3">
            {(form.eligibilities || []).map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Eligibility name (e.g. Active savings account)"
                  className={inputClass(false)}
                  value={item.eligibility}
                  onChange={(e) => updateEligibility(item.id, "eligibility", e.target.value)}
                />
                <label className="flex items-center gap-2.5 cursor-pointer min-w-[140px]">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={item.status === "Active"}
                      onChange={(e) => toggleEligibilityStatus(item.id, e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow" />
                  </div>
                  <span className="text-sm text-gray-700">
                    {item.status}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => removeEligibility(item.id)}
                  className="px-2.5 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                >
                  <FaTrash className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {errors.eligibilities && <p className="mt-1 text-xs text-red-500">{errors.eligibilities}</p>}
      </div>

      <hr className="border-gray-200" />

      {/* Status */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Status</h4>
        <div>
          <div
            onClick={(e) => setStatusAnchor(e.currentTarget)}
            className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
              Boolean(statusAnchor)
                ? "ring-[1.5px] ring-[#f08c2b] border-transparent"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <span className={form.status ? "text-gray-900" : "text-gray-400"}>
              {statusOptions.find((o) => o.value === form.status)?.label || "Select status"}
            </span>
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${Boolean(statusAnchor) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <Popover
            open={Boolean(statusAnchor)}
            anchorEl={statusAnchor}
            onClose={() => setStatusAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{
              sx: {
                width: statusAnchor?.offsetWidth || 200,
                borderRadius: "10px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                mt: 0.5,
              },
            }}
          >
            <div className="p-2">
              {statusOptions.map((opt) => {
                const isSelected = form.status === opt.value
                return (
                  <div
                    key={opt.value}
                    onClick={() => { set("status", opt.value); setStatusAnchor(null) }}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                      isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-gray-800">{opt.label}</span>
                  </div>
                )
              })}
            </div>
          </Popover>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[#f08c2b] rounded-lg hover:bg-[#d97a1f] transition-colors disabled:opacity-50"
        >
          {loading ? "Saving..." : editMode ? "Save Changes" : "Create Product"}
        </button>
      </div>
    </form>
  )
}
