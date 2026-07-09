"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import BankAmountForm, {
  type BankAmountFormData,
  type BankAmountSummary,
} from "../forms/bankAmountForm"

interface EditAccountAmountProps {
  isOpen: boolean
  accountId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_amount: "Enter a valid amount greater than zero.",
  invalid_direction: "Choose either Deposit or Withdraw.",
  invalid_date: "Select a valid date.",
  invalid_mode: "Select a valid transfer mode.",
  invalid_transaction_charges: "Enter a valid charge amount (0 or greater).",
  invalid_bank_account: "Choose a different bank account for this transfer.",
  reference_number_required: "Reference number is required.",
  mode_reference_number_required: "Reference number is required for this transfer mode.",
  bank_account_required: "Select the bank account to transfer from.",
  bank_account_not_found: "The selected bank account no longer exists.",
  insufficient_balance: "Withdrawal exceeds the current balance.",
  insufficient_bank_balance: "The source bank account has insufficient funds.",
  insufficient_cash_balance: "Insufficient cash float for this transfer.",
  insufficient_mobile_money_balance: "Insufficient mobile money float for this transfer.",
  balance_changed: "The account balance changed since this form was opened. Reload and try again.",
  "missing_permission:edit_bank_amount": "You do not have permission to update bank balances.",
  not_found: "This bank account no longer exists.",
}

function formatError(code: string, message?: string): string {
  if (message?.trim()) return message.trim()
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

export default function EditAccountAmount({
  isOpen,
  accountId,
  onClose,
  onSuccess,
}: EditAccountAmountProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BankAmountSummary | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !accountId) {
      setSummary(null)
      setFetchError(null)
      return
    }

    const fetchAccount = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/institution/finances/bank-accounts/${accountId}`, {
          cache: "no-store",
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load bank account")

        const a = body?.account
        setSummary({
          id: String(a?.id || accountId),
          bank_name: String(a?.bank_name || ""),
          bank_account_number: String(a?.bank_account_number || ""),
          branch_name: String(a?.branch_name || ""),
          total_amount: Number(a?.total_amount || 0),
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        setSummary(null)
        toast({
          title: "Failed to load bank account",
          description: formatError(message),
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchAccount()
  }, [isOpen, accountId, toast])

  const handleUpdate = async (data: BankAmountFormData) => {
    if (!accountId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/finances/bank-accounts/${accountId}/amount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(data.amount),
          direction: data.direction,
          date: data.date,
          mode: data.mode,
          bank_account_id: data.bank_account_id || undefined,
          reference_number: data.reference_number || undefined,
          mode_reference_number: data.mode_reference_number || undefined,
          transaction_charges:
            data.transaction_charges.trim() !== ""
              ? Number(data.transaction_charges)
              : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errCode = String(body?.error || "")
        const errMessage = typeof body?.message === "string" ? body.message : undefined
        const warningCodes = new Set([
          "insufficient_balance",
          "insufficient_bank_balance",
          "insufficient_cash_balance",
          "insufficient_mobile_money_balance",
          "balance_changed",
        ])
        toast({
          title:
            errCode === "insufficient_balance"
              ? "Insufficient balance"
              : errCode === "balance_changed"
                ? "Balance changed"
                : "Failed to update balance",
          description: formatError(errCode, errMessage),
          variant: warningCodes.has(errCode) ? "warning" : "destructive",
        })
        return
      }

      toast({
        title: data.direction === "deposit" ? "Deposit recorded" : "Withdrawal recorded",
        description: "The account balance has been updated.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        title: "Failed to update balance",
        description: String((e as Error)?.message || "Something went wrong. Please try again."),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const showPanel = isOpen && !!accountId
  const showLoading = showPanel && !fetchError && (fetching || !summary)

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Update account balance" className="z-[1000] w-[32rem]">
      {!showPanel ? null : showLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading bank account…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : summary ? (
        <BankAmountForm
          key={accountId}
          summary={summary}
          onSubmit={handleUpdate}
          onCancel={onClose}
          loading={loading}
        />
      ) : null}
    </ReeveModal>
  )
}
