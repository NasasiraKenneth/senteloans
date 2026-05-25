"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Banknote, Landmark, Smartphone, Sigma, Loader2 } from "lucide-react"
import { Stepper, Step, StepLabel } from "@mui/material"
import { Button } from "@/components/ui/button"

export type DailyReportBankAccountAmount = {
  account_id: string
  amount: string
}

export type DailyReportFormData = {
  bank_total_amount: string
  mobile_money_amount: string
  cash_amount: string
  branch_id: string
  bank_account_amounts: DailyReportBankAccountAmount[]
}

type BranchOption = { value: string; label: string }

type BankAccountOption = {
  id: string
  bank_name: string
  bank_account_number: string
}

interface DailyReportFormProps {
  onSubmit: (data: DailyReportFormData) => void
  onCancel: () => void
  loading?: boolean
  showBranchPicker: boolean
  branchOptions: BranchOption[]
  initialValues?: Partial<DailyReportFormData>
  formDisabled?: boolean
}

const STEPS = ["Enter amounts", "Review"] as const

const stepperSx = {
  "& .MuiStepIcon-root.Mui-active": { color: "#f08c2b" },
  "& .MuiStepIcon-root.Mui-completed": { color: "#f08c2b" },
  "& .MuiStepConnector-line": { borderColor: "#e5e7eb" },
  "& .Mui-active .MuiStepConnector-line": { borderColor: "#f08c2b" },
  "& .Mui-completed .MuiStepConnector-line": { borderColor: "#f08c2b" },
}

function buildDefaults(initialValues?: Partial<DailyReportFormData>): DailyReportFormData {
  return {
    bank_total_amount: initialValues?.bank_total_amount ?? "",
    mobile_money_amount: initialValues?.mobile_money_amount ?? "",
    cash_amount: initialValues?.cash_amount ?? "",
    branch_id: initialValues?.branch_id ?? "",
    bank_account_amounts: initialValues?.bank_account_amounts ?? [],
  }
}

const inputClass = (hasError: boolean, extra = "") =>
  `w-full pl-10 pr-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  } ${extra}`

const selectClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

function formatCurrencyPreview(value: number): string {
  if (!Number.isFinite(value)) return "0.00"
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DailyReportForm({
  onSubmit,
  onCancel,
  loading = false,
  showBranchPicker,
  branchOptions,
  initialValues,
  formDisabled = false,
}: DailyReportFormProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [form, setForm] = useState<DailyReportFormData>(() => buildDefaults(initialValues))
  const [errors, setErrors] = useState<Partial<Record<keyof DailyReportFormData, string>>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
  const [bankAmounts, setBankAmounts] = useState<Record<string, string>>({})
  const [bankAccountErrors, setBankAccountErrors] = useState<Record<string, string>>({})
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)
  const initialBankAmountsRef = useRef<Record<string, string>>({})
  const disabled = loading || formDisabled

  useEffect(() => {
    if (!showBranchPicker) {
      setForm((prev) => (prev.branch_id ? { ...prev, branch_id: "" } : prev))
    }
  }, [showBranchPicker])

  useEffect(() => {
    const seed: Record<string, string> = {}
    for (const entry of initialValues?.bank_account_amounts ?? []) {
      if (entry?.account_id) seed[entry.account_id] = entry.amount ?? ""
    }
    initialBankAmountsRef.current = seed
  }, [initialValues])

  useEffect(() => {
    if (showBranchPicker && !form.branch_id) {
      setBankAccounts([])
      setBankAmounts({})
      setBankError(null)
      return
    }

    const controller = new AbortController()

    void (async () => {
      setBankLoading(true)
      setBankError(null)
      try {
        const params = new URLSearchParams()
        params.set("page", "0")
        params.set("rowsPerPage", "200")
        if (form.branch_id) params.set("branches", form.branch_id)

        const res = await fetch(`/api/institution/finances/bank-accounts?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(body?.error || "load_failed"))
        }

        const rows: BankAccountOption[] = (Array.isArray(body?.rows) ? body.rows : []).map(
          (r: { id?: unknown; bank_name?: unknown; bank_account_number?: unknown }) => ({
            id: String(r.id ?? ""),
            bank_name: String(r.bank_name ?? ""),
            bank_account_number: String(r.bank_account_number ?? ""),
          }),
        )

        setBankAccounts(rows)
        setBankAmounts((prev) => {
          const next: Record<string, string> = {}
          for (const r of rows) {
            next[r.id] = prev[r.id] ?? initialBankAmountsRef.current[r.id] ?? ""
          }
          return next
        })
        setBankAccountErrors({})
      } catch (e: unknown) {
        const err = e as Error
        if (err?.name === "AbortError") return
        setBankAccounts([])
        setBankAmounts({})
        setBankError(err?.message || "load_failed")
      } finally {
        setBankLoading(false)
      }
    })()

    return () => controller.abort()
  }, [form.branch_id, showBranchPicker])

  const set = (field: keyof DailyReportFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const setBankAmount = (accountId: string, value: string) => {
    setBankAmounts((prev) => ({ ...prev, [accountId]: value }))
    if (bankAccountErrors[accountId]) {
      setBankAccountErrors((prev) => {
        const next = { ...prev }
        delete next[accountId]
        return next
      })
    }
  }

  const bankTotal = useMemo(() => {
    let sum = 0
    for (const account of bankAccounts) {
      const raw = String(bankAmounts[account.id] ?? "").trim()
      if (!raw) continue
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) sum += n
    }
    return sum
  }, [bankAmounts, bankAccounts])

  const total = useMemo(() => {
    const m = Number(form.mobile_money_amount) || 0
    const c = Number(form.cash_amount) || 0
    return bankTotal + m + c
  }, [bankTotal, form.mobile_money_amount, form.cash_amount])

  const validate = (): boolean => {
    const e: Partial<Record<keyof DailyReportFormData, string>> = {}
    const bankErrs: Record<string, string> = {}

    if (showBranchPicker && !form.branch_id.trim()) {
      e.branch_id = "Select a branch"
    }

    for (const account of bankAccounts) {
      const raw = String(bankAmounts[account.id] ?? "").trim()
      if (!raw) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        bankErrs[account.id] = "Enter a valid amount (0 or greater)"
      }
    }

    const amountFields: Array<keyof DailyReportFormData> = ["mobile_money_amount", "cash_amount"]
    for (const field of amountFields) {
      const raw = String(form[field] ?? "").trim()
      if (raw === "") continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        e[field] = "Enter a valid amount (0 or greater)"
      }
    }

    const hasBankErrors = Object.keys(bankErrs).length > 0
    if (!e.mobile_money_amount && !e.cash_amount && !hasBankErrors && total <= 0) {
      e.cash_amount = "Enter at least one declared amount above 0"
    }

    setErrors(e)
    setBankAccountErrors(bankErrs)
    return Object.keys(e).length === 0 && !hasBankErrors
  }

  const handleNext = () => {
    if (disabled) return
    if (!validate()) return
    setActiveStep(1)
  }

  const handleBack = () => {
    if (disabled) return
    setActiveStep(0)
  }

  const buildPayload = (): DailyReportFormData => {
    const breakdown: DailyReportBankAccountAmount[] = bankAccounts
      .map((account) => ({
        account_id: account.id,
        amount: String(bankAmounts[account.id] ?? "").trim(),
      }))
      .filter((entry) => entry.amount !== "")

    return {
      bank_total_amount: bankTotal > 0 ? bankTotal.toFixed(2) : "",
      mobile_money_amount: form.mobile_money_amount.trim(),
      cash_amount: form.cash_amount.trim(),
      branch_id: form.branch_id.trim(),
      bank_account_amounts: breakdown,
    }
  }

  const handleFinalSubmit = () => {
    if (disabled) return
    if (activeStep !== 1) return
    if (!validate()) {
      setActiveStep(0)
      return
    }
    onSubmit(buildPayload())
  }

  const branchHintShown = showBranchPicker && !form.branch_id
  const branchLabel = useMemo(() => {
    if (!form.branch_id) return ""
    return branchOptions.find((b) => b.value === form.branch_id)?.label || ""
  }, [branchOptions, form.branch_id])

  const filledBankRows = useMemo(
    () =>
      bankAccounts
        .map((account) => ({
          account,
          amount: Number(String(bankAmounts[account.id] ?? "").trim() || 0),
          raw: String(bankAmounts[account.id] ?? "").trim(),
        }))
        .filter((row) => row.raw !== "" && row.amount > 0),
    [bankAccounts, bankAmounts],
  )

  const mobileMoneyNum = Number(form.mobile_money_amount) || 0
  const cashNum = Number(form.cash_amount) || 0

  return (
    <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto p-4">
      <Stepper activeStep={activeStep} alternativeLabel className="mb-2" sx={stepperSx}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {activeStep === 0 && (
        <>
          {showBranchPicker && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Branch <span className="text-red-500">*</span>
              </label>
              <select
                className={selectClass(!!errors.branch_id)}
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
              {errors.branch_id ? (
                <p className="mt-1 text-xs text-red-600">{errors.branch_id}</p>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Declared balances
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-md border border-gray-100 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Bank accounts
                  </p>
                  {bankLoading ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading…
                    </span>
                  ) : null}
                </div>

                {branchHintShown ? (
                  <p className="text-xs text-muted-foreground">
                    Select a branch above to load its bank accounts.
                  </p>
                ) : bankError ? (
                  <p className="text-xs text-red-600">Failed to load bank accounts. Try again.</p>
                ) : !bankLoading && bankAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No bank accounts registered for this branch.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {bankAccounts.map((account) => {
                      const fieldId = `bank-${account.id}`
                      const accountErr = bankAccountErrors[account.id]
                      return (
                        <div key={account.id}>
                          <label
                            htmlFor={fieldId}
                            className="mb-1 block text-sm font-medium text-gray-700"
                          >
                            {account.bank_name}{" "}
                            <span className="text-gray-400">({account.bank_account_number})</span>
                          </label>
                          <div className="relative">
                            <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              id={fieldId}
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className={inputClass(!!accountErr)}
                              value={bankAmounts[account.id] ?? ""}
                              onChange={(ev) => setBankAmount(account.id, ev.target.value)}
                              placeholder="0.00"
                              disabled={disabled}
                            />
                          </div>
                          {accountErr ? (
                            <p className="mt-1 text-xs text-red-600">{accountErr}</p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Bank total <span className="text-xs text-gray-400">(auto)</span>
                  </label>
                  <div className="relative">
                    <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      readOnly
                      disabled
                      className={inputClass(
                        false,
                        "cursor-not-allowed bg-gray-50 font-mono text-gray-700",
                      )}
                      value={formatCurrencyPreview(bankTotal)}
                      tabIndex={-1}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sum of all bank account entries above.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mobile money</label>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className={inputClass(!!errors.mobile_money_amount)}
                    value={form.mobile_money_amount}
                    onChange={(ev) => set("mobile_money_amount", ev.target.value)}
                    placeholder="0.00"
                    disabled={disabled}
                  />
                </div>
                {errors.mobile_money_amount ? (
                  <p className="mt-1 text-xs text-red-600">{errors.mobile_money_amount}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cash on hand</label>
                <div className="relative">
                  <Banknote className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className={inputClass(!!errors.cash_amount)}
                    value={form.cash_amount}
                    onChange={(ev) => set("cash_amount", ev.target.value)}
                    placeholder="0.00"
                    disabled={disabled}
                  />
                </div>
                {errors.cash_amount ? (
                  <p className="mt-1 text-xs text-red-600">{errors.cash_amount}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-md border border-[#f08c2b]/15 bg-[#f08c2b]/5 px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Sigma className="h-4 w-4 text-[#f08c2b]" />
                Declared total
              </span>
              <span className="font-mono text-sm font-semibold text-gray-900">
                {formatCurrencyPreview(total)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Leave a field blank or 0 if there is nothing to report for that channel.
            </p>
          </div>
        </>
      )}

      {activeStep === 1 && (
        <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Review daily report
          </p>

          {showBranchPicker && (
            <div className="mb-4 rounded-md border border-gray-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</p>
              <p className="mt-1 text-sm text-gray-900">{branchLabel || "—"}</p>
            </div>
          )}

          <div className="mb-4 rounded-md border border-gray-100 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Bank accounts
              </p>
            </div>

            {filledBankRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bank amounts declared.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filledBankRows.map(({ account, amount }) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-gray-700">
                      {account.bank_name}{" "}
                      <span className="text-gray-400">({account.bank_account_number})</span>
                    </span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatCurrencyPreview(amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-gray-700">Bank total</span>
                  <span className="font-mono font-semibold text-gray-900">
                    {formatCurrencyPreview(bankTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-gray-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mobile money
                </p>
              </div>
              <p className="font-mono text-sm font-medium text-gray-900">
                {formatCurrencyPreview(mobileMoneyNum)}
              </p>
            </div>

            <div className="rounded-md border border-gray-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Cash on hand
                </p>
              </div>
              <p className="font-mono text-sm font-medium text-gray-900">
                {formatCurrencyPreview(cashNum)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-[#f08c2b]/15 bg-[#f08c2b]/5 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Sigma className="h-4 w-4 text-[#f08c2b]" />
              Declared total
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {formatCurrencyPreview(total)}
            </span>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Review the amounts above. Use <span className="font-medium">Back</span> to make changes,
            or <span className="font-medium">Submit daily report</span> to file it.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2 border-t border-gray-100 pt-4">
        {activeStep === 0 ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={handleBack} disabled={disabled}>
            Back
          </Button>
        )}

        {activeStep === 0 ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={disabled}
            className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleFinalSubmit}
            disabled={disabled}
            className="bg-[#f08c2b] text-white transition-colors hover:!bg-[#f08c2b] hover:!text-black"
          >
            {loading ? "Saving…" : "Submit daily report"}
          </Button>
        )}
      </div>
    </div>
  )
}
