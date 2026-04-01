"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Banknote, Calendar, CheckCircle2, DollarSign, Edit, FileText, Percent, Pencil, Trash2, Users, X, Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { ActionSelect, SelectOption } from "@/components/datatables/actions"
import { useToast } from "@/components/ui/toast"
import AddPartner from "../components/partners/add"
import RecordCashflow from "../components/cashFlows/add"
import EditPartner from "../components/partners/edit"
import type { PartnerFormRow } from "../components/forms/partnersForm"
import { MdFormatListBulletedAdd } from "react-icons/md"
import AddFunding from "../components/funding/add"
import EditFunding from "../components/funding/edit"
import type { FundingFormRow } from "../components/forms/fundingForm"
import InvestmentCashflowExpandableContent from "../components/InvestmentCashflowExpandableContent"

type InvestmentDetails = {
  id: string
  investment_number: string
  provider_name: string
  category: string
  description: string | null
  initial_amount: number
  current_value: number
  expected_percentage: number
  expected_returns: number
  risk_level: string
  start_date: string
  maturity_date: string | null
  status: string
  investment_name: string | null
  investment_address: string | null
}

type FundingRow = { id: string; source_type: string; loan_id?: string | null; amount: number }
type PartnerRow = {
  id: string
  counterparty_name: string
  counterparty_id?: string | null
  role: string | null
  status: string
  contribution_percentage: number
  contribution_amount: number
  ownership_percentage: number
}
type CashflowRow = {
  id: string
  type: "inflow" | "outflow"
  category: string
  amount: number
  description: string | null
  date: string | null
  created_at: string
  transaction_id: string | null
  report_id: string | null
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-UG") : "—")
const titleCase = (v: string) => String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

export default function InvestmentDetailsPage() {
  const params = useParams()
  const investmentId = String(params.id || "")
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [investment, setInvestment] = useState<InvestmentDetails | null>(null)
  const [funding, setFunding] = useState<FundingRow[]>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [cashflows, setCashflows] = useState<CashflowRow[]>([])
  const [addPartnerOpen, setAddPartnerOpen] = useState(false)
  const [addFundingOpen, setAddFundingOpen] = useState(false)
  const [editFundingOpen, setEditFundingOpen] = useState(false)
  const [selectedFunding, setSelectedFunding] = useState<FundingRow | null>(null)
  const [editPartnerOpen, setEditPartnerOpen] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null)
  const [expandedCashflowRowIds, setExpandedCashflowRowIds] = useState<Set<string | number>>(new Set())
  const [recordCashflowOpen, setRecordCashflowOpen] = useState(false)

  const load = async () => {
    if (!investmentId) return
    setLoading(true)
    try {
      const [detailRes, cashRes] = await Promise.all([
        fetch(`/api/institution/investments/${investmentId}`, { cache: "no-store" }),
        fetch(`/api/institution/investments/${investmentId}/cashflows`, { cache: "no-store" }),
      ])
      const detailBody = await detailRes.json().catch(() => ({}))
      if (!detailRes.ok) throw new Error(detailBody?.error || "Failed to load investment")
      const i = detailBody.investment || {}
      setInvestment({
        id: String(i.id || ""),
        investment_number: String(i.investment_number || ""),
        provider_name: String(i.provider_name || "—"),
        category: String(i.category || ""),
        description: i.description ? String(i.description) : null,
        initial_amount: Number(i.initial_amount || 0),
        current_value: Number(i.current_value || 0),
        expected_percentage: Number(i.expected_percentage || 0),
        expected_returns: Number(i.expected_returns || 0),
        risk_level: String(i.risk_level || ""),
        start_date: String(i.start_date || ""),
        maturity_date: i.maturity_date ? String(i.maturity_date) : null,
        status: String(i.status || "pending"),
        investment_name: i.investment_name ? String(i.investment_name) : null,
        investment_address: i.investment_address ? String(i.investment_address) : null,
      })
      setFunding(Array.isArray(detailBody.funding) ? detailBody.funding.map((f: any) => ({ ...f, amount: Number(f.amount || 0) })) : [])
      setPartners(
        Array.isArray(detailBody.partners)
          ? detailBody.partners.map((p: any) => ({
              ...p,
              counterparty_name: String(p.counterparty_name || "—"),
              counterparty_id: p.counterparty_id ? String(p.counterparty_id) : null,
              contribution_percentage: Number(p.contribution_percentage || 0),
              contribution_amount: Number(p.contribution_amount || 0),
              ownership_percentage: Number(p.ownership_percentage || 0),
            }))
          : [],
      )
      const cashBody = await cashRes.json().catch(() => ({}))
      setCashflows(
        Array.isArray(cashBody.items)
          ? cashBody.items.map((c: any) => ({
              id: String(c.id || ""),
              type: (String(c.type || "").toLowerCase() === "outflow" ? "outflow" : "inflow") as "inflow" | "outflow",
              category: String(c.category || ""),
              amount: Number(c.amount || 0),
              description: c.description != null ? String(c.description) : null,
              date: c.date != null ? String(c.date) : null,
              created_at: String(c.created_at || ""),
              transaction_id: c.transaction_id != null ? String(c.transaction_id) : null,
              report_id: c.report_id != null ? String(c.report_id) : null,
            }))
          : [],
      )
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to load details", description: e?.message || "Please try again." })
      setInvestment(null)
    } finally {
      setLoading(false)
    }
  }

  const refetchCashflows = async () => {
    if (!investmentId) return
    const cashRes = await fetch(`/api/institution/investments/${investmentId}/cashflows`, { cache: "no-store" })
    const cashBody = await cashRes.json().catch(() => ({}))
    if (!cashRes.ok) throw new Error(cashBody?.error || "Failed to load cashflows")
    setCashflows(
      Array.isArray(cashBody.items)
        ? cashBody.items.map((c: any) => ({
            id: String(c.id || ""),
            type: (String(c.type || "").toLowerCase() === "outflow" ? "outflow" : "inflow") as "inflow" | "outflow",
            category: String(c.category || ""),
            amount: Number(c.amount || 0),
            description: c.description != null ? String(c.description) : null,
            date: c.date != null ? String(c.date) : null,
            created_at: String(c.created_at || ""),
            transaction_id: c.transaction_id != null ? String(c.transaction_id) : null,
            report_id: c.report_id != null ? String(c.report_id) : null,
          }))
        : [],
    )
  }

  useEffect(() => {
    void load()
  }, [investmentId])

  const toggleCashflowRowExpand = (rowId: string | number) => {
    setExpandedCashflowRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const cashflowDisplayDate = (r: CashflowRow) => (r.date ? formatDate(r.date) : formatDate(r.created_at))

  const fundingColumns: DataTableColumn<FundingRow>[] = [
    { key: "source_type", header: "Type", render: (r) => String(r.source_type || "—").replace(/_/g, " ") },
    { key: "amount", header: "Amount", render: (r) => formatCurrency(r.amount) },
    { key: "loan_id", header: "Loan", render: (r) => r.loan_id || "—" },
  ]
  const partnerColumns: DataTableColumn<PartnerRow>[] = [
    { key: "counterparty_name", header: "Counterparty", render: (r) => r.counterparty_name || "—" },
    {
      key: "role",
      header: "Role",
      render: (r) => {
        const normalized = String(r.role || "").trim().toLowerCase()
        if (normalized === "lead_partner") return "Lead Partner"
        if (normalized === "co_investor") return "Co Invester"
        return "—"
      },
    },
    { key: "contribution_percentage", header: "Contribution %", render: (r) => `${r.contribution_percentage || 0}%` },
    { key: "contribution_amount", header: "Contribution Amount", render: (r) => formatCurrency(r.contribution_amount) },
    { key: "ownership_percentage", header: "Ownership %", render: (r) => `${r.ownership_percentage || 0}%` },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const normalized = String(r.status || "").trim().toLowerCase()
        const isActive = normalized === "active"
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isActive
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : "bg-rose-100 text-rose-700 border border-rose-200"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        )
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const currentStatus = String(row.status || "").trim().toLowerCase() === "active" ? "active" : "inactive"
        const actions: SelectOption[] = [
          {
            value: "edit",
            label: "Edit",
            icon: <Edit className="h-4 w-4" />,
            onClick: () => {
              setSelectedPartner(row)
              setEditPartnerOpen(true)
            },
          },
          {
            value: "delete",
            label: "Delete",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: async () => {
              const counterpartyName = row.counterparty_name || "Counterparty"
              const isPending = String(investment?.status || "").trim().toLowerCase() === "pending"
              if (!isPending) {
                toast({
                  variant: "destructive",
                  title: "Partner delete failed",
                  description: `${counterpartyName} failed to delete. Only pending investments allow partner deletion.`,
                })
                return
              }
              try {
                const res = await fetch(`/api/institution/investments/${investmentId}/partners/${row.id}`, { method: "DELETE" })
                const body = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(body?.error || "Failed to delete partner")
                setPartners((prev) => prev.filter((p) => p.id !== row.id))
                toast({ title: "Partner deleted", description: `${counterpartyName} deleted successfully.` })
              } catch (e: any) {
                toast({
                  variant: "destructive",
                  title: "Partner delete failed",
                  description: `${counterpartyName} failed to delete. ${e?.message || "Please try again."}`,
                })
              }
            },
          },
        ]
        const statusOptions: SelectOption[] =
          currentStatus === "active"
            ? [
                {
                  value: "inactive",
                  label: "Mark as Inactive",
                  icon: <X className="h-4 w-4" />,
                  color: "text-red-600",
                  onClick: async () => {
                    try {
                      const res = await fetch(`/api/institution/investments/${investmentId}/partners/${row.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Inactive" }),
                      })
                      const body = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(body?.error || "Failed to update partner status")
                      setPartners((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: "Inactive" } : p)))
                      toast({
                        title: "Partner status updated",
                        description: `${row.counterparty_name || "Counterparty"} marked as Inactive.`,
                      })
                    } catch (e: any) {
                      toast({
                        variant: "destructive",
                        title: "Failed to update partner status",
                        description: e?.message || "Please try again.",
                      })
                    }
                  },
                },
              ]
            : [
                {
                  value: "active",
                  label: "Mark as Active",
                  icon: <CheckCircle2 className="h-4 w-4" />,
                  color: "text-green-600",
                  onClick: async () => {
                    try {
                      const res = await fetch(`/api/institution/investments/${investmentId}/partners/${row.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Active" }),
                      })
                      const body = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(body?.error || "Failed to update partner status")
                      setPartners((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: "Active" } : p)))
                      toast({
                        title: "Partner status updated",
                        description: `${row.counterparty_name || "Counterparty"} marked as Active.`,
                      })
                    } catch (e: any) {
                      toast({
                        variant: "destructive",
                        title: "Failed to update partner status",
                        description: e?.message || "Please try again.",
                      })
                    }
                  },
                },
              ]
        return (
          <div className="flex justify-center">
            <ActionSelect row={row} actions={actions} statusOptions={statusOptions} />
          </div>
        )
      },
    },
  ]
  const cashflowColumns: DataTableColumn<CashflowRow>[] = [
    { key: "date", header: "Date", render: (r) => cashflowDisplayDate(r) },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            r.type === "inflow"
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-rose-100 text-rose-800 border border-rose-200"
          }`}
        >
          {titleCase(r.type)}
        </span>
      ),
    },
    { key: "category", header: "Category", render: (r) => titleCase(r.category) },
    { key: "amount", header: "Amount", render: (r) => formatCurrency(r.amount) },
    {
      key: "summary",
      header: "Summary",
      render: (r) => (
        <span className="max-w-[200px] truncate text-sm text-muted-foreground" title={r.description || undefined}>
          {r.description?.trim() || "—"}
        </span>
      ),
    },
  ]

  const totalInflows = useMemo(
    () => cashflows.filter((c) => c.type === "inflow").reduce((s, c) => s + Number(c.amount || 0), 0),
    [cashflows],
  )
  const totalOutflows = useMemo(
    () => cashflows.filter((c) => c.type === "outflow").reduce((s, c) => s + Number(c.amount || 0), 0),
    [cashflows],
  )
  const totalAdjustments = useMemo(
    () => cashflows
      .filter((c) => c.category === "adjustment")
      .reduce((s, c) => s + Number(c.amount || 0), 0),
    [cashflows],
  )
  const totalExpenses = useMemo(
    () => cashflows
      .filter((c) => c.category === "expense")
      .reduce((s, c) => s + Number(c.amount || 0), 0),
    [cashflows],
  )

  if (!investment && !loading) {
    return (
      <div className="max-w-6xl mx-auto py-10">
        <p className="text-sm text-muted-foreground">Investment not found.</p>
        <Link href="/investments">
          <Button className="mt-4">Back to Investments</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="relative max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/investments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Investments
        </Link>
        <Button type="button" variant="outline" onClick={() => toast({ title: "Monthly report", description: "Monthly report feature coming soon." })}>
          <FileText className="mr-2 h-4 w-4" />
          Monthly Report
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-20 bg-linear-to-r from-primary/15 via-primary/8 to-transparent" />
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row gap-5 -mt-8">
            <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-primary/10 shadow-sm flex items-center justify-center">
              <Banknote className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0 pt-1 sm:pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h1 className="text-2xl font-bold tracking-tight truncate">{investment?.investment_number || "Investment"}</h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium w-fit bg-amber-100 text-amber-700 border border-amber-200">
                  {titleCase(investment?.status || "pending")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                <span>{investment?.investment_name || titleCase(investment?.category || "—")}</span>
                <span className="hidden sm:inline text-border">|</span>
                <span>{investment?.provider_name || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={<Banknote className="h-4 w-4 text-blue-600" />} label="Principal" value={formatCurrency(Number(investment?.initial_amount || 0))} />
        <MetricCard icon={<DollarSign className="h-4 w-4 text-green-600" />} label="Current Value" value={formatCurrency(Number(investment?.current_value || 0))} />
        <MetricCard icon={<Calendar className="h-4 w-4 text-amber-600" />} label="Expected Returns" value={formatCurrency(Number(investment?.expected_returns || 0))} />
        <MetricCard icon={<Percent className="h-4 w-4 text-purple-600" />} label="Expected % P.A" value={`${Number(investment?.expected_percentage || 0).toFixed(2)}%`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Investment Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <SectionLabel>Investment Number</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{investment?.investment_number || "—"}</p>
              </div>
              <div>
                <SectionLabel>Provider</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{investment?.provider_name || "—"}</p>
              </div>
              <div>
                <SectionLabel>Investment Name</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{investment?.investment_name || "—"}</p>
              </div>
              <div>
                <SectionLabel>Investment Type</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{titleCase(investment?.category || "—")}</p>
              </div>
              <div>
                <SectionLabel>Risk Level</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{titleCase(investment?.risk_level || "—")}</p>
              </div>
              <div>
                <SectionLabel>Status</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{titleCase(investment?.status || "—")}</p>
              </div>
              <div>
                <SectionLabel>Start Date</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{formatDate(investment?.start_date)}</p>
              </div>
              <div>
                <SectionLabel>Maturity Date</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{formatDate(investment?.maturity_date)}</p>
              </div>
              <div className="col-span-2">
                <SectionLabel>Address</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{investment?.investment_address || "—"}</p>
              </div>
              <div className="col-span-2">
                <SectionLabel>Description</SectionLabel>
                <p className="text-sm font-medium mt-0.5">{investment?.description || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Funding
                </CardTitle>
                <CardDescription>Review and manage investment funding sources</CardDescription>
              </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddFundingOpen(true)}>
                  <MdFormatListBulletedAdd className="h-4 w-4" />
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            {funding.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
                No funding sources found.
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {funding.map((row) => (
                  <div
                    key={row.id}
                    className="group flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors border-gray-200 bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {titleCase(String(row.source_type || "—"))}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Amount: {formatCurrency(Number(row.amount || 0))}
                        {row.loan_id ? ` · Loan: ${row.loan_id}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedFunding(row)
                          setEditFundingOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const fundingType = titleCase(String(row.source_type || "Funding"))
                          try {
                            const res = await fetch(`/api/institution/investments/${investmentId}/funding/${row.id}`, {
                              method: "DELETE",
                            })
                            const body = await res.json().catch(() => ({}))
                            if (!res.ok) throw new Error(body?.error || "Failed to delete funding")
                            setFunding((prev) => prev.filter((f) => f.id !== row.id))
                            toast({ title: "Funding deleted", description: `${fundingType} funding deleted successfully.` })
                          } catch (e: any) {
                            toast({
                              variant: "destructive",
                              title: "Funding delete failed",
                              description: `${fundingType} funding failed to delete. ${e?.message || "Please try again."}`,
                            })
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {String(investment?.category || "").toLowerCase() === "partnership" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Partners
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddPartnerOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable columns={partnerColumns} rows={partners} loading={loading} title="Partners" emptyMessage="No partners found" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Investment Cashflows</CardTitle>
          <CardDescription>Cashflow summary and transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={<DollarSign className="h-4 w-4 text-green-600" />} label="Total Inflows" value={formatCurrency(totalInflows)} />
            <MetricCard icon={<DollarSign className="h-4 w-4 text-red-600" />} label="Total Outflows" value={formatCurrency(totalOutflows)} />
            <MetricCard icon={<DollarSign className="h-4 w-4 text-blue-600" />} label="Total Adjustments" value={formatCurrency(totalAdjustments)} />
            <MetricCard icon={<DollarSign className="h-4 w-4 text-amber-600" />} label="Total Expenses" value={formatCurrency(totalExpenses)} />
          </div>

          <DataTable
            columns={cashflowColumns}
            rows={cashflows}
            loading={loading}
            title="Cashflows"
            emptyMessage="No cashflows found"
            getRowId={(row) => row.id}
            renderDetail={(row) => (
              <InvestmentCashflowExpandableContent
                cashflow={row}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
                titleCase={titleCase}
              />
            )}
            expandedRowIds={expandedCashflowRowIds}
            onToggleExpand={toggleCashflowRowExpand}
            onRowClick={(row) => toggleCashflowRowExpand(row.id)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => setRecordCashflowOpen(true)}>
          <DollarSign className="h-4 w-4 mr-2" />
          Record Cashflow
        </Button>
      </div>

      <RecordCashflow
        isOpen={recordCashflowOpen}
        onClose={() => setRecordCashflowOpen(false)}
        investmentId={investmentId}
        onSuccess={refetchCashflows}
      />
      <AddPartner
        isOpen={addPartnerOpen}
        onClose={() => setAddPartnerOpen(false)}
        onSuccess={async (row: PartnerFormRow) => {
          const res = await fetch(`/api/institution/investments/${investmentId}/partners`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              counterpartyId: row.counterpartyId,
              role: row.role || null,
              status: row.status,
              contributionPercentage: Number(row.contributionPercentage || 0),
              contributionAmount: Number(row.contributionAmount || 0),
              ownershipPercentage: Number(row.ownershipPercentage || 0),
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            toast({
              variant: "destructive",
              title: "Failed to add partner",
              description: body?.error || "Please try again.",
            })
            throw new Error(body?.error || "Failed to add partner")
          }

          setPartners((prev) => [
            {
              id: String(body?.id || row.id),
              counterparty_id: row.counterpartyId,
              counterparty_name: row.counterpartyName || row.counterpartyId,
              role: row.role,
              status: row.status,
              contribution_percentage: Number(row.contributionPercentage || 0),
              contribution_amount: Number(row.contributionAmount || 0),
              ownership_percentage: Number(row.ownershipPercentage || 0),
            },
            ...prev,
          ])
          toast({
            title: "Partner added",
            description: `${row.counterpartyName || row.counterpartyId} added successfully.`,
          })
        }}
      />
      <EditPartner
        isOpen={editPartnerOpen}
        investmentId={investmentId}
        partner={selectedPartner}
        onClose={() => {
          setEditPartnerOpen(false)
          setSelectedPartner(null)
        }}
        onSuccess={(next) => {
          setPartners((prev) =>
            prev.map((p) =>
              p.id === next.id
                ? {
                    ...p,
                    counterparty_id: next.counterparty_id || null,
                    counterparty_name: next.counterparty_name || p.counterparty_name,
                    role: next.role,
                    status: next.status,
                    contribution_percentage: Number(next.contribution_percentage || 0),
                    contribution_amount: Number(next.contribution_amount || 0),
                    ownership_percentage: Number(next.ownership_percentage || 0),
                  }
                : p,
            ),
          )
        }}
      />
      <AddFunding
        isOpen={addFundingOpen}
        onClose={() => setAddFundingOpen(false)}
        onSuccess={async (row: FundingFormRow) => {
          const res = await fetch(`/api/institution/investments/${investmentId}/funding`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: row.type,
              amount: Number(row.amount || 0),
              loanId: row.loanId || null,
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            toast({
              variant: "destructive",
              title: "Failed to add funding",
              description: body?.error || "Please try again.",
            })
            throw new Error(body?.error || "Failed to add funding")
          }

          setFunding((prev) => [
            {
              id: String(body?.id || row.id),
              source_type: row.type,
              amount: Number(row.amount || 0),
              loan_id: row.loanId || null,
            },
            ...prev,
          ])
          toast({ title: "Funding added", description: `${titleCase(row.type)} funding added successfully.` })
        }}
      />
      <EditFunding
        isOpen={editFundingOpen}
        investmentId={investmentId}
        funding={
          selectedFunding
            ? {
                id: selectedFunding.id,
                type: (String(selectedFunding.source_type || "savings") as FundingFormRow["type"]) || "savings",
                amount: Number(selectedFunding.amount || 0),
                loanId: selectedFunding.loan_id ? String(selectedFunding.loan_id) : "",
              }
            : null
        }
        onClose={() => {
          setEditFundingOpen(false)
          setSelectedFunding(null)
        }}
        onSuccess={(next) => {
          setFunding((prev) =>
            prev.map((f) =>
              f.id === next.id
                ? {
                    ...f,
                    source_type: next.type,
                    amount: Number(next.amount || 0),
                    loan_id: next.loanId || null,
                  }
                : f,
            ),
          )
        }}
      />
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-muted">{icon}</div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
