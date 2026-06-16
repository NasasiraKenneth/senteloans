"use client"

import React, { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, BookOpen, Check, ChevronDown, Landmark, PiggyBank } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { calculateLoanTerms, normalizeLoanMethod } from "@/lib/loans/calculations"

export interface OpeningBalanceSavingsEntry {
  accountId: string
  balance: number
}

export interface OpeningBalancePayload {
  /** Per-account opening savings balances. */
  savingsEntries?: OpeningBalanceSavingsEntry[]
  /** Single-account fields kept for backward compatibility with the current API. */
  savingsBalance?: number
  savingsAccountId?: string
  bankAccountId?: string
  loanOutstandingBalance?: number
  loanProductId?: string
  loanTenureMonths?: number
  loanPrincipalAmount?: number
  loanLastPaymentDate?: string
  loanOriginalTenure?: number
}

type SavingsAccount = { id: string; account_number: string; account_type: string }
type BankAccount = { id: string; bank_name: string; bank_account_number: string }
type LoanProduct = {
  id: string
  product_name: string
  interest_rate: number
  interest_calculation_method?: string
}

interface OpeningBalanceFormProps {
  memberId: string
  currency?: string
  /** Allow editing the savings opening balance. Defaults to true. */
  canEditSavings?: boolean
  /** Allow editing the loan opening balance. Defaults to true. */
  canEditLoans?: boolean
  onSubmit: (data: OpeningBalancePayload) => void | Promise<void>
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export default function OpeningBalanceForm({
  memberId,
  currency = "UGX",
  canEditSavings = true,
  canEditLoans = true,
  onSubmit,
  loading = false,
}: OpeningBalanceFormProps) {
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [recorded, setRecorded] = useState(false)
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([])

  // Savings opening balance — one balance input per savings account.
  const [savingsInputs, setSavingsInputs] = useState<Record<string, string>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")

  const setSavingsInput = (accountId: string, value: string) =>
    setSavingsInputs((prev) => ({ ...prev, [accountId]: value }))

  // Loan opening balance
  const [loanBalance, setLoanBalance] = useState("")
  const [loanProductId, setLoanProductId] = useState("")
  const [loanPrincipal, setLoanPrincipal] = useState("")
  const [loanOriginalTenure, setLoanOriginalTenure] = useState("")
  const [loanTenure, setLoanTenure] = useState("")
  const [loanLastPaymentDate, setLoanLastPaymentDate] = useState("")
  const [loanSectionOpen, setLoanSectionOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Loans-only users see the loan section expanded immediately (no savings block to show).
  useEffect(() => {
    if (canEditLoans && !canEditSavings) {
      setLoanSectionOpen(true)
    }
  }, [canEditLoans, canEditSavings])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingInfo(true)
      try {
        const res = await fetch(`/api/institution/members/${memberId}/opening-balances`, {
          cache: "no-store",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load opening balances")
        if (!cancelled) {
          setRecorded(Boolean(data.openingBalanceRecorded))
          setSavingsAccounts(data.savingsAccounts || [])
          setLoanProducts(data.loanProducts || [])
        }
      } catch {
        // Non-fatal: the form still works, the user just sees no preset options.
      } finally {
        if (!cancelled) setLoadingInfo(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [memberId])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch(`/api/institution/members/${memberId}/bank-accounts`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { bankAccounts?: BankAccount[] }
        if (!cancelled) setBankAccounts(data.bankAccounts || [])
      } catch {
        // Best-effort; the select simply shows no options if this fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [memberId])

  const submitLabel =
    canEditSavings && canEditLoans
      ? "Record Opening Balances"
      : canEditSavings
        ? "Record Savings Balance"
        : "Record Loan Balance"

  // Collapsible only when both sections are available; loans-only is always expanded.
  const showLoanFields = canEditLoans && (canEditSavings ? loanSectionOpen : true)

  // Live repayment projection for the entered loan terms.
  const loanPreview = useMemo(() => {
    const bal = Number(loanBalance)
    const rem = Number(loanTenure)
    if (!(bal > 0 && rem > 0 && loanProductId)) return null
    const product = loanProducts.find((p) => p.id === loanProductId)
    const rate = product ? Number(product.interest_rate) : 0
    const terms = calculateLoanTerms(bal, rate, rem, product?.interest_calculation_method)
    const totalInterest = terms.totalAmount - bal
    const method = normalizeLoanMethod(product?.interest_calculation_method)
      .replace("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
    return { monthlyPayment: terms.monthlyPayment, totalRepayment: terms.totalAmount, totalInterest, method }
  }, [loanBalance, loanTenure, loanProductId, loanProducts])

  const handleSubmit = () => {
    setError(null)

    if (!canEditSavings && !canEditLoans) {
      setError("You do not have permission to record opening balances")
      return
    }

    // Collect a positive balance for each account the user filled in.
    const savingsEntries = canEditSavings
      ? savingsAccounts
          .map((acc) => ({ accountId: acc.id, balance: Number(savingsInputs[acc.id]) || 0 }))
          .filter((e) => e.balance > 0)
      : []

    const hasNegative = canEditSavings
      ? savingsAccounts.some((acc) => Number(savingsInputs[acc.id]) < 0)
      : false
    if (hasNegative) {
      setError("Savings balances cannot be negative")
      return
    }

    const savBal = savingsEntries.reduce((sum, e) => sum + e.balance, 0)
    const loanBal = canEditLoans ? Number(loanBalance) || 0 : 0

    if (savBal <= 0 && loanBal <= 0) {
      if (canEditSavings && canEditLoans) {
        setError("Enter at least one savings balance or a loan balance")
      } else if (canEditSavings) {
        setError("Enter an opening savings balance")
      } else {
        setError("Enter an opening loan balance")
      }
      return
    }

    // Every opening balance (savings or loan) must be bank-recorded.
    if (!bankAccountId) {
      setError("Select a bank account to record the opening balance")
      return
    }

    const payload: OpeningBalancePayload = { bankAccountId }

    if (savingsEntries.length > 0) {
      payload.savingsEntries = savingsEntries
      // Keep single-account fields populated for the current API contract.
      if (savingsEntries.length === 1) {
        payload.savingsBalance = savingsEntries[0].balance
        payload.savingsAccountId = savingsEntries[0].accountId
      }
    }

    if (loanBal > 0) {
      if (!loanProductId) {
        setError("Select a loan product for the opening loan balance")
        return
      }
      const remTenure = Number(loanTenure) || 0
      if (remTenure <= 0) {
        setError("Remaining tenure is required for the loan opening balance")
        return
      }
      const principal = Number(loanPrincipal) || 0
      if (principal > 0 && principal < loanBal) {
        setError("Original principal amount cannot be less than the outstanding balance")
        return
      }
      const origTenure = Number(loanOriginalTenure) || 0
      if (origTenure > 0 && remTenure > 0 && origTenure < remTenure) {
        setError("Original tenure cannot be less than the remaining tenure")
        return
      }
      payload.loanOutstandingBalance = loanBal
      payload.loanProductId = loanProductId
      payload.loanTenureMonths = remTenure
      if (principal > 0) payload.loanPrincipalAmount = principal
      if (loanLastPaymentDate) payload.loanLastPaymentDate = loanLastPaymentDate
      if (origTenure > 0) payload.loanOriginalTenure = origTenure
    }

    void onSubmit(payload)
  }

  if (loadingInfo) {
    return (
      <div className="p-5">
        <p className="text-sm text-gray-500">Loading member balances…</p>
      </div>
    )
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Context note */}
      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <span className="text-xs text-gray-600">
          {recorded
            ? "Opening balances have already been recorded. You can record additional balances if needed."
            : canEditSavings && canEditLoans
              ? "Record the member's savings and/or loan balances carried over from their previous system."
              : canEditSavings
                ? "Record the member's savings balance carried over from their previous system."
                : "Record the member's loan balance carried over from their previous system."}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            key="ob-error"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-start gap-2 overflow-hidden rounded-md border border-red-200 bg-red-50 p-2.5"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Savings opening balance */}
      {canEditSavings && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <PiggyBank className="h-4 w-4 text-green-600" />
            <h4 className="text-sm font-semibold text-gray-800">Savings Opening Balance</h4>
          </div>

          {savingsAccounts.length === 0 ? (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2.5 text-sm text-yellow-700">
              No savings account found for this member. The default account is created when the member is added.
            </div>
          ) : (
            <div className="space-y-4">
              {savingsAccounts.length > 1 && (
                <p className="text-xs text-gray-500">
                  Enter an opening balance for each account you want to record. Leave an account blank to skip it.
                </p>
              )}

              <div className="space-y-3">
                {savingsAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{acc.account_number}</p>
                      <p className="text-xs text-gray-500">{acc.account_type}</p>
                    </div>
                    <div className="sm:w-44">
                      <input
                        type="number"
                        min={0}
                        value={savingsInputs[acc.id] ?? ""}
                        onChange={(e) => setSavingsInput(acc.id, e.target.value)}
                        placeholder={`Balance (${currency})`}
                        className={inputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Loan opening balance — collapsible when savings is also shown; always open for loans-only */}
      {canEditLoans && (
        <div className="space-y-3">
          {canEditSavings ? (
            <button
              type="button"
              onClick={() => setLoanSectionOpen((v) => !v)}
              aria-expanded={loanSectionOpen}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-100"
            >
              <span className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-gray-800">Loan Opening Balance</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${loanSectionOpen ? "rotate-180" : ""}`}
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <Landmark className="h-4 w-4 text-orange-600" />
              <h4 className="text-sm font-semibold text-gray-800">Loan Opening Balance</h4>
            </div>
          )}

          <AnimatePresence initial={false}>
          {showLoanFields && (
          <motion.div
            key="ob-loan-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-3 overflow-hidden"
          >
          <p className="text-xs text-gray-500">
            Provide the original loan details to recreate the loan with a repayment schedule.
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Loan Product <span className="text-red-500">*</span>
              </label>
              <StyledSelect
                value={loanProductId}
                onChange={setLoanProductId}
                placeholder={loanProducts.length ? "Select loan product" : "No active loan products"}
                searchable
                options={loanProducts.map((p) => ({
                  value: p.id,
                  label: `${p.product_name} (${p.interest_rate}%)`,
                }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Original Loan Amount ({currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanPrincipal}
                  onChange={(e) => setLoanPrincipal(e.target.value)}
                  placeholder="e.g. 2,000,000"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">Full principal originally disbursed</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Outstanding Balance ({currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanBalance}
                  onChange={(e) => setLoanBalance(e.target.value)}
                  placeholder="e.g. 1,000,000"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">Amount still owed today</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Original Tenure (months)</label>
                <input
                  type="number"
                  min={1}
                  value={loanOriginalTenure}
                  onChange={(e) => setLoanOriginalTenure(e.target.value)}
                  placeholder="e.g. 24"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">Total months originally issued for</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Remaining Tenure (months) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={loanTenure}
                  onChange={(e) => setLoanTenure(e.target.value)}
                  placeholder="e.g. 12"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">Months still remaining to pay</p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last Payment Date</label>
              <ReeveDatePicker
                value={loanLastPaymentDate}
                onChange={setLoanLastPaymentDate}
                placeholder="Select date"
              />
              <p className="mt-1 text-xs text-gray-500">Most recent payment in the previous system</p>
            </div>

            {/* Loan repayment projection */}
            <AnimatePresence initial={false}>
            {loanPreview && (
              <motion.div
                key="ob-loan-preview"
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="space-y-1 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 p-3"
              >
                <h5 className="text-xs font-semibold text-blue-800">Projected Repayment Schedule</h5>
                <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                  <div>
                    <span className="block text-blue-500">Monthly Payment</span>
                    <span className="font-semibold">
                      {currency} {Math.round(loanPreview.monthlyPayment).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-blue-500">Total Interest</span>
                    <span className="font-semibold">
                      {currency} {Math.round(loanPreview.totalInterest).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-blue-500">Total Repayment</span>
                    <span className="font-semibold">
                      {currency} {Math.round(loanPreview.totalRepayment).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-blue-600">
                  Method: <span className="font-semibold">{loanPreview.method}</span>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
          </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}

      {/* Bank account — required for any opening balance (savings or loan) */}
      {((canEditSavings && savingsAccounts.length > 0) || canEditLoans) && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bank Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
            options={bankAccounts.map((ba) => ({
              value: ba.id,
              label: `${ba.bank_name} — ${ba.bank_account_number}`,
            }))}
          />
        </div>
      )}

      {!canEditSavings && !canEditLoans && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Check className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">You do not have permission to record opening balances.</span>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || (!canEditSavings && !canEditLoans)}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BookOpen className="mr-2 h-4 w-4" />
          {loading ? "Recording…" : submitLabel}
        </button>
      </div>
    </div>
  )
}
