"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"

export type NewSavingsAccountFormData = {
  member_id: string
  account_type: string
  monthly_savings?: number
}

type MemberOption = {
  id: string
  full_name: string
  member_number: string
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: "Voluntary", label: "Voluntary" },
  { value: "Fixed", label: "Fixed" },
  { value: "Shares", label: "Shares" },
  { value: "Current", label: "Current" },
]

interface NewSavingsAccountFormProps {
  onSubmit: (data: NewSavingsAccountFormData) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
}

export default function NewSavingsAccountForm({
  onSubmit,
  onCancel,
  loading = false,
}: NewSavingsAccountFormProps) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [currency, setCurrency] = useState("UGX")
  const [memberId, setMemberId] = useState("")
  const [accountType, setAccountType] = useState("")
  const [monthlySavings, setMonthlySavings] = useState("")
  const [accountTypeOptions, setAccountTypeOptions] = useState(ACCOUNT_TYPE_OPTIONS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadAccountTypes() {
      try {
        const res = await fetch("/api/institution/account-types?status=Active", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data?.accountTypes) && data.accountTypes.length > 0) {
          const map = new Map<string, string>()
          data.accountTypes.forEach((t: { id: string; account_name: string }) => {
            if (t.account_name) map.set(t.account_name, t.account_name)
          })
          ACCOUNT_TYPE_OPTIONS.forEach((opt) => {
            if (!map.has(opt.value)) map.set(opt.value, opt.label)
          })
          setAccountTypeOptions(Array.from(map.entries()).map(([value, label]) => ({ value, label })))
        }
      } catch {
        // keep defaults
      }
    }
    void loadAccountTypes()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      setLoadingMembers(true)
      try {
        const res = await fetch("/api/institution/members?limit=100", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load members")
        const rows = Array.isArray(data?.members) ? data.members : []
        if (!cancelled) {
          setMembers(
            rows.map((m: Record<string, unknown>) => ({
              id: String(m.id || ""),
              full_name: String(m.full_name || "").trim(),
              member_number: String(m.member_number || "").trim(),
            })),
          )
        }
      } catch {
        if (!cancelled) setMembers([])
      } finally {
        if (!cancelled) setLoadingMembers(false)
      }
    }
    void loadMembers()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadCurrency() {
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
    void loadCurrency()
    return () => {
      cancelled = true
    }
  }, [])

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: `${m.full_name} (${m.member_number})`,
      })),
    [members],
  )

  const isFixedAccount = accountType === "Fixed"

  const canSubmit =
    !loading &&
    Boolean(memberId) &&
    Boolean(accountType) &&
    (!isFixedAccount || Boolean(monthlySavings.trim()))

  const handleAccountTypeChange = (value: string) => {
    setAccountType(value)
    if (value !== "Fixed") {
      setMonthlySavings("")
    }
  }

  const handleSubmit = async () => {
    setError(null)
    if (!memberId) {
      setError("Please select a member.")
      return
    }
    if (!accountType) {
      setError("Please select an account type.")
      return
    }
    if (isFixedAccount) {
      const amount = Number(monthlySavings)
      if (!monthlySavings.trim() || !Number.isFinite(amount) || amount <= 0) {
        setError("Monthly savings amount is required for Fixed accounts.")
        return
      }
    }

    const payload: NewSavingsAccountFormData = {
      member_id: memberId,
      account_type: accountType,
    }
    if (isFixedAccount) {
      payload.monthly_savings = Number(monthlySavings)
    }
    await onSubmit(payload)
  }

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Member</Label>
        <StyledSelect
          value={memberId}
          onChange={setMemberId}
          placeholder={loadingMembers ? "Loading members…" : "Select member"}
          options={memberOptions}
          searchable
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Account type</Label>
        <StyledSelect
          value={accountType}
          onChange={handleAccountTypeChange}
          placeholder="Select account type"
          options={accountTypeOptions}
        />
      </div>

      {isFixedAccount && (
        <div className="space-y-1.5">
          <Label htmlFor="monthlySavings" className="text-sm font-medium">
            Monthly Savings Amount ({currency}) *
          </Label>
          <input
            id="monthlySavings"
            type="number"
            min={0}
            required
            value={monthlySavings}
            onChange={(e) => setMonthlySavings(e.target.value)}
            placeholder="e.g., 50,000"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            Fixed accounts require an agreed monthly savings contribution.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {loading ? "Creating…" : "Create account"}
        </Button>
      </div>
    </div>
  )
}
