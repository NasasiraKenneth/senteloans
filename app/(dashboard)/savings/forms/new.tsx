"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { calculateNextBillingDate } from "@/lib/members/savings-calculation"

export type NewSavingsAccountFormData = {
  member_id: string
  account_type: string
  monthly_savings?: number
  auto_savings_day?: string | null
  start_date?: string | null
  next_billing_date?: string | null
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

const FIXED_WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const ORDINAL_WEEKDAY_OPTIONS = [
  { value: "1st Sunday", label: "1st Sunday" },
  { value: "2nd Sunday", label: "2nd Sunday" },
  { value: "3rd Sunday", label: "3rd Sunday" },
  { value: "4th Sunday", label: "4th Sunday" },
  { value: "1st Monday", label: "1st Monday" },
  { value: "2nd Monday", label: "2nd Monday" },
  { value: "3rd Monday", label: "3rd Monday" },
  { value: "4th Monday", label: "4th Monday" },
  { value: "1st Tuesday", label: "1st Tuesday" },
  { value: "2nd Tuesday", label: "2nd Tuesday" },
  { value: "3rd Tuesday", label: "3rd Tuesday" },
  { value: "4th Tuesday", label: "4th Tuesday" },
  { value: "1st Wednesday", label: "1st Wednesday" },
  { value: "2nd Wednesday", label: "2nd Wednesday" },
  { value: "3rd Wednesday", label: "3rd Wednesday" },
  { value: "4th Wednesday", label: "4th Wednesday" },
  { value: "1st Thursday", label: "1st Thursday" },
  { value: "2nd Thursday", label: "2nd Thursday" },
  { value: "3rd Thursday", label: "3rd Thursday" },
  { value: "4th Thursday", label: "4th Thursday" },
  { value: "1st Friday", label: "1st Friday" },
  { value: "2nd Friday", label: "2nd Friday" },
  { value: "3rd Friday", label: "3rd Friday" },
  { value: "4th Friday", label: "4th Friday" },
  { value: "1st Saturday", label: "1st Saturday" },
  { value: "2nd Saturday", label: "2nd Saturday" },
  { value: "3rd Saturday", label: "3rd Saturday" },
  { value: "4th Saturday", label: "4th Saturday" },
]

const INCLUDES_DAY_OPTIONS = [
  { value: "includes 1", label: "Includes 1 (Days 1, 11, 21, 31)" },
  { value: "includes 2", label: "Includes 2 (Days 2, 12, 22)" },
  { value: "includes 3", label: "Includes 3 (Days 3, 13, 23)" },
  { value: "includes 4", label: "Includes 4 (Days 4, 14, 24)" },
  { value: "includes 5", label: "Includes 5 (Days 5, 15, 25)" },
  { value: "includes 6", label: "Includes 6 (Days 6, 16, 26)" },
  { value: "includes 7", label: "Includes 7 (Days 7, 17, 27)" },
  { value: "includes 8", label: "Includes 8 (Days 8, 18, 28)" },
  { value: "includes 9", label: "Includes 9 (Days 9, 19, 29)" },
  { value: "includes 0", label: "Includes 0 (Days 10, 20, 30)" },
]

function detectAutoSavingsDayMode(day: string | null): "fixed" | "custom" | "includes" | "ordinal" {
  if (!day) return "custom"
  const trimmed = day.trim()
  if (/^includes\s+\d+$/i.test(trimmed)) return "includes"
  if (/^(1st|2nd|3rd|4th|first|second|third|fourth)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(trimmed)) return "ordinal"
  if (FIXED_WEEK_DAYS.includes(trimmed)) return "fixed"
  return "custom"
}

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

  // Branch Savings Plan Config & Account-level auto savings day states
  const [savingsPlanConfig, setSavingsPlanConfig] = useState<{
    use_account_saving_day: boolean
    frequency_unit: string
    frequency_value: string
  }>({
    use_account_saving_day: false,
    frequency_unit: "MONTH",
    frequency_value: "1",
  })
  const [autoSavingsDay, setAutoSavingsDay] = useState("1")
  const [autoSavingsDayMode, setAutoSavingsDayMode] = useState<"fixed" | "custom" | "includes" | "ordinal">("custom")
  const [startDate, setStartDate] = useState("")
  const [nextBillingDate, setNextBillingDate] = useState("")

  useEffect(() => {
    let cancelled = false
    async function loadAccountTypes() {
      try {
        const res = await fetch("/api/institution/account-types?status=Active", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data?.accountTypes) && data.accountTypes.length > 0) {
          const dbOptions = data.accountTypes
            .filter((t: { account_name?: string }) => Boolean(t.account_name))
            .map((t: { id: string; account_name: string }) => ({
              value: t.account_name,
              label: t.account_name,
            }))
          if (dbOptions.length > 0) {
            setAccountTypeOptions(dbOptions)
          }
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

  useEffect(() => {
    let cancelled = false
    async function loadSavingsPlan() {
      try {
        const res = await fetch("/api/institution/savings-plan", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.savingsPlan) {
          const sp = data.savingsPlan
          const useAccountDay = sp.use_account_saving_day === "true" || sp.use_account_saving_day === true
          setSavingsPlanConfig({
            use_account_saving_day: useAccountDay,
            frequency_unit: sp.frequency_unit || "MONTH",
            frequency_value: sp.frequency_value || "1",
          })
          const loadedDay = sp.auto_savings_day || "1"
          setAutoSavingsDay(loadedDay)
          setAutoSavingsDayMode(detectAutoSavingsDayMode(loadedDay))
          if (sp.start_date) setStartDate(sp.start_date)
        }
      } catch {
        // ignore
      }
    }
    void loadSavingsPlan()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!startDate || !savingsPlanConfig.use_account_saving_day) return
    const computed = calculateNextBillingDate({
      startDate: startDate,
      frequencyUnit: savingsPlanConfig.frequency_unit,
      frequencyValue: savingsPlanConfig.frequency_value,
      autoSavingsDay: autoSavingsDay,
    })
    if (computed && computed !== nextBillingDate) {
      setNextBillingDate(computed)
    }
  }, [startDate, autoSavingsDay, savingsPlanConfig, nextBillingDate])

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
    if (savingsPlanConfig.use_account_saving_day) {
      payload.auto_savings_day = autoSavingsDay || null
      payload.start_date = startDate || null
      payload.next_billing_date = nextBillingDate || null
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

      {savingsPlanConfig.use_account_saving_day && (
        <div className="space-y-3.5 rounded-xl border border-[#111111]/10 p-3.5">
          <p className="text-xs font-semibold text-[#111111]">
            Account Auto Savings Schedule ({savingsPlanConfig.frequency_unit} interval: {savingsPlanConfig.frequency_value})
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs font-medium">Auto Savings Day</Label>
              {savingsPlanConfig.frequency_unit === "MONTH" && (
                <div className="inline-flex items-center rounded-lg border border-[#111111]/10 bg-gray-100 p-0.5 text-xs font-medium flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoSavingsDayMode("fixed")
                      setAutoSavingsDay("Monday")
                    }}
                    className={`px-2 py-0.5 rounded-md transition-all ${autoSavingsDayMode === "fixed" ? "bg-white text-[#111111] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                  >
                    Fixed Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoSavingsDayMode("ordinal")
                      setAutoSavingsDay("1st Monday")
                    }}
                    className={`px-2 py-0.5 rounded-md transition-all ${autoSavingsDayMode === "ordinal" ? "bg-white text-[#111111] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                  >
                    Ordinal Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoSavingsDayMode("includes")
                      setAutoSavingsDay("includes 4")
                    }}
                    className={`px-2 py-0.5 rounded-md transition-all ${autoSavingsDayMode === "includes" ? "bg-white text-[#111111] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                  >
                    Includes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoSavingsDayMode("custom")
                      setAutoSavingsDay("1")
                    }}
                    className={`px-2 py-0.5 rounded-md transition-all ${autoSavingsDayMode === "custom" ? "bg-white text-[#111111] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                  >
                    Day of Month
                  </button>
                </div>
              )}
            </div>

            {savingsPlanConfig.frequency_unit === "DAY" ? (
              <p className="text-xs text-muted-foreground italic">
                Auto savings day is not required for daily billing frequency.
              </p>
            ) : savingsPlanConfig.frequency_unit === "WEEK" ? (
              <StyledSelect
                value={autoSavingsDay || ""}
                onChange={(val) => setAutoSavingsDay(val || "")}
                placeholder="Select day of week (Optional)"
                options={[
                  { value: "", label: "None (Based on Start Date)" },
                  { value: "Sunday", label: "Sunday" },
                  { value: "Monday", label: "Monday" },
                  { value: "Tuesday", label: "Tuesday" },
                  { value: "Wednesday", label: "Wednesday" },
                  { value: "Thursday", label: "Thursday" },
                  { value: "Friday", label: "Friday" },
                  { value: "Saturday", label: "Saturday" },
                ]}
              />
            ) : autoSavingsDayMode === "fixed" ? (
              <StyledSelect
                value={autoSavingsDay && FIXED_WEEK_DAYS.includes(autoSavingsDay) ? autoSavingsDay : "Monday"}
                onChange={setAutoSavingsDay}
                placeholder="Select day of week"
                options={[
                  { value: "Sunday", label: "Sunday" },
                  { value: "Monday", label: "Monday" },
                  { value: "Tuesday", label: "Tuesday" },
                  { value: "Wednesday", label: "Wednesday" },
                  { value: "Thursday", label: "Thursday" },
                  { value: "Friday", label: "Friday" },
                  { value: "Saturday", label: "Saturday" },
                ]}
              />
            ) : autoSavingsDayMode === "ordinal" ? (
              <StyledSelect
                value={autoSavingsDay || "1st Monday"}
                onChange={setAutoSavingsDay}
                placeholder="Select ordinal weekday"
                options={ORDINAL_WEEKDAY_OPTIONS}
              />
            ) : autoSavingsDayMode === "includes" ? (
              <StyledSelect
                value={autoSavingsDay || "includes 4"}
                onChange={setAutoSavingsDay}
                placeholder="Select includes day rule"
                options={INCLUDES_DAY_OPTIONS}
              />
            ) : (
              <input
                type="text"
                placeholder="e.g. 1, 15, last_day"
                value={autoSavingsDay || ""}
                onChange={(e) => setAutoSavingsDay(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Start Date</Label>
            <ReeveDatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Select start billing date"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Next Billing Date</Label>
              <Badge variant="outline" className="text-[10px] border-[#f08c2b] text-[#f08c2b]">
                Auto-calculated
              </Badge>
            </div>
            <ReeveDatePicker
              value={nextBillingDate}
              onChange={setNextBillingDate}
              placeholder="Auto-calculated from start date"
            />
          </div>
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
