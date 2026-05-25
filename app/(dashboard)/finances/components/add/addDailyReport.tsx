"use client"

import { useCallback, useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import DailyReportForm, { type DailyReportFormData } from "../forms/dailyReportForm"

interface AddDailyReportProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  "missing_permission:edit_daily_report": "You do not have permission to file daily reports.",
  branch_id_required: "Select a branch for this report.",
  invalid_branch: "The selected branch is invalid.",
  invalid_bank_account_amount: "One of the bank account amounts is invalid.",
  invalid_bank_account: "A selected bank account no longer exists for this branch.",
  no_amounts_declared: "Enter at least one declared amount above 0.",
  daily_report_already_filed: "Today's financial report has already been recorded.",
}

function formatError(code: string): string {
  return ERROR_MESSAGES[code] || code.replace(/_/g, " ")
}

export default function AddDailyReport({ isOpen, onClose, onSuccess }: AddDailyReportProps) {
  const [loading, setLoading] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [metaLoading, setMetaLoading] = useState(true)
  const [formKey, setFormKey] = useState(0)
  const { toast } = useToast()

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    try {
      const res = await fetch("/api/institution/finances/permissions", { cache: "no-store" })
      if (!res.ok) {
        setBranchOptions([])
        setIsSuperAdmin(false)
        return
      }
      const body = await res.json().catch(() => ({}))
      const p = body?.permissions
      setIsSuperAdmin(!!p?.isSuperAdmin)
      setBranchOptions(
        (p?.branches || []).map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })),
      )
    } catch {
      setBranchOptions([])
      setIsSuperAdmin(false)
    } finally {
      setMetaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setFormKey((k) => k + 1)
    void loadMeta()
  }, [isOpen, loadMeta])

  const handleCreate = async (data: DailyReportFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/finances/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: data.branch_id || null,
          mobile_money_amount: data.mobile_money_amount || "0",
          cash_amount: data.cash_amount || "0",
          bank_account_amounts: data.bank_account_amounts,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to file daily report")

      toast({
        title: "Daily report filed",
        description: "Balances were recorded and bank accounts updated.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "")
      toast({
        title: "Failed to file daily report",
        description: formatError(message),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily report"
      className="z-[1000] w-[34rem]"
    >
      {metaLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DailyReportForm
          key={formKey}
          onSubmit={handleCreate}
          onCancel={onClose}
          loading={loading}
          showBranchPicker={isSuperAdmin && branchOptions.length > 0}
          branchOptions={branchOptions}
        />
      )}
    </ReeveModal>
  )
}
