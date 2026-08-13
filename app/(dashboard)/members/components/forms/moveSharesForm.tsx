"use client"

import React, { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowRightLeft, Coins, HelpCircle, Info, Landmark, User, UserCheck } from "lucide-react"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { formatCurrency } from "@/lib/format-currency"

export interface MoveSharesPayload {
  actionType: "transfer" | "sell"
  numberOfShares: number
  transferMemberId?: string
  buyingMemberId?: string
  sellingMemberAccountId?: string
  seller_account_id?: string
  mode: string
  date: string
  referenceNumber?: string
  bank_account_id?: string
  savings_account_id?: string
  description?: string
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

interface MoveSharesFormProps {
  memberId: string
  memberFullName?: string
  currency?: string
  shareValue?: number
  currentShares?: number
  currentTotalValue?: number
  minShares?: number
  maxShares?: number
  onSubmit: (data: MoveSharesPayload) => void | Promise<void>
  loading?: boolean
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"

const SELL_PAYOUT_MODES = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Savings Account", label: "Savings Account" },
]

const BANK_ROUTED_MODES = ["Bank Transfer"]

export default function MoveSharesForm({
  memberId,
  memberFullName,
  currency = "UGX",
  shareValue = 0,
  currentShares = 0,
  currentTotalValue = 0,
  minShares,
  maxShares,
  onSubmit,
  loading = false,
}: MoveSharesFormProps) {
  const [actionType, setActionType] = useState<"transfer" | "sell">("transfer")
  const [sharesToMove, setSharesToMove] = useState("")
  const [targetMemberId, setTargetMemberId] = useState("")
  const [mode, setMode] = useState("Internal Transfer")
  const [date, setDate] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [savingsAccountId, setSavingsAccountId] = useState("")
  const [loadingSavingsAccounts, setLoadingSavingsAccounts] = useState(false)
  const [sellingMemberAccounts, setSellingMemberAccounts] = useState<SavingsAccount[]>([])
  const [sellingMemberAccountId, setSellingMemberAccountId] = useState("")
  const [loadingSellingMemberAccounts, setLoadingSellingMemberAccounts] = useState(false)
  const [cfgMinShares, setCfgMinShares] = useState<number | undefined>(undefined)
  const [cfgShareValue, setCfgShareValue] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  // Fetch active members for transfer destination / buying member
  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      setLoadingMembers(true)
      try {
        const res = await fetch("/api/institution/members?limit=200&status=Active", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const rows = Array.isArray(data?.members) ? data.members : []
        if (!cancelled) {
          setMembers(
            rows
              .filter((m: Record<string, unknown>) => String(m.id || "") !== memberId)
              .map((m: Record<string, unknown>) => ({
                id: String(m.id || ""),
                full_name: String(m.full_name || "").trim(),
                member_number: String(m.member_number || "").trim(),
                status: String(m.status || ""),
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
        // ignore
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [memberId])

  // Fetch savings accounts for selling member
  useEffect(() => {
    let cancelled = false
    async function loadSellingMemberSavings() {
      if (!memberId) return
      setLoadingSellingMemberAccounts(true)
      try {
        const res = await fetch(`/api/institution/savings?member_id=${memberId}&limit=50`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as { items?: SavingsAccount[]; accounts?: SavingsAccount[] }
        if (!cancelled) {
          const list = data.items || data.accounts || []
          setSellingMemberAccounts(list)
          if (list.length > 0) {
            setSellingMemberAccountId((prev) => prev || list[0].id)
          }
        }
      } catch {
        if (!cancelled) setSellingMemberAccounts([])
      } finally {
        if (!cancelled) setLoadingSellingMemberAccounts(false)
      }
    }
    void loadSellingMemberSavings()
    return () => {
      cancelled = true
    }
  }, [memberId])

  // Fetch savings accounts for buying member (when in buy out mode with Savings Account payout)
  useEffect(() => {
    let cancelled = false
    async function loadSavings() {
      if (!targetMemberId || actionType !== "sell") {
        setSavingsAccounts([])
        setSavingsAccountId("")
        return
      }
      setLoadingSavingsAccounts(true)
      try {
        const res = await fetch(`/api/institution/savings?member_id=${targetMemberId}&limit=50`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as { items?: SavingsAccount[]; accounts?: SavingsAccount[] }
        if (!cancelled) {
          const list = data.items || data.accounts || []
          setSavingsAccounts(list)
          if (list.length > 0) {
            setSavingsAccountId(list[0].id)
          } else {
            setSavingsAccountId("")
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
  }, [targetMemberId, actionType])

  // Fetch settings config
  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      try {
        const res = await fetch(`/api/institution/settings`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          config?: {
            minimumShares?: number | null
            shareValue?: number | null
          }
        }
        if (cancelled) return
        if (data.config?.minimumShares != null) setCfgMinShares(Number(data.config.minimumShares))
        if (data.config?.shareValue != null) setCfgShareValue(Number(data.config.shareValue))
      } catch {
        // ignore
      }
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [])

  const rawMin = minShares ?? cfgMinShares
  const effMin = typeof rawMin === "number" && rawMin > 0 ? rawMin : undefined
  const effectiveShareValue = shareValue > 0 ? shareValue : (cfgShareValue || 0)
  const sharesToMoveNum = Number(sharesToMove) || 0
  const totalMoveValue = sharesToMoveNum * effectiveShareValue
  const remainingShares = currentShares - sharesToMoveNum
  const remainingValue = remainingShares * effectiveShareValue

  // On transfer, member must maintain minimum holding (effMin). On buy out / liquidation, they can liquidate all.
  const maxAllowedToMove =
    actionType === "transfer" && effMin
      ? Math.max(currentShares - effMin, 0)
      : currentShares

  // Inline validation hint (matching sharesForm pattern)
  let sharesHint: string | null = null
  if (actionType === "transfer" && effMin) {
    if (currentShares <= effMin) {
      sharesHint = `Member must maintain the minimum holding of ${effMin} share${effMin === 1 ? "" : "s"} (currently holds ${currentShares}). No shares can be transferred.`
    } else if (sharesToMoveNum > 0 && remainingShares < effMin) {
      sharesHint = `Minimum holding is ${effMin} share${effMin === 1 ? "" : "s"} — remaining shares (${remainingShares}) cannot be less than ${effMin}. You can transfer at most ${maxAllowedToMove} share${maxAllowedToMove === 1 ? "" : "s"}.`
    } else if (sharesToMoveNum > currentShares) {
      sharesHint = `Cannot transfer more than current holding of ${currentShares} shares.`
    }
  } else if (sharesToMoveNum > currentShares) {
    sharesHint = `Cannot buy out more than current holding of ${currentShares} shares.`
  }

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: `${m.full_name} (${m.member_number})`,
      })),
    [members],
  )

  const handleActionTypeChange = (type: "transfer" | "sell") => {
    setActionType(type)
    setMode(type === "transfer" ? "Internal Transfer" : "Cash")
    setTargetMemberId("")
    setSavingsAccountId("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!Number.isInteger(sharesToMoveNum) || sharesToMoveNum <= 0) {
      setError("Please enter a valid number of shares to move.")
      return
    }

    if (sharesToMoveNum > currentShares) {
      setError(`Cannot move ${sharesToMoveNum} shares. Member only holds ${currentShares} shares.`)
      return
    }

    if (actionType === "transfer") {
      if (effMin && currentShares <= effMin) {
        setError(
          `Cannot transfer shares: member must maintain the minimum holding of ${effMin} share${effMin === 1 ? "" : "s"} (currently holds ${currentShares}).`
        )
        return
      }

      if (effMin && remainingShares < effMin) {
        const maxTransferable = Math.max(currentShares - effMin, 0)
        setError(
          `Minimum holding is ${effMin} share${effMin === 1 ? "" : "s"} — remaining shares (${remainingShares}) cannot be less than the minimum. You can transfer at most ${maxTransferable} share${maxTransferable === 1 ? "" : "s"}.`
        )
        return
      }

      if (!targetMemberId) {
        setError("Please select the destination member for this share transfer.")
        return
      }
      if (targetMemberId === memberId) {
        setError("Cannot transfer shares to the same member.")
        return
      }
    }

    if (actionType === "sell") {
      if (!targetMemberId) {
        setError("Please select the buying member.")
        return
      }
      if (targetMemberId === memberId) {
        setError("The buying member cannot be the same as the selling member.")
        return
      }
      if (!sellingMemberAccountId) {
        setError("Please select the selling member's account.")
        return
      }
      if (mode === "Savings Account" && !savingsAccountId) {
        setError("Please select the buying member's savings account.")
        return
      }
    }

    if (BANK_ROUTED_MODES.includes(mode) && !bankAccountId) {
      setError("Please select a bank account for this payment mode.")
      return
    }

    if ((mode === "Bank Transfer" || mode === "Mobile Money") && !referenceNumber.trim()) {
      setError("Reference number is required for this payment mode.")
      return
    }

    if (date) {
      const selectedDate = new Date(date)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (selectedDate > today) {
        setError(`${actionType === "transfer" ? "Transfer" : "Buy"} date cannot be in the future.`)
        return
      }
    }

    const payload: MoveSharesPayload = {
      actionType,
      numberOfShares: sharesToMoveNum,
      transferMemberId: actionType === "transfer" ? targetMemberId : undefined,
      buyingMemberId: actionType === "sell" ? targetMemberId : undefined,
      sellingMemberAccountId: actionType === "sell" ? sellingMemberAccountId : undefined,
      seller_account_id: actionType === "sell" ? sellingMemberAccountId : undefined,
      mode,
      date: date || new Date().toISOString().slice(0, 10),
      referenceNumber: referenceNumber.trim() || undefined,
      bank_account_id: bankAccountId || undefined,
      savings_account_id: mode === "Savings Account" ? savingsAccountId || undefined : undefined,
      description:
        actionType === "transfer"
          ? `Share transfer of ${sharesToMoveNum} shares to member`
          : `Share buy out of ${sharesToMoveNum} shares by member`,
    }

    await onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-5 overflow-y-auto p-5 sm:p-6">
      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Action Mode Toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          type="button"
          onClick={() => handleActionTypeChange("transfer")}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-md transition-all ${
            actionType === "transfer"
              ? "bg-white text-orange-600 shadow-xs dark:bg-slate-900 dark:text-orange-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" />
          Transfer to Member
        </button>
        <button
          type="button"
          onClick={() => handleActionTypeChange("sell")}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-md transition-all ${
            actionType === "sell"
              ? "bg-white text-orange-600 shadow-xs dark:bg-slate-900 dark:text-orange-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Coins className="h-4 w-4" />
          Buy Out / Liquidate
        </button>
      </div>

      {/* Live Calculation Preview Banner */}
      <div className="rounded-xl border border-orange-200/80 bg-orange-50/60 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
        <div className="flex items-center justify-between text-xs font-medium text-orange-950 dark:text-orange-200 border-b border-orange-200/60 dark:border-orange-900/40 pb-2 mb-3">
          <span>{memberFullName ? `${memberFullName}'s Equity Position` : "Member Equity Position"}</span>
          <span>1 Share = {formatCurrency(effectiveShareValue, currency)}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-orange-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Current Holding</span>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {currentShares} shares
            </div>
            <div className="text-[11px] text-slate-400">
              {formatCurrency(currentTotalValue || currentShares * effectiveShareValue, currency)}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-orange-100/60 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800/60">
            <span className="text-[11px] text-orange-800 dark:text-orange-300 font-semibold">
              {actionType === "transfer" ? "Transferring" : "Liquidating"}
            </span>
            <div className="text-sm font-black text-orange-700 dark:text-orange-400 mt-0.5">
              {sharesToMoveNum > 0 ? `-${sharesToMoveNum}` : "0"} shares
            </div>
            <div className="text-[11px] text-orange-800/80 dark:text-orange-300/80 font-medium">
              {formatCurrency(totalMoveValue, currency)}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-orange-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Remaining</span>
            <div
              className={`text-sm font-bold mt-0.5 ${
                remainingShares < 0 || (actionType === "transfer" && effMin && remainingShares < effMin)
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {remainingShares} shares
            </div>
            <div className="text-[11px] text-slate-400">
              {formatCurrency(remainingValue > 0 ? remainingValue : 0, currency)}
            </div>
          </div>
        </div>

        {/* Warning if remaining below minimum requirement (only on transfer) */}
        {actionType === "transfer" && effMin && remainingShares < effMin && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {currentShares <= effMin
                ? `Cannot transfer shares: member must maintain the minimum holding of ${effMin} share${effMin === 1 ? "" : "s"} (currently holds ${currentShares}).`
                : `Remaining holding (${remainingShares} shares) would drop below the branch minimum requirement of ${effMin} shares.`}
            </span>
          </div>
        )}
      </div>

      {/* Target Member Selection (Destination Member on transfer / Buying Member on buy out) */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {actionType === "transfer" ? "Destination Member" : "Buying Member"} <span className="text-red-500">*</span>
        </label>
        <StyledSelect
          value={targetMemberId}
          onChange={setTargetMemberId}
          options={memberOptions}
          placeholder={
            loadingMembers
              ? "Loading active members..."
              : actionType === "transfer"
                ? "Select recipient member"
                : "Select buying member"
          }
          searchable
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {actionType === "transfer"
            ? "Select the active SACCO member who will receive these shares."
            : "Select the active SACCO member who is buying these shares."}
        </p>
      </div>

      {/* Number of Shares Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Number of Shares to {actionType === "transfer" ? "Transfer" : "Buy Out"} <span className="text-red-500">*</span>
          </label>
          {currentShares > 0 && (
            <button
              type="button"
              disabled={maxAllowedToMove <= 0}
              onClick={() => setSharesToMove(String(maxAllowedToMove))}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
            >
              Move All ({maxAllowedToMove})
            </button>
          )}
        </div>
        <input
          type="number"
          min={1}
          max={maxAllowedToMove}
          step={1}
          required
          value={sharesToMove}
          onChange={(e) => setSharesToMove(e.target.value)}
          placeholder={
            maxAllowedToMove > 0
              ? `Enter number of shares (Max: ${maxAllowedToMove})`
              : "0 shares available to transfer"
          }
          className={inputClass}
        />
        {sharesHint ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {sharesHint}
          </p>
        ) : actionType === "transfer" && effMin ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Holding limit: minimum {effMin} share{effMin === 1 ? "" : "s"} required to retain (max transferable: {maxAllowedToMove})
          </p>
        ) : null}
      </div>

      {/* Date Input */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {actionType === "transfer" ? "Transfer Date" : "Buy Date"} <span className="text-red-500">*</span>
        </label>
        <ReeveDatePicker
          value={date}
          onChange={(val) => setDate(val || "")}
          placeholder="Select date"
          maxDate={new Date()}
        />
      </div>

      {/* Selling Member Account Selection (Only for Buy Out / Liquidation, below Buy Date) */}
      {actionType === "sell" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Selling Member Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={sellingMemberAccountId}
            onChange={setSellingMemberAccountId}
            options={sellingMemberAccounts.map((sa) => ({
              value: sa.id,
              label: `${sa.account_number} — ${sa.account_type || "Savings"} (${formatCurrency(Number(sa.available_balance || 0), currency)})`,
            }))}
            placeholder={
              loadingSellingMemberAccounts
                ? "Loading selling member accounts..."
                : sellingMemberAccounts.length === 0
                  ? "No accounts found for selling member"
                  : "Select selling member account"
            }
          />
          {!loadingSellingMemberAccounts && sellingMemberAccounts.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              The selling member does not have an active savings account.
            </p>
          )}
        </div>
      )}

      {/* Payout Channel Selection (Only for Buy Out / Liquidation) */}
      {actionType === "sell" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Payout Channel <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={mode}
            onChange={setMode}
            options={SELL_PAYOUT_MODES}
            placeholder="Select payout channel"
          />
        </div>
      )}

      {/* Buying Member Savings Account Selection (When Payout Channel is Savings Account) */}
      {actionType === "sell" && mode === "Savings Account" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Buying Member Savings Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={savingsAccountId}
            onChange={setSavingsAccountId}
            options={savingsAccounts.map((sa) => ({
              value: sa.id,
              label: `${sa.account_number} — ${sa.account_type || "Savings"} (${formatCurrency(Number(sa.available_balance || 0), currency)})`,
            }))}
            placeholder={
              !targetMemberId
                ? "Select buying member first"
                : loadingSavingsAccounts
                  ? "Loading savings accounts..."
                  : savingsAccounts.length === 0
                    ? "No savings accounts found for this member"
                    : "Select savings account"
            }
          />
          {targetMemberId && !loadingSavingsAccounts && savingsAccounts.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              The selected buying member does not have an active savings account.
            </p>
          )}
        </div>
      )}

      {/* Bank Account Selection for Bank Routed Modes */}
      {BANK_ROUTED_MODES.includes(mode) && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Branch Bank Account <span className="text-red-500">*</span>
          </label>
          <StyledSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            options={bankAccounts.map((b) => ({
              value: b.id,
              label: `${b.bank_name} - ${b.bank_account_number}`,
            }))}
            placeholder="Select branch bank account"
          />
        </div>
      )}

      {/* Reference Number (if Bank Transfer or Mobile Money) */}
      {(mode === "Bank Transfer" || mode === "Mobile Money") && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Reference / Receipt Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. TXN-984210"
            className={inputClass}
          />
        </div>
      )}

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setSharesToMove("")
            setTargetMemberId("")
            setSavingsAccountId("")
            setSellingMemberAccountId(sellingMemberAccounts[0]?.id || "")
            setReferenceNumber("")
            setError(null)
          }}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={
            loading ||
            sharesToMoveNum <= 0 ||
            sharesToMoveNum > currentShares ||
            (actionType === "transfer" && effMin != null && remainingShares < effMin)
          }
          className="px-5 py-2 text-sm font-semibold text-white bg-[#f08c2b] hover:bg-[#d97706] rounded-md shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? "Processing..."
            : actionType === "transfer"
              ? `Confirm Transfer`
              : `Confirm Buy Out`}
        </button>
      </div>
    </form>
  )
}
