"use client"

import React, { useState } from "react"
import { AlertTriangle, Ban, Loader2, ShieldAlert } from "lucide-react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/format-currency"
import type { ShareTransaction } from "../../[id]/shares/page"

interface VoidSharesModalProps {
  isOpen: boolean
  onClose: () => void
  share: ShareTransaction | null
  memberId: string
  memberFullName?: string
  currency?: string
  onSuccess?: () => void
}

function mapVoidError(code: unknown): string {
  const c = String(code || "")
  switch (c) {
    case "shares_already_transferred_or_sold":
      return "Cannot void this share record because some or all of the shares have already been transferred or sold."
    case "share_record_already_cancelled":
      return "This share record has already been voided or cancelled."
    case "missing_permission:edit_shares":
      return "You do not have permission to void share records."
    case "shares_not_found":
      return "Share record not found."
    default:
      return c || "Unexpected error while voiding share record."
  }
}

export default function VoidSharesModal({
  isOpen,
  onClose,
  share,
  memberId,
  memberFullName,
  currency = "UGX",
  onSuccess,
}: VoidSharesModalProps) {
  const [reason, setReason] = useState("Voided by institution staff")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  if (!share) return null

  const acq = String(share.acquisition_type || "purchase").toLowerCase().trim()
  const acqLabel =
    acq === "purchase"
      ? "Share Purchase"
      : acq === "transfer_in"
        ? "Share Transfer In"
        : acq === "transfer_out"
          ? "Share Transfer Out"
          : acq === "sell" || acq === "buy_out"
            ? "Shares Sold (Buy-Out)"
            : acq === "buy" || acq === "buy_off"
              ? "Shares Bought (Buy-Off)"
              : acq

  const handleVoid = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/shares/${share.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Voided by institution staff" }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(mapVoidError(body?.code || body?.error || body?.detail))
      }

      toast({
        variant: "success",
        title: "Share record voided",
        description: `Successfully voided ${share.number_of_shares} share(s) record. Linked transactions have been cancelled and balances reversed.`,
      })
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to void share record",
        description: String((e as Error)?.message || "Unexpected error"),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Void Share Record" className="z-50 max-w-lg">
      <div className="space-y-5 p-1">
        {/* Warning Callout */}
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="space-y-1 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">Void & Financial Reversal Warning</p>
              <p className="text-xs leading-relaxed text-red-700/90 dark:text-red-300/80">
                Voiding this record will immediately cancel the linked financial transaction, cancel the invoice payment, reverse any cash/bank or savings balances, and deduct these shares from active member holdings.
              </p>
            </div>
          </div>
        </div>

        {/* Share Record Summary Card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</span>
            <Badge variant="outline" className="font-semibold">
              {acqLabel}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Transaction Ref</span>
            <span className="font-mono font-semibold text-foreground">
              {share.transaction_number || (share.transaction_id ? share.transaction_id.slice(0, 8).toUpperCase() : "—")}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shares Count</span>
            <span className="font-bold text-foreground">
              {share.number_of_shares} {share.number_of_shares === 1 ? "share" : "shares"}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Price per Share</span>
            <span className="font-mono text-muted-foreground">{formatCurrency(share.share_value, currency)}</span>
          </div>

          <div className="flex items-center justify-between text-sm border-t border-border/60 pt-2 font-semibold">
            <span className="text-foreground">Total Financial Value</span>
            <span className="text-red-600 dark:text-red-400 font-mono">
              {formatCurrency(share.total_value, currency)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Payment Mode</span>
            <span>{share.mode || "Cash"}</span>
          </div>
        </div>

        {/* Reason Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reason for Voiding <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:text-zinc-100"
            placeholder="e.g. Erroneous duplicate entry, wrong member selected..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleVoid}
            disabled={loading || !reason.trim()}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Confirm & Void Share Record
          </Button>
        </div>
      </div>
    </ReeveModal>
  )
}
