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
import MoveSharesModal from "../../components/shares/moveShare"
import VoidSharesModal from "../../components/shares/void"
import SharesCalculatorModal from "../../components/shares/calculator"
import {
  ArrowLeft,
  ArrowRightLeft,
  Ban,
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
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showCalculatorModal, setShowCalculatorModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedShareForEdit, setSelectedShareForEdit] = useState<ShareTransaction | null>(null)
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [selectedShareForVoid, setSelectedShareForVoid] = useState<ShareTransaction | null>(null)

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

      const rawShares: any[] =
        sharesRes.ok && Array.isArray(sharesData?.shares) ? sharesData.shares : []
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
      if (!s.date) return false
      const d = new Date(s.date)
      if (dateFilter.start && d < new Date(dateFilter.start)) return false
      if (dateFilter.end && d > new Date(dateFilter.end)) return false
      return true
    })
  }, [shares, dateFilter])

  // Paginated share rows
  const paginatedShares = useMemo(() => {
    const start = page * rowsPerPage
    return filteredShares.slice(start, start + rowsPerPage)
  }, [filteredShares, page, rowsPerPage])

  // Calculate cumulative stats (excluding cancelled/voided shares)
  const summary = useMemo(() => {
    const activeShares = shares.filter((s) => s.status !== "cancelled")
    const totalShares =
      activeShares.length > 0 && activeShares[0].remaining_shares > 0
        ? activeShares[0].remaining_shares
        : activeShares.reduce((acc, s) => acc + s.number_of_shares, 0)
    const totalValue = activeShares.reduce((acc, s) => acc + s.total_value, 0)
    const latestPurchase =
      activeShares.length > 0 ? (activeShares[0].date || activeShares[0].created_at) : null
    const effectiveShareValue =
      cfgShareValue ??
      (member?.shareValue || (activeShares.length > 0 ? activeShares[0].share_value : 0))

    return {
      totalShares: totalShares || (member?.numberOfShares || 0),
      totalValue: totalValue || (member?.totalShareValue || 0),
      shareValue: effectiveShareValue,
      purchaseCount: activeShares.length,
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
        header: "Acquisition Type",
        render: (row) => {
          const acq = String(row.acquisition_type || "purchase").toLowerCase().trim()
          const isCancelled = row.status === "cancelled"
          const label =
            acq === "purchase"
              ? "Purchase"
              : acq === "transfer_in"
                ? "Transfer In"
                : acq === "transfer_out"
                  ? "Transfer Out"
                  : acq === "redemption"
                    ? "Redemption"
                    : acq === "sell" || acq === "buy_out"
                      ? "Sold (Buy-Out)"
                      : acq === "buy" || acq === "buy_off"
                        ? "Bought (Buy-Off)"
                        : acq

          const badgeClass = isCancelled
            ? "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400"
            : acq === "purchase"
              ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300"
              : acq === "transfer_in"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                : acq === "transfer_out"
                  ? "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300"
                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"

          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn("text-xs font-semibold", badgeClass)}>
                  {label}
                </Badge>
                {isCancelled && (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-[10px] font-bold"
                  >
                    Voided
                  </Badge>
                )}
              </div>
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
            <span
              className={cn(
                "font-mono text-xs font-semibold text-foreground",
                row.status === "cancelled" && "line-through opacity-60 text-muted-foreground",
              )}
            >
              {row.transaction_number || (row.transaction_id ? row.transaction_id.slice(0, 8).toUpperCase() : "—")}
            </span>
          </div>
        ),
      },
      {
        key: "shares",
        header: "Shares",
        render: (row) => {
          const isCancelled = row.status === "cancelled"
          const isDebit = row.acquisition_type === "transfer_out" || row.acquisition_type === "sell"
          return (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                isCancelled
                  ? "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500"
                  : isDebit
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
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
        render: (row) => {
          const isCancelled = row.status === "cancelled"
          return (
            <span
              className={cn(
                "whitespace-nowrap font-semibold",
                isCancelled
                  ? "line-through text-muted-foreground opacity-60"
                  : "text-orange-600 dark:text-orange-400",
              )}
            >
              {formatMoney(row.total_value)}
            </span>
          )
        },
      },
      {
        key: "remaining_shares",
        header: "Cumulative Holding",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <span
            className={cn(
              "font-mono text-xs font-semibold text-foreground",
              row.status === "cancelled" && "line-through opacity-60 text-muted-foreground",
            )}
          >
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
                  disabled: !canEditShares || member?.status !== "Active" || row.status === "cancelled",
                  disabledTooltip:
                    row.status === "cancelled"
                      ? "This share record has already been voided"
                      : member?.status !== "Active"
                        ? `${clientTerm} must be Active to edit shares`
                        : !canEditShares
                          ? "You do not have permission to edit shares"
                          : undefined,
                  onClick: (r) => {
                    setSelectedShareForEdit(r)
                    setShowEditModal(true)
                  },
                },
                {
                  icon: <Ban className="h-4 w-4" />,
                  label: "Void share record",
                  variant: "danger",
                  disabled: !canEditShares || member?.status !== "Active" || row.status === "cancelled",
                  disabledTooltip:
                    row.status === "cancelled"
                      ? "This share record has already been voided"
                      : member?.status !== "Active"
                        ? `${clientTerm} must be Active to void shares`
                        : !canEditShares
                          ? "You do not have permission to void shares"
                          : undefined,
                  onClick: (r) => {
                    setSelectedShareForVoid(r)
                    setShowVoidModal(true)
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
      setDateFilter({
        start: raw.date.start || undefined,
        end: raw.date.end || undefined,
      })
    } else {
      setDateFilter(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-base font-semibold">{error || "Member not found"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Could not load share records. Please verify the {clientTerm.toLowerCase()} exists and you have proper permissions.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    )
  }

  const isMemberActive = member.status === "Active"
  const canBuyShares = Boolean(hasSharesFeature && canEditShares)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => router.push(`/members/${member.id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {member.fullName}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  isMemberActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-400"
                )}
              >
                {member.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {clientTerm} No: <span className="font-mono font-medium text-foreground">{member.clientNumber}</span>
              {member.joinDate ? ` • Joined ${formatDate(member.joinDate)}` : ""}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCalculatorModal(true)}
            className="gap-1.5"
          >
            <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
            Share Calculator
          </Button>

          <div className="relative">
            <div className="flex items-center gap-2">
              {canBuyShares && (
                <Button
                  size="sm"
                  onClick={() => setShowBuyModal(true)}
                  disabled={!isMemberActive}
                  title={!isMemberActive ? "Member must be Active to purchase shares" : undefined}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Buy Shares
                </Button>
              )}

              {canBuyShares && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMoveModal(true)}
                  disabled={!isMemberActive || summary.totalShares <= 0}
                  title={
                    !isMemberActive
                      ? "Member must be Active to transfer or buy out shares"
                      : summary.totalShares <= 0
                        ? "Member has no shares to transfer or buy out"
                        : undefined
                  }
                  className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-900/50 dark:text-orange-400 dark:hover:bg-orange-950/30"
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transfer / Buy Out
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inactive Member Notice */}
      {!isMemberActive && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
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
          accent="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-400"
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
        title={`Share History (${filteredShares.length})`}
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
      {showBuyModal && member && (
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

      {showMoveModal && member && (
        <MoveSharesModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          memberId={member.id}
          memberFullName={member.fullName}
          currency={currency}
          shareValue={summary.shareValue}
          currentShares={summary.totalShares}
          currentTotalValue={summary.totalValue}
          minShares={summary.minShares}
          maxShares={summary.maxShares}
          onSuccess={() => {
            setShowMoveModal(false)
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

      {showVoidModal && selectedShareForVoid && (
        <VoidSharesModal
          isOpen={showVoidModal}
          onClose={() => {
            setShowVoidModal(false)
            setSelectedShareForVoid(null)
          }}
          share={selectedShareForVoid}
          memberId={member.id}
          memberFullName={member.fullName}
          currency={currency}
          onSuccess={() => {
            setShowVoidModal(false)
            setSelectedShareForVoid(null)
            void loadData()
          }}
        />
      )}
    </div>
  )
}
