"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ComponentType } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import type { FilterField } from "@/components/datatables/TableFilter"
import { useStaffSession } from "@/components/staff-session-provider"
import { cn } from "@/lib/utils"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import {
  readClientTerminology,
  readInstitutionConfigModuleEnabled,
  readInstitutionCurrency,
} from "@/lib/institution-branch-config"
import AddSharesModal from "../../components/shares/add"
import EditSharesModal from "../../components/shares/edit"
import SharesCalculatorModal from "../../components/shares/calculator"
import {
  ArrowLeft,
  Calendar,
  Calculator,
  Coins,
  ExternalLink,
  Info,
  Layers,
  Pencil,
  Plus,
  ShieldAlert,
  TrendingUp,
  Wallet,
  CheckCircle2,
} from "lucide-react"

type MemberSummary = {
  id: string
  fullName: string
  clientNumber: string
  status: string
  numberOfShares: number
  shareValue: number
  totalShareValue: number
  joinDate: string | null
}

export type ShareTransaction = {
  id: string
  transaction_id: string | null
  acquisition_type?: "purchase" | "transfer_in" | "transfer_out" | "redemption" | string | null
  transfer_type?: "from" | "to" | string | null
  transfer_member_id?: string | null
  transfer_member_name?: string | null
  transfer_member_number?: string | null
  number_of_shares: number
  share_value: number
  total_value: number
  remaining_shares: number
  date: string | null
  created_at: string
  transaction_number?: string | null
  mode?: string | null
  reference_number?: string | null
  description?: string | null
  status?: string | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function StatCard({
  label,
  value,
  subLabel,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  subLabel?: string
  icon: ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</p>
          {subLabel ? <p className="mt-0.5 text-xs text-muted-foreground">{subLabel}</p> : null}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export default function MemberSharesPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { session } = useStaffSession()

  const [member, setMember] = useState<MemberSummary | null>(null)
  const [shares, setShares] = useState<ShareTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [sharesLoading, setSharesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [canEditShares, setCanEditShares] = useState(false)
  const [cfgMinShares, setCfgMinShares] = useState<number | undefined>(undefined)
  const [cfgMaxShares, setCfgMaxShares] = useState<number | undefined>(undefined)
  const [cfgShareValue, setCfgShareValue] = useState<number | undefined>(undefined)

  const [showBuyModal, setShowBuyModal] = useState(false)
  const [showCalculatorModal, setShowCalculatorModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedShareForEdit, setSelectedShareForEdit] = useState<ShareTransaction | null>(null)

  // DataTable pagination & filters
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dateFilter, setDateFilter] = useState<{ start?: string; end?: string } | null>(null)

  const currency = readInstitutionCurrency(session?.institution?.config)
  const formatMoney = useCallback((amount: number) => fmtCurrency(amount, currency), [currency])
  const clientTerm = readClientTerminology(session?.institution?.config, "Member")
  const hasSharesFeature = readInstitutionConfigModuleEnabled(session?.institution?.config, "shares")

  // Load Permissions
  useEffect(() => {
    let cancelled = false
    async function loadPermissions() {
      try {
        const res = await fetch(`/api/institution/members/permissions`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { permissions?: { editShares?: boolean } }
        if (!cancelled) {
          setCanEditShares(Boolean(data.permissions?.editShares))
        }
      } catch {
        // Best-effort
      }
    }
    void loadPermissions()
    return () => {
      cancelled = true
    }
  }, [])

  // Load Branch Share Configuration
  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      try {
        const res = await fetch(`/api/institution/settings`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          config?: {
            minimumShares?: number | null
            maximumShares?: number | null
            shareValue?: number | null
          }
        }
        if (!cancelled && data.config) {
          if (data.config.minimumShares != null) setCfgMinShares(Number(data.config.minimumShares))
          if (data.config.maximumShares != null) setCfgMaxShares(Number(data.config.maximumShares))
          if (data.config.shareValue != null) setCfgShareValue(Number(data.config.shareValue))
        }
      } catch {
        // Best-effort
      }
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [])

  // Load Member and Shares Data
  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const [memberRes, sharesRes] = await Promise.all([
        fetch(`/api/institution/members/${userId}`, { cache: "no-store" }),
        fetch(`/api/institution/members/${userId}/shares`, { cache: "no-store" }),
      ])

      const memberData = await memberRes.json().catch(() => ({}))
      const sharesData = await sharesRes.json().catch(() => ({}))

      if (!memberRes.ok || !memberData?.member) {
        setMember(null)
        setShares([])
        setError(memberData?.error || "Member not found")
        return
      }

      const row = memberData.member
      setMember({
        id: String(row.id),
        fullName: String(row.full_name || ""),
        clientNumber: String(row.member_number || ""),
        status: String(row.status || "Active"),
        numberOfShares: Number(row.number_of_shares || 0),
        shareValue: Number(row.share_value || 0),
        totalShareValue: Number(row.total_share_value || 0),
        joinDate: row.join_date ? String(row.join_date) : null,
      })

      const rawShares: any[] = Array.isArray(sharesData.shares) ? sharesData.shares : []
      setShares(
        rawShares.map((s) => ({
          id: String(s.id),
          transaction_id: s.transaction_id ? String(s.transaction_id) : null,
          acquisition_type: s.acquisition_type ? String(s.acquisition_type) : "purchase",
          transfer_type: s.transfer_type ? String(s.transfer_type) : null,
          transfer_member_id: s.transfer_member_id ? String(s.transfer_member_id) : null,
          transfer_member_name: s.transfer_member_name ? String(s.transfer_member_name) : null,
          transfer_member_number: s.transfer_member_number ? String(s.transfer_member_number) : null,
          number_of_shares: Number(s.number_of_shares || 0),
          share_value: Number(s.share_value || 0),
          total_value: Number(s.total_value || (Number(s.number_of_shares || 0) * Number(s.share_value || 0))),
          remaining_shares: Number(s.remaining_shares || 0),
          date: s.date ? String(s.date) : null,
          created_at: String(s.created_at || ""),
          transaction_number: s.transaction_number ? String(s.transaction_number) : null,
          mode: s.mode ? String(s.mode) : null,
          reference_number: s.reference_number ? String(s.reference_number) : null,
          description: s.description ? String(s.description) : null,
          status: s.status ? String(s.status) : "active",
        }))
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load shares")
      setMember(null)
      setShares([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Filtered share rows based on table filter
  const filteredShares = useMemo(() => {
    if (!dateFilter?.start && !dateFilter?.end) return shares

    return shares.filter((s) => {
      const targetDate = s.date || s.created_at
      if (!targetDate) return true
      const d = new Date(targetDate).getTime()
      if (dateFilter.start && d < new Date(dateFilter.start).getTime()) return false
      if (dateFilter.end) {
        const endOfDay = new Date(dateFilter.end)
        endOfDay.setHours(23, 59, 59, 999)
        if (d > endOfDay.getTime()) return false
      }
      return true
    })
  }, [shares, dateFilter])

  const paginatedShares = useMemo(() => {
    const start = page * rowsPerPage
    return filteredShares.slice(start, start + rowsPerPage)
  }, [filteredShares, page, rowsPerPage])

  // Calculate cumulative stats
  const summary = useMemo(() => {
    const totalShares = shares.length > 0 && shares[0].remaining_shares > 0
      ? shares[0].remaining_shares
      : shares.reduce((acc, s) => acc + s.number_of_shares, 0)
    const totalValue = shares.reduce((acc, s) => acc + s.total_value, 0)
    const latestPurchase = shares.length > 0 ? (shares[0].date || shares[0].created_at) : null
    const effectiveShareValue = cfgShareValue ?? (member?.shareValue || (shares.length > 0 ? shares[0].share_value : 0))

    return {
      totalShares: totalShares || (member?.numberOfShares || 0),
      totalValue: totalValue || (member?.totalShareValue || 0),
      shareValue: effectiveShareValue,
      purchaseCount: shares.length,
      latestPurchase,
      minShares: cfgMinShares,
      maxShares: cfgMaxShares,
    }
  }, [shares, member, cfgShareValue, cfgMinShares, cfgMaxShares])

  // Table Columns Definition
  const columns = useMemo((): DataTableColumn<ShareTransaction>[] => {
    return [
      {
        key: "date",
        header: "Date",
        render: (row) => (
          <span className="whitespace-nowrap font-medium text-foreground">
            {formatDate(row.date || row.created_at)}
          </span>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => {
          const acq = String(row.acquisition_type || "purchase").toLowerCase()
          const label =
            acq === "purchase"
              ? "Purchase"
              : acq === "transfer_in"
                ? "Transfer In"
                : acq === "transfer_out"
                  ? "Transfer Out"
                  : acq === "redemption"
                    ? "Redemption"
                    : acq
          const badgeClass =
            acq === "purchase"
              ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300"
              : acq === "transfer_in"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                : acq === "transfer_out"
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
          return (
            <div className="space-y-0.5">
              <Badge variant="outline" className={cn("text-xs font-semibold", badgeClass)}>
                {label}
              </Badge>
              {row.transfer_member_name ? (
                <p className="text-[10px] text-muted-foreground">
                  {row.transfer_type === "from" ? "From: " : "To: "}
                  {row.transfer_member_name} ({row.transfer_member_number || "—"})
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        key: "reference",
        header: "Transaction Ref",
        render: (row) => (
          <div className="space-y-0.5">
            <span className="font-mono text-xs font-semibold text-foreground">
              {row.transaction_number || (row.transaction_id ? row.transaction_id.slice(0, 8).toUpperCase() : "—")}
            </span>
            {row.reference_number ? (
              <p className="text-[11px] text-muted-foreground">Ext: {row.reference_number}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "shares",
        header: "Shares",
        render: (row) => {
          const isDebit = row.acquisition_type === "transfer_out" || row.acquisition_type === "redemption"
          return (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                isDebit
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
              )}
            >
              <TrendingUp className={cn("h-3.5 w-3.5", isDebit && "rotate-180")} />
              {isDebit ? "-" : "+"}{row.number_of_shares} {row.number_of_shares === 1 ? "share" : "shares"}
            </div>
          )
        },
      },
      {
        key: "unitPrice",
        header: "Price / Share",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatMoney(row.share_value)}
          </span>
        ),
      },
      {
        key: "total",
        header: "Total Value",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <span className="whitespace-nowrap font-semibold text-orange-600 dark:text-orange-400">
            {formatMoney(row.total_value)}
          </span>
        ),
      },
      {
        key: "remaining_shares",
        header: "Cumulative Holding",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <span className="font-mono text-xs font-semibold text-foreground">
            {row.remaining_shares.toLocaleString()} shares
          </span>
        ),
      },
      {
        key: "mode",
        header: "Mode",
        render: (row) => (
          <Badge variant="outline" className="text-xs font-normal">
            {row.mode || "Cash"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <div className="flex justify-center">
            <ActionButtons
              actions={[
                {
                  icon: <Pencil className="h-4 w-4" />,
                  label: "Edit share record",
                  variant: "primary",
                  disabled: !canEditShares || member?.status !== "Active",
                  disabledTooltip:
                    member?.status !== "Active"
                      ? `${clientTerm} must be Active to edit shares`
                      : !canEditShares
                        ? "You do not have permission to edit shares"
                        : undefined,
                  onClick: (r) => {
                    setSelectedShareForEdit(r)
                    setShowEditModal(true)
                  },
                },
              ]}
              row={row}
            />
          </div>
        ),
      },
    ]
  }, [formatMoney, canEditShares, member?.status, clientTerm])

  const filterFields = useMemo((): FilterField[] => {
    return [
      {
        field: "date",
        label: "Purchase date range",
        type: "date-range",
      },
    ]
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    const raw = params as Record<string, any>
    setPage(0)
    if (raw?.date && typeof raw.date === "object") {
      setDateFilter(raw.date)
    } else {
      setDateFilter(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse space-y-6">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl border bg-muted/40" />
          ))}
        </div>
        <div className="h-64 rounded-xl border bg-muted/40" />
      </div>
    )
  }

  if (!member) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <h1 className="text-2xl font-bold">{clientTerm} not found</h1>
        <p className="text-muted-foreground">
          The requested {clientTerm.toLowerCase()} could not be found or you may not have access.
        </p>
        <Link href="/members">
          <Button className="mt-2">Back to {clientTerm}s</Button>
        </Link>
      </div>
    )
  }

  const canBuyShares = Boolean(hasSharesFeature && canEditShares)
  const isMemberActive = member.status === "Active"

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back Link */}
      <Link
        href={`/members/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-orange-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-14 bg-linear-to-r from-orange-500/20 via-orange-500/10 to-transparent" />
        <div className="px-6 pb-5 -mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/50">
                  <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Shares Portfolio</h1>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{member.fullName}</span>
                <span>·</span>
                <span>{member.clientNumber}</span>
                <span>·</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    member.status === "Active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-border bg-muted text-muted-foreground"
                  )}
                >
                  {member.status}
                </Badge>
              </p>
            </div>

            {/* Header Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCalculatorModal(true)}
              >
                <Calculator className="mr-2 h-4 w-4" />
                Calculator
              </Button>

              {canBuyShares && (
                <Button
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => setShowBuyModal(true)}
                  disabled={!isMemberActive}
                  title={!isMemberActive ? "Member must be Active to purchase shares" : undefined}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Buy Shares
                </Button>
              )}

              <Link href={`/members/${userId}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View profile
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Inactive Member Notice */}
      {!isMemberActive && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <p>
            This {clientTerm.toLowerCase()} is currently <strong>{member.status}</strong>. New share purchases can only be recorded for active members.
          </p>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Shares"
          value={`${summary.totalShares} ${summary.totalShares === 1 ? "Share" : "Shares"}`}
          subLabel={summary.minShares ? `Min requirement: ${summary.minShares}` : undefined}
          icon={TrendingUp}
          accent="bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
        />
        <StatCard
          label="Portfolio Value"
          value={formatMoney(summary.totalValue)}
          subLabel="Total equity holding"
          icon={Wallet}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
        />
        <StatCard
          label="Value per Share"
          value={formatMoney(summary.shareValue)}
          subLabel="Current nominal rate"
          icon={Coins}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
        />
        <StatCard
          label="Purchases Recorded"
          value={`${summary.purchaseCount} ${summary.purchaseCount === 1 ? "Record" : "Records"}`}
          subLabel={summary.latestPurchase ? `Latest: ${formatDate(summary.latestPurchase)}` : "No purchases yet"}
          icon={Calendar}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
        />
      </div>

      {/* Shareholding Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-orange-600" />
              <CardTitle className="text-base">Share Ownership & Rights</CardTitle>
            </div>
            {summary.minShares && summary.totalShares >= summary.minShares ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Min. Holding Met
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Shares represent permanent ownership capital in the institution, providing dividend eligibility and full member voting participation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Minimum Requirement</p>
              <p className="mt-1 text-base font-semibold">
                {summary.minShares ? `${summary.minShares} Shares (${formatMoney(summary.minShares * summary.shareValue)})` : "None"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Maximum Holding Limit</p>
              <p className="mt-1 text-base font-semibold">
                {summary.maxShares ? `${summary.maxShares} Shares (${formatMoney(summary.maxShares * summary.shareValue)})` : "Unlimited"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Member Share Ratio</p>
              <p className="mt-1 text-base font-semibold">
                {summary.totalShares > 0 ? "Active Shareholder" : "No Shares Held"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Share Transactions DataTable */}
      <DataTable<ShareTransaction>
        columns={columns}
        rows={paginatedShares}
        loading={sharesLoading}
        title={`Share Purchase History (${filteredShares.length})`}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage={`No share purchases recorded for this ${clientTerm.toLowerCase()}.`}
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: filteredShares.length,
          onPageChange: (_e, newPage) => setPage(newPage),
          onRowsPerPageChange: (e: ChangeEvent<HTMLInputElement>) => {
            setRowsPerPage(parseInt(e.target.value, 10))
            setPage(0)
          },
          rowsPerPageOptions: [10, 25, 50],
        }}
      />

      {/* Modals */}
      {showBuyModal && (
        <AddSharesModal
          isOpen={showBuyModal}
          onClose={() => setShowBuyModal(false)}
          memberId={member.id}
          currency={currency}
          shareValue={summary.shareValue}
          currentShares={member.numberOfShares}
          currentTotalValue={member.totalShareValue}
          minShares={summary.minShares}
          maxShares={summary.maxShares}
          onSuccess={() => {
            setShowBuyModal(false)
            void loadData()
          }}
        />
      )}

      {showCalculatorModal && (
        <SharesCalculatorModal
          isOpen={showCalculatorModal}
          onClose={() => setShowCalculatorModal(false)}
          shareValue={summary.shareValue}
          currency={currency}
          onBuyShares={
            canBuyShares && isMemberActive
              ? () => {
                  setShowCalculatorModal(false)
                  setShowBuyModal(true)
                }
              : undefined
          }
        />
      )}

      {showEditModal && selectedShareForEdit && (
        <EditSharesModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setSelectedShareForEdit(null)
          }}
          share={selectedShareForEdit}
          memberId={member.id}
          currency={currency}
          shareValue={summary.shareValue}
          currentShares={member.numberOfShares}
          currentTotalValue={member.totalShareValue}
          minShares={summary.minShares}
          maxShares={summary.maxShares}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedShareForEdit(null)
            void loadData()
          }}
        />
      )}
    </div>
  )
}
