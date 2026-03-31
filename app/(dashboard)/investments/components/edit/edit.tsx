"use client"

import { useEffect, useState } from "react"
import { SlideModal } from "@/components/modals/SlideModal"
import EditInvestmentForm, {
  EditInvestmentFormData,
  InvestmentFundingItem,
  InvestmentPartnerItem,
} from "../forms/edit"
import { useToast } from "@/components/ui/toast"

interface EditInvestmentProps {
  isOpen: boolean
  investmentId: string | null
  onClose: () => void
  onSuccess: () => void
}

const isPersistedId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""))

export default function EditInvestment({ isOpen, investmentId, onClose, onSuccess }: EditInvestmentProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<EditInvestmentFormData> | null>(null)

  useEffect(() => {
    if (!isOpen || !investmentId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchInvestment = async () => {
      try {
        setFetching(true)
        setFetchError(null)
        const res = await fetch(`/api/institution/investments/${investmentId}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load investment")
        const i = body?.investment || {}
        const partners = Array.isArray(body?.partners) ? body.partners : []
        const funding = Array.isArray(body?.funding) ? body.funding : []

        const periodInYears = i.period_in_years != null ? Number(i.period_in_years) : 0
        const periodInMonths = i.period_in_months != null ? Number(i.period_in_months) : 0

        setInitialValues({
          clientId: String(i.provider_id || ""),
          clientName: String(i.provider_name || ""),
          investmentType: String(i.category || ""),
          investmentName: String(i.investment_name || ""),
          investmentAddress: String(i.investment_address || ""),
          riskLevel: String(i.risk_level || "").replace(/\b\w/g, (c) => c.toUpperCase()),
          expectedPercentagePerAnnum: Number(i.expected_percentage || 0),
          principalAmount: Number(i.initial_amount || 0),
          expectedReturns: Number(i.expected_returns || 0),
          periodUnit: periodInYears > 0 ? "years" : "months",
          periodValue: periodInYears > 0 ? periodInYears : periodInMonths,
          startDate: String(i.start_date || ""),
          maturityDate: String(i.maturity_date || ""),
          status: String(i.status || "Pending").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: String(i.description || ""),
          partners: partners.map((p: any) => ({
            id: String(p.id),
            counterpartyId: String(p.counterparty_id || ""),
            role: (String(p.role || "") as InvestmentPartnerItem["role"]) || "",
            contributionPercentage: Number(p.contribution_percentage || 0),
            contributionAmount: Number(p.contribution_amount || 0),
            ownershipPercentage: Number(p.ownership_percentage || 0),
            status: String(p.status || "Active").toLowerCase() === "inactive" ? "Inactive" : "Active",
          })),
          funding: funding.map((f: any) => ({
            id: String(f.id),
            type: String(f.source_type || "savings") as InvestmentFundingItem["type"],
            amount: Number(f.amount || 0),
            loanId: f.loan_id ? String(f.loan_id) : undefined,
          })),
        })
      } catch (e: any) {
        const msg = e?.message || "Failed to load investment"
        setFetchError(msg)
        toast({ variant: "destructive", title: "Failed to load investment", description: msg })
      } finally {
        setFetching(false)
      }
    }

    void fetchInvestment()
  }, [isOpen, investmentId, toast])

  const handleSubmit = async (data: EditInvestmentFormData) => {
    if (!investmentId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/institution/investments/${investmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: data.clientId || null,
          investmentType: data.investmentType,
          investmentName: data.investmentName,
          investmentAddress: data.investmentAddress,
          riskLevel: data.riskLevel,
          expectedPercentagePerAnnum: data.expectedPercentagePerAnnum,
          principalAmount: data.principalAmount,
          expectedReturns: data.expectedReturns,
          period_in_months: data.periodUnit === "months" ? data.periodValue : null,
          period_in_years: data.periodUnit === "years" ? data.periodValue : null,
          startDate: data.startDate,
          maturityDate: data.maturityDate,
          status: data.status,
          description: data.description,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Failed to update investment")
      toast({ variant: "success", title: "Investment updated" })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to update investment",
        description: e?.message || "Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }

  const savePartnerRow = async (row: InvestmentPartnerItem): Promise<{ id?: string } | void> => {
    if (!investmentId) return
    const persisted = isPersistedId(row.id)
    const url = persisted
      ? `/api/institution/investments/${investmentId}/partners/${row.id}`
      : `/api/institution/investments/${investmentId}/partners`
    const method = persisted ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counterpartyId: row.counterpartyId,
        role: row.role || null,
        status: row.status,
        contributionPercentage: row.contributionPercentage,
        contributionAmount: row.contributionAmount,
        ownershipPercentage: row.ownershipPercentage,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || "Failed to save partner")
    toast({ variant: "success", title: persisted ? "Partner updated" : "Partner added" })
    onSuccess()
    return persisted ? undefined : { id: String(body?.id || "") }
  }

  const deletePartnerRow = async (rowId: string) => {
    if (!investmentId) return
    if (!isPersistedId(rowId)) return
    const res = await fetch(`/api/institution/investments/${investmentId}/partners/${rowId}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || "Failed to delete partner")
    }
    toast({ variant: "success", title: "Partner removed" })
    onSuccess()
  }

  const saveFundingRow = async (row: InvestmentFundingItem): Promise<{ id?: string } | void> => {
    if (!investmentId) return
    const persisted = isPersistedId(row.id)
    const url = persisted
      ? `/api/institution/investments/${investmentId}/funding/${row.id}`
      : `/api/institution/investments/${investmentId}/funding`
    const method = persisted ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: row.type,
        amount: row.amount,
        loanId: row.loanId || null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || "Failed to save funding")
    toast({ variant: "success", title: persisted ? "Funding updated" : "Funding added" })
    onSuccess()
    return persisted ? undefined : { id: String(body?.id || "") }
  }

  const deleteFundingRow = async (rowId: string) => {
    if (!investmentId) return
    if (!isPersistedId(rowId)) return
    const res = await fetch(`/api/institution/investments/${investmentId}/funding/${rowId}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || "Failed to delete funding")
    }
    toast({ variant: "success", title: "Funding removed" })
    onSuccess()
  }

  return (
    <SlideModal isOpen={isOpen} onClose={onClose} title="Edit Investment" className="z-20">
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <EditInvestmentForm
          key={investmentId}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onClose={onClose}
          loading={loading}
          onSavePartnerRow={savePartnerRow}
          onDeletePartnerRow={deletePartnerRow}
          onSaveFundingRow={saveFundingRow}
          onDeleteFundingRow={deleteFundingRow}
        />
      ) : fetchError ? (
        <div className="text-center py-12 text-sm text-red-600">{fetchError}</div>
      ) : null}
    </SlideModal>
  )
}
