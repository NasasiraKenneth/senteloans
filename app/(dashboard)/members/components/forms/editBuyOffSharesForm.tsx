"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  FileText,
  Info,
  Landmark,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"
import type { ShareTransactionItem } from "./editSharesForm"

export interface EditBuyOffSharesPayload {
  shareId: string
  transactionId?: string | null
  numberOfShares: number
  shareValue: number
  totalValue: number
  previousTotalValue: number
  valueDifference: number
  sharesDifference: number
  actionRole: "sell" | "buy"
  counterpartyMemberId?: string
  mode: string
  paymentDate: string
  referenceNumber?: string
  description?: string
  transaction_charges?: number
  bank_account_id?: string
  savings_account_id?: string
  seller_account_id?: string
}

type MemberOption = {
  id: string
  full_name: string
  member_number: string
  status?: string
}

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

type SavingsAccount = {
  id: string
  account_number: string
  account_type?: string
  available_balance?: number
  total_balance?: number
  status?: string
}

interface EditBuyOffSharesFormProps {
  share: ShareTransactionItem
  memberId: string
  currency?: string
  shareValue?: number
  currentShares?: number
  currentTotalValue?: number
  minShares?: number
  maxShares?: number
  onSubmit: (data: EditBuyOffSharesPayload) => void | Promise<void>
  loading?: boolean
  onCancel?: () => void
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"

const BUY_OFF_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Savings Account", label: "Savings Account" },
]

const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]

export default function EditBuyOffSharesForm({
  share,
  memberId,
  currency = "UGX",
  shareValue = 0,
  currentShares = 0,
  currentTotalValue = 0,
  minShares,
  maxShares,
  onSubmit,
  loading = false,
  onCancel,
}: EditBuyOffSharesFormProps) {
  // Determine if this member's recorded role was Seller (shares leaving) or Buyer (shares entering)
  const isSeller =
    share.acquisition_type === "sell" ||
    share.acquisition_type === "redemption" ||
    share.transfer_type === "to"

  const [shares, setShares] = useState(String(share.number_of_shares || ""))
  const [counterpartyMemberId, setCounterpartyMemberId] = useState(share.transfer_member_id || "")
  const [mode, setMode] = useState(share.mode || "Cash")
  const [paymentDate, setPaymentDate] = useState(
    share.date
      ? share.date.slice(0, 10)
      : share.created_at
        ? share.created_at.slice(0, 10)
        : ""
  )
  const [referenceNumber, setReferenceNumber] = useState(share.reference_number || "")

  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [savingsAccountId, setSavingsAccountId] = useState(
    share.savings_account_id || share.seller_account_id || ""
  )
  const [loadingSavingsAccounts, setLoadingSavingsAccounts] = useState(false)

  const [cfgMinShares, setCfgMinShares] = useState<number | undefined>(undefined)
  const [cfgMaxShares, setCfgMaxShares] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  // Fetch active members for counterparties
  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      setLoadingMembers(true)
      try {
        const res = await fetch("/api/institution/members?limit=200&status=Active", {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const rows = Array.isArray(data?.members) ? data.members : []
        if (!cancelled) {
          setMembers(
            rows
              .filter((m: Record<string, unknown>) => {
                const isOther = String(m.id || "") !== memberId
                const st = String(m.status || "").toLowerCase()
                const isActive = !st || st === "active"
                return isOther && isActive
              })
              .map((m: Record<string, unknown>) => ({
                id: String(m.id || ""),
                full_name: String(m.full_name || "").trim(),
                member_number: String(m.member_number || "").trim(),
                status: String(m.status || ""),
              }))
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
  }, [memberId])

  // Fetch branch bank accounts
  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch(`/api/institution/members/${memberId}/bank-accounts`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { bankAccounts?: BankAccount[] }
        if (!cancelled) setBankAccounts(data.bankAccounts || [])
      } catch {
        // Best-effort
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [memberId])

  // Fetch member savings accounts if mode is Savings Account
  useEffect(() => {
    let cancelled = false
    async function loadSavings() {
      if (mode !== "Savings Account" || !memberId) {
        setSavingsAccounts([])
        return
      }
      setLoadingSavingsAccounts(true)
      try {
        const res = await fetch(`/api/institution/savings?member_id=${memberId}&limit=50`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as { items?: SavingsAccount[]; accounts?: SavingsAccount[] }
        if (!cancelled) {
          const rawList = data.items || data.accounts || []
          const activeAccounts = rawList.filter((sa: SavingsAccount) => {
            const st = String(sa.status || "").toLowerCase()
            return !st || st === "active" || st === "open"
          })
          setSavingsAccounts(activeAccounts)
          if (activeAccounts.length > 0) {
            setSavingsAccountId((prev) => {
              if (prev && activeAccounts.some((a) => a.id === prev)) return prev
              return activeAccounts[0].id
            })
          }
        }
      } catch {
        if (!cancelled) setSavingsAccounts([])
      } finally {
        if (!cancelled) setLoadingSavingsAccounts(false)
      }
    }
    void loadSavings()
    return () => {
      cancelled = true
    }
  }, [memberId, mode])

  // Pull branch share constraints
  useEffect(() => {
    let cancelled = false
    async function loadShareConfig() {
      try {
        const res = await fetch(`/api/institution/settings`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          config?: {
            minimumShares?: number | null
            maximumShares?: number | null
          }
        }
        if (cancelled) return
        const min = data.config?.minimumShares
        const max = data.config?.maximumShares
        setCfgMinShares(min == null ? undefined : Number(min))
        setCfgMaxShares(max == null ? undefined : Number(max))
      } catch {
        // Best-effort
      }
    }
    void loadShareConfig()
    return () => {
      cancelled = true
    }
  }, [])

  const rawMin = minShares ?? cfgMinShares
  const rawMax = maxShares ?? cfgMaxShares
  const effMin = typeof rawMin === "number" && rawMin > 0 ? rawMin : undefined
  const effMax = typeof rawMax === "number" && rawMax > 0 ? rawMax : undefined

  const effectiveUnitPrice = share.share_value || shareValue || 0
  const originalQty = share.number_of_shares || 0
  const qty = Math.max(parseInt(shares || "0", 10) || 0, 0)

  const previousTransactionValue = Number(share.total_value || originalQty * effectiveUnitPrice)
  const newTransactionValue = qty * effectiveUnitPrice
  const valueDifference = newTransactionValue - previousTransactionValue
  const sharesDifference = qty - originalQty

  // Projected holding calculation:
  // If Seller: selling more reduces holding; selling less restores holding.
  // If Buyer: buying more adds to holding; buying less reduces holding.
  const projectedShares = isSeller
    ? currentShares + originalQty - qty
    : currentShares - originalQty + qty

  const projectedHoldingValue = projectedShares * effectiveUnitPrice

  const fmt = (n: number) => formatCurrency(n, currency)

  // Member options list
  const memberOptions = useMemo(() => {
    const list = members.map((m) => ({
      value: m.id,
      label: `${m.full_name} (${m.member_number || "—"})`,
    }))
    if (
      share.transfer_member_id &&
      !list.some((o) => o.value === share.transfer_member_id)
    ) {
      list.unshift({
        value: share.transfer_member_id,
        label: `${share.transfer_member_name || "Counterparty"} (${share.transfer_member_number || "—"})`,
      })
    }
    return list
  }, [members, share])

  // Real-time holding constraint warnings
  let sharesHint: string | null = null
  if (qty > 0 && projectedShares < 0) {
    sharesHint = `Member does not have enough shares to sell ${qty} share(s) (holding would be ${projectedShares}).`
  } else if (qty > 0 && effMin && projectedShares < effMin) {
    sharesHint = `Minimum holding is ${effMin} share(s) — member holding would drop to ${projectedShares}.`
  } else if (qty > 0 && effMax && projectedShares > effMax) {
    sharesHint = `Maximum holding limit is ${effMax} share(s) — member holding would reach ${projectedShares}.`
  }

  const handleSubmit = () => {
    setError(null)

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Please enter a valid number of shares (minimum 1)")
      return
    }
    if (projectedShares < 0) {
      setError(`Member does not have enough shares to sell ${qty} share(s).`)
      return
    }
    if (effMin && projectedShares < effMin) {
      setError(`Minimum holding requirement is ${effMin} share${effMin === 1 ? "" : "s"}.`)
      return
    }
    if (effMax && projectedShares > effMax) {
      setError(`Maximum holding limit is ${effMax} share${effMax === 1 ? "" : "s"}.`)
      return
    }
    if (!paymentDate) {
      setError("Please select a transaction date")
      return
    }
    const parsedDate = new Date(paymentDate)
    if (Number.isNaN(parsedDate.getTime())) {
      setError("The selected transaction date is invalid")
      return
    }
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    if (parsedDate.getTime() > endOfToday.getTime()) {
      setError("Transaction date cannot be in the future")
      return
    }
    if (!counterpartyMemberId) {
      setError(
        isSeller
          ? "Please select the buyer member for this share buy-off"
          : "Please select the seller member for this share buy-off"
      )
      return
    }
    if (BANK_ROUTED_MODES.includes(mode) && !bankAccountId && bankAccounts.length > 0) {
      setError("Please select a bank account")
      return
    }
    if (mode === "Savings Account" && !savingsAccountId && savingsAccounts.length > 0) {
      setError("Please select a savings account")
      return
    }
    if (mode !== "Cash" && mode !== "Savings Account" && !referenceNumber.trim()) {
      setError(`Reference number is required for ${mode} payments`)
      return
    }

    void onSubmit({
      shareId: share.id,
      transactionId: share.transaction_id,
      numberOfShares: qty,
      shareValue: effectiveUnitPrice,
      totalValue: newTransactionValue,
      previousTotalValue: previousTransactionValue,
      valueDifference,
      sharesDifference,
      actionRole: isSeller ? "sell" : "buy",
      counterpartyMemberId,
      mode,
      paymentDate,
      referenceNumber:
        mode !== "Cash" && mode !== "Savings Account" ? referenceNumber.trim() || undefined : undefined,
      description:
        (share.description || "").trim() ||
        `Updated shares buy-off (${isSeller ? "sold to" : "purchased from"} counterparty): ${qty} share(s) @ ${effectiveUnitPrice.toLocaleString()} each`,
      bank_account_id: BANK_ROUTED_MODES.includes(mode) ? bankAccountId || undefined : undefined,
      savings_account_id: mode === "Savings Account" ? savingsAccountId || undefined : undefined,
    })
  }

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      {/* Transaction Details Header Badge */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-slate-700 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>
              Role:{" "}
              <strong className="font-semibold text-amber-800 dark:text-amber-300">
                {isSeller ? "Shares Sold (Buy-Out Outflow)" : "Shares Purchased (Buy-Off Inflow)"}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-slate-600">
              {share.transaction_number || (share.transaction_id ? share.transaction_id.slice(0, 8).toUpperCase() : "—")}
            </span>
          </div>
        </div>
      </div>

      {/* Current holding summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current Total</p>
          <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-slate-100">{currentShares.toLocaleString()} shares</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-wide text-gray-500">Projected Holding</p>
          <p className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
            {projectedShares.toLocaleString()} shares
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-wide text-gray-500">Holding Value</p>
          <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-slate-100">{fmt(projectedHoldingValue)}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 dark:border-red-900/50 dark:bg-red-950/30">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Counterparty Member Selector */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
          {isSeller ? "Sold To (Buyer Member)" : "Purchased From (Seller Member)"}{" "}
          <span className="text-red-500">*</span>
        </label>
        <StyledSelect
          value={counterpartyMemberId}
          onChange={setCounterpartyMemberId}
          placeholder={loadingMembers ? "Loading members…" : "Select counterparty member"}
          options={memberOptions}
          searchable
        />
        {share.transfer_member_name && (
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            Original counterparty: {share.transfer_member_name} ({share.transfer_member_number || "—"})
          </p>
        )}
      </div>

      {/* Number of shares */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
          Number of Shares <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="e.g. 10"
          className={inputClass}
        />
        {sharesHint ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {sharesHint}
          </p>
        ) : effMin || effMax ? (
          <p className="mt-1 text-xs text-gray-500">
            Limits: {effMin ? `min ${effMin}` : ""}{effMin && effMax ? " • " : ""}{effMax ? `max ${effMax}` : ""}
          </p>
        ) : null}
      </div>

      {/* Transaction Value Comparison Card */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 text-xs dark:border-slate-800">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Transaction Value Comparison</span>
          <span className="text-slate-500">
            Price: <strong className="font-mono text-slate-800 dark:text-slate-200">{fmt(effectiveUnitPrice)}</strong> / share
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Row 1: Previous Value */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="font-medium text-slate-600 dark:text-slate-300">Previous Buy-Off Value</p>
              <p className="text-[10px] text-slate-400">
                {originalQty} share{originalQty === 1 ? "" : "s"} @ {fmt(effectiveUnitPrice)}
              </p>
            </div>
            <span className="font-bold text-slate-800 text-sm dark:text-slate-100">{fmt(previousTransactionValue)}</span>
          </div>

          {/* Row 2: New Value */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="font-medium text-slate-600 dark:text-slate-300">New Buy-Off Value</p>
              <p className="text-[10px] text-slate-400">
                {qty} share{qty === 1 ? "" : "s"} @ {fmt(effectiveUnitPrice)}
              </p>
            </div>
            <span className="font-bold text-slate-900 text-sm dark:text-slate-100">{fmt(newTransactionValue)}</span>
          </div>

          {/* Row 3: Difference */}
          <div
            className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
              valueDifference > 0
                ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20"
                : valueDifference < 0
                  ? "border-blue-200 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            <div>
              <p
                className={`font-semibold ${
                  valueDifference > 0
                    ? "text-amber-900 dark:text-amber-300"
                    : valueDifference < 0
                      ? "text-blue-900 dark:text-blue-300"
                      : "text-slate-700 dark:text-slate-300"
                }`}
              >
                Difference (Net Settlement Adjustment)
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {sharesDifference > 0
                  ? `+${sharesDifference} more share(s) in transaction`
                  : sharesDifference < 0
                    ? `${sharesDifference} fewer share(s) in transaction`
                    : "No quantity change"}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {valueDifference > 0 && <TrendingUp className="h-4 w-4 text-amber-600 shrink-0" />}
              {valueDifference < 0 && <TrendingDown className="h-4 w-4 text-blue-600 shrink-0" />}
              {valueDifference === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
              <span
                className={`text-sm font-bold ${
                  valueDifference > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : valueDifference < 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {valueDifference > 0
                  ? `+${fmt(valueDifference)}`
                  : valueDifference < 0
                    ? `-${fmt(Math.abs(valueDifference))}`
                    : fmt(0)}
              </span>
            </div>
          </div>
        </div>

        {valueDifference !== 0 && (
          <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              {isSeller
                ? valueDifference > 0
                  ? `Selling ${sharesDifference} more shares will credit an additional ${fmt(valueDifference)} to the seller.`
                  : `Selling ${Math.abs(sharesDifference)} fewer shares will reduce seller proceeds by ${fmt(Math.abs(valueDifference))}.`
                : valueDifference > 0
                  ? `Buying ${sharesDifference} more shares requires an additional ${fmt(valueDifference)} payment.`
                  : `Buying ${Math.abs(sharesDifference)} fewer shares reduces the required payment by ${fmt(Math.abs(valueDifference))}.`}
            </span>
          </p>
        )}
      </div>

      {/* Mode & Date */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Payout / Settlement Mode</label>
          <StyledSelect value={mode} onChange={setMode} placeholder="Select mode" options={BUY_OFF_MODES} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            Transaction Date <span className="text-red-500">*</span>
          </label>
          <ReeveDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Select date" />
        </div>
      </div>

      {/* Bank Account (Bank-routed modes) */}
      {BANK_ROUTED_MODES.includes(mode) && bankAccounts.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            Bank Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder="Select bank account"
            options={bankAccounts.map((ba) => ({
              value: ba.id,
              label: `${ba.bank_name} — ${ba.bank_account_number}`,
            }))}
          />
        </div>
      )}

      {/* Savings Account (Savings Account mode) */}
      {mode === "Savings Account" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            {isSeller ? "Seller Savings Account (Credit)" : "Buyer Savings Account (Debit)"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={savingsAccountId}
            onChange={setSavingsAccountId}
            placeholder={loadingSavingsAccounts ? "Loading savings accounts…" : "Select savings account"}
            options={savingsAccounts.map((sa) => ({
              value: sa.id,
              label: `${sa.account_number} (${sa.account_type || "Savings"}) — Bal: ${fmt(sa.available_balance ?? 0)}`,
            }))}
          />
        </div>
      )}

      {/* Reference Number (Non-Cash and Non-Savings Account) */}
      {mode !== "Cash" && mode !== "Savings Account" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            Reference Number <span className="text-red-500">*</span>
          </label>
          <input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. transaction ref or receipt ID"
            className={inputClass}
          />
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving Changes…" : "Update Buy-Off Record"}
        </button>
      </div>
    </div>
  )
}
