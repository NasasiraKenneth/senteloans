"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import GrantAmountForm, {
  type GrantAmountFormData,
  type GrantAmountSummary,
} from "../forms/grantAmountForm"

interface EditGrantAmountProps {
  isOpen: boolean
  grantId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_amount: "Enter a valid amount greater than zero.",
  amount_exceeds_remaining: "Amount received cannot exceed the remaining grant balance.",
  grant_already_complete: "This grant is already complete — the full pledge has been received.",
  "missing_permission:edit_grant_amount": "You do not have permission to edit the received amount.",
  not_found: "This grant no longer exists.",
  invalid_payment_mode: "Select a valid payment mode.",
  reference_number_required: "Reference number is required for this payment mode.",
  bank_account_required: "Select a bank account for bank-routed payments.",
  invalid_bank_account: "The selected bank account is invalid.",
  insufficient_bank_balance: "Insufficient bank account balance.",
  insufficient_cash_balance: "Insufficient cash balance.",
  insufficient_mobile_money_balance: "Insufficient mobile money balance.",
}

function formatError(code: string, message?: string): string {
  if (message?.trim()) return message.trim()
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

export default function EditGrantAmount({ isOpen, grantId, onClose, onSuccess }: EditGrantAmountProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [summary, setSummary] = useState<GrantAmountSummary | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !grantId) {
      setSummary(null)
      setFetchError(null)
      return
    }

    const fetchGrant = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/institution/finances/grants/${grantId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load grant")

        const g = body?.grant
        const totalAmount = Number(g?.total_amount || 0)
        const availableBalance = Number(g?.available_balance || 0)

        if (totalAmount > 0 && availableBalance >= totalAmount) {
          throw new Error("grant_already_complete")
        }

        setSummary({
          third_party_agent_name: String(g?.third_party_agent_name || ""),
          total_amount: totalAmount,
          available_balance: availableBalance,
          remaining_amount: Number(g?.remaining_amount || Math.max(0, totalAmount - availableBalance)),
          percentage_received: Number(g?.percentage_received || 0),
        })
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        setSummary(null)
        toast({
          title: message === "grant_already_complete" ? "Grant complete" : "Failed to load grant",
          description: formatError(message),
          variant: message === "grant_already_complete" ? "warning" : "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchGrant()
  }, [isOpen, grantId, toast])

  const handleUpdate = async (data: GrantAmountFormData) => {
    if (!grantId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/finances/grants/${grantId}/amount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(data.amount),
          mode: data.mode,
          reference_number: data.reference_number || null,
          bank_account_id: data.bank_account_id || null,
          date: data.date || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errCode = String(body?.error || "")
        const errMessage = typeof body?.message === "string" ? body.message : undefined
        toast({
          title:
            errCode === "grant_already_complete"
              ? "Grant complete"
              : errCode === "amount_exceeds_remaining"
                ? "Amount too high"
                : "Failed to update amount",
          description: formatError(errCode, errMessage),
          variant:
            errCode === "grant_already_complete" || errCode === "amount_exceeds_remaining"
              ? "warning"
              : "destructive",
        })
        return
      }

      toast({
        title: "Amount added",
        description: "The received amount has been updated.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        title: "Failed to update amount",
        description: String((e as Error)?.message || "Something went wrong. Please try again."),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Add amount received" className="z-[1000] w-[32rem]">
      {fetching ? (
        <p className="p-4 text-sm text-muted-foreground">Loading grant…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : summary ? (
        <GrantAmountForm
          key={grantId}
          summary={summary}
          onSubmit={handleUpdate}
          onCancel={onClose}
          loading={loading}
        />
      ) : null}
    </ReeveModal>
  )
}
