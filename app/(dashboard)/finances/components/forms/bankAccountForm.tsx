"use client"

import { useEffect, useMemo, useState } from "react"
import { Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"

export type BankAccountFormData = {
  third_party_agent_id: string
  bank_account_number: string
  branch_id: string
}

type BranchOption = { value: string; label: string }
type AgentOption = { value: string; label: string; branch_id: string }

interface BankAccountFormProps {
  onSubmit: (data: BankAccountFormData) => void
  onCancel: () => void
  loading?: boolean
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  agentOptions: AgentOption[]
  agentsLoading?: boolean
  mode?: "create" | "edit"
  initialValues?: Partial<BankAccountFormData>
  formDisabled?: boolean
}

const defaultValues: BankAccountFormData = {
  third_party_agent_id: "",
  bank_account_number: "",
  branch_id: "",
}

const inputClass = (hasError: boolean) =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const selectWrap = (hasError: boolean) => (hasError ? "rounded-md ring-1 ring-red-500" : "")

export default function BankAccountForm({
  onSubmit,
  onCancel,
  loading = false,
  showBranchPicker,
  branchOptions,
  agentOptions,
  agentsLoading = false,
  mode = "create",
  initialValues,
  formDisabled = false,
}: BankAccountFormProps) {
  const [form, setForm] = useState<BankAccountFormData>({ ...defaultValues })
  const [errors, setErrors] = useState<Partial<Record<keyof BankAccountFormData, string>>>({})
  const disabled = loading || formDisabled

  useEffect(() => {
    if (mode === "edit") return
    if (!showBranchPicker) {
      setForm((prev) => ({ ...prev, branch_id: "" }))
    }
  }, [showBranchPicker, mode])

  useEffect(() => {
    if (mode !== "edit" || !initialValues) return
    setForm({
      ...defaultValues,
      third_party_agent_id: initialValues.third_party_agent_id ?? "",
      bank_account_number: initialValues.bank_account_number ?? "",
      branch_id: initialValues.branch_id ?? "",
    })
    setErrors({})
  }, [mode, initialValues])

  const filteredAgentOptions = useMemo(() => {
    if (!showBranchPicker || !form.branch_id.trim()) {
      return agentOptions
    }
    return agentOptions.filter((a) => a.branch_id === form.branch_id)
  }, [agentOptions, form.branch_id, showBranchPicker])

  const set = (field: keyof BankAccountFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "branch_id") {
        next.third_party_agent_id = ""
      }
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof BankAccountFormData, string>> = {}
    if (showBranchPicker && !form.branch_id.trim()) e.branch_id = "Select a branch"
    if (!form.third_party_agent_id.trim()) e.third_party_agent_id = "Select a third party agent"
    if (!form.bank_account_number.trim()) e.bank_account_number = "Account number is required"

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (disabled) return
    if (!validate()) return
    onSubmit({
      third_party_agent_id: form.third_party_agent_id.trim(),
      bank_account_number: form.bank_account_number.trim(),
      branch_id: form.branch_id.trim(),
    })
  }

  const agentPlaceholder = agentsLoading
    ? "Loading third party agents…"
    : showBranchPicker && !form.branch_id.trim()
      ? "Select a branch first"
      : filteredAgentOptions.length === 0
        ? "No third party agents for this branch"
        : "Select third party agent"

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      {showBranchPicker && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
          <select
            className={inputClass(!!errors.branch_id).replace("pl-10", "pl-3")}
            value={form.branch_id}
            onChange={(ev) => set("branch_id", ev.target.value)}
            disabled={disabled || branchOptions.length === 0}
          >
            <option value="">Select branch</option>
            {branchOptions.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          {errors.branch_id ? <p className="mt-1 text-xs text-red-600">{errors.branch_id}</p> : null}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Third party agent <span className="text-red-500">*</span>
        </label>
        <div
          className={`${selectWrap(!!errors.third_party_agent_id)} ${disabled || agentsLoading || (showBranchPicker && !form.branch_id.trim()) ? "pointer-events-none opacity-60" : ""}`}
        >
          <StyledSelect
            value={form.third_party_agent_id}
            onChange={(v) => set("third_party_agent_id", v)}
            placeholder={agentPlaceholder}
            options={filteredAgentOptions.map((a) => ({ value: a.value, label: a.label }))}
            searchable
          />
        </div>
        {errors.third_party_agent_id ? (
          <p className="mt-1 text-xs text-red-600">{errors.third_party_agent_id}</p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Account number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className={inputClass(!!errors.bank_account_number)}
            value={form.bank_account_number}
            onChange={(ev) => set("bank_account_number", ev.target.value)}
            placeholder="Account number"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        {errors.bank_account_number ? (
          <p className="mt-1 text-xs text-red-600">{errors.bank_account_number}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
        >
          {loading ? "Saving…" : mode === "edit" ? "Save changes" : "Add bank account"}
        </Button>
      </div>
    </form>
  )
}
