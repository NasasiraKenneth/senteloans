"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import { toDateOnlyString } from "@/lib/finances/date-only"
import ClaimForm, { type ClaimFormData } from "../forms/claimForm"

interface ClaimDepositProps {
  isOpen: boolean
  depositId: string | null
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  assignee_required: "Select a member or third party agent to assign this deposit to.",
  invalid_member: "The selected member is invalid for this branch.",
  invalid_third_party_agent: "The selected third party agent is invalid for this branch.",
  invalid_client: "The selected third party agent is invalid for this branch.",
  invalid_transaction: "The selected transaction is invalid for this assignee.",
  transaction_already_linked: "This transaction is already linked to another deposit.",
  transaction_amount_mismatch: "The transaction amount does not match the deposit amount.",
  member_and_client_conflict: "Assign either a member or a third party agent, not both.",
  deposit_already_claimed: "This deposit has already been claimed.",
  "missing_permission:edit_unclaimed_deposit": "You do not have permission to claim deposits.",
  not_found: "This deposit no longer exists.",
}

function formatError(code: string, message?: string): string {
  if (message?.trim()) return message.trim()
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

type DepositSummary = {
  amount: number
  transaction_number: string
  date: string
  mode: string
}

export default function ClaimDeposit({ isOpen, depositId, onClose, onSuccess }: ClaimDepositProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [depositSummary, setDepositSummary] = useState<DepositSummary | null>(null)
  const [branchId, setBranchId] = useState<string>("")
  const [formKey, setFormKey] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !depositId) {
      setDepositSummary(null)
      setFetchError(null)
      setBranchId("")
      return
    }

    const fetchDeposit = async () => {
      setFetching(true)
      setFetchError(null)
      setFormKey((k) => k + 1)
      try {
        const res = await fetch(`/api/institution/finances/unclaimed-deposits/${depositId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const errCode = String(body?.error || "")
          throw new Error(errCode || "Failed to load deposit")
        }

        const d = body?.deposit
        const status = String(d?.status || "").trim().toLowerCase()
        if (status !== "unclaimed") {
          throw new Error("deposit_already_claimed")
        }

        setDepositSummary({
          amount: Number(d?.amount || 0),
          transaction_number: d?.transaction_number || "",
          date: toDateOnlyString(d?.date),
          mode: d?.mode || "",
        })
        setBranchId(String(d?.branch_id || ""))
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "")
        setFetchError(message)
        setDepositSummary(null)
        setBranchId("")
        toast({
          title: message === "deposit_already_claimed" ? "Already claimed" : "Failed to load deposit",
          description: formatError(message),
          variant: "warning",
        })
      } finally {
        setFetching(false)
      }
    }

    void fetchDeposit()
  }, [isOpen, depositId, toast])

  const handleClaim = async (data: ClaimFormData) => {
    if (!depositId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/finances/unclaimed-deposits/${depositId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: data.assignee_type === "member" ? data.member_id : null,
          third_party_agent_id:
            data.assignee_type === "third_party_agent" ? data.third_party_agent_id : null,
          transaction_id: data.transaction_id || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errCode = String(body?.error || "")
        const errMessage = typeof body?.message === "string" ? body.message : undefined
        const warningCodes = new Set([
          "deposit_already_claimed",
          "transaction_already_linked",
          "transaction_amount_mismatch",
          "invalid_transaction",
        ])
        const title =
          errCode === "deposit_already_claimed"
            ? "Already claimed"
            : errCode === "transaction_already_linked"
              ? "Transaction in use"
              : errCode === "transaction_amount_mismatch"
                ? "Amount mismatch"
                : errCode === "invalid_transaction"
                  ? "Invalid transaction"
                  : "Failed to claim deposit"
        toast({
          title,
          description: formatError(errCode, errMessage),
          variant: warningCodes.has(errCode) ? "warning" : "destructive",
        })
        return
      }

      toast({
        title: "Deposit claimed",
        description: "The deposit has been linked and marked as claimed.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      toast({
        title: "Failed to claim deposit",
        description: String((e as Error)?.message || "Something went wrong. Please try again."),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Claim deposit" className="z-[1000] w-[32rem]">
      {fetching ? (
        <p className="p-4 text-sm text-muted-foreground">Loading deposit…</p>
      ) : fetchError ? (
        <p className="p-4 text-sm text-red-600">{formatError(fetchError)}</p>
      ) : depositSummary ? (
        <ClaimForm
          key={`${depositId}-${formKey}`}
          depositSummary={depositSummary}
          branchId={branchId}
          onSubmit={handleClaim}
          onCancel={onClose}
          loading={loading}
        />
      ) : null}
    </ReeveModal>
  )
}
