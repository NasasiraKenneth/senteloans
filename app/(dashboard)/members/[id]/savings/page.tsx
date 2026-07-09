"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import type { FilterField } from "@/components/datatables/TableFilter"
import { useStaffSession } from "@/components/staff-session-provider"
import { cn } from "@/lib/utils"
import { formatCurrency as fmtCurrency } from "@/lib/format-currency"
import { readClientTerminology, readInstitutionCurrency } from "@/lib/institution-branch-config"
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  ExternalLink,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

type MemberSummary = {
  id: string
  fullName: string
  clientNumber: string
  monthlySavings: number
}

type SavingsAccount = {
  id: string
  accountNumber: string
  accountType: string
  availableBalance: number
  totalBalance: number
  status: string
  openDate: string | null
  lastTransactionDate: string | null
}

type SavingsTransaction = {
  id: string
  transactionNumber: string
  type: string
  amount: number
  mode: string
  date: string
  description: string
  accountNumber: string
  balanceAfter: number | null
}


const TX_KIND_OPTIONS = [
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "transfer", label: "Transfers" },
]

const TX_MODE_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
]

function appendQueryParams(params: URLSearchParams, queryParams?: Record<string, unknown>) {
  if (!queryParams) return
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
      const range = value as { start?: string; end?: string }
      if (key === "date") {
        if (range.start) params.set("date_from", range.start)
        if (range.end) params.set("date_to", range.end)
      }
      return
    }
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value))
    }
  })
}

function mapTransactionItems(items: Record<string, unknown>[]): SavingsTransaction[] {
  return items.map((t) => ({
    id: String(t.id),
    transactionNumber: String(t.transaction_number || t.id),
    type: String(t.type || ""),
    amount: Number(t.amount || 0),
    mode: String(t.mode || "—"),
    date: String(t.date || ""),
    description: String(t.description || ""),
    accountNumber: String(t.accountNumber || ""),
    balanceAfter: t.balance != null ? Number(t.balance) : null,
  }))
}

function normalizeTxKind(type: string): "deposit" | "withdrawal" | "transfer" | "other" {
  const value = type.toLowerCase()
  if (value.includes("deposit") || value === "opening balance") return "deposit"
  if (value === "transfer") return "transfer"
  if (value.includes("withdraw")) return "withdrawal"
  return "other"
}

function formatDate(value: string) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export default function UserSavingsPage() {
  const params = useParams()
  const userId = params.id as string
  const { session } = useStaffSession()

  const [member, setMember] = useState<MemberSummary | null>(null)
  const [accounts, setAccounts] = useState<SavingsAccount[]>([])
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txSummary, setTxSummary] = useState({
    totalDeposits: 0,
    totalWithdrawals: 0,
    monthlyNet: 0,
  })
  const [loading, setLoading] = useState(true)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txPage, setTxPage] = useState(0)
  const [txRowsPerPage, setTxRowsPerPage] = useState(10)
  const [activeTxQueryParams, setActiveTxQueryParams] = useState<Record<string, unknown>>({})
  const includeSummaryRef = useRef(true)

  const currency = readInstitutionCurrency(session?.institution?.config)
  const formatMoney = (amount: number) => fmtCurrency(amount, currency)
  const clientTerm = readClientTerminology(session?.institution?.config, "Member")

  const transactionColumns = useMemo((): DataTableColumn<SavingsTransaction>[] => {
    return [
      {
        key: "date",
        header: "Date",
        render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span>,
      },
      {
        key: "reference",
        header: "Reference",
        render: (row) => <span className="font-mono text-xs">{row.transactionNumber}</span>,
      },
      {
        key: "type",
        header: "Type",
        render: (row) => {
          const isDeposit = normalizeTxKind(row.type) === "deposit"
          return (
            <div className="flex items-center gap-2">
              {isDeposit ? (
                <ArrowUpRight className="h-4 w-4 text-accent" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-destructive" />
              )}
              <span>{row.type}</span>
            </div>
          )
        },
      },
      {
        key: "account",
        header: "Account",
        render: (row) => <span className="text-muted-foreground">{row.accountNumber || "—"}</span>,
      },
      {
        key: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        key: "amount",
        header: "Amount",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => {
          const isDeposit = normalizeTxKind(row.type) === "deposit"
          return (
            <span className={cn("font-medium whitespace-nowrap", isDeposit ? "text-accent" : "text-destructive")}>
              {isDeposit ? "+" : "−"}
              {formatMoney(row.amount)}
            </span>
          )
        },
      },
      {
        key: "balance",
        header: "Balance",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <span className="whitespace-nowrap">
            {row.balanceAfter != null ? formatMoney(row.balanceAfter) : "—"}
          </span>
        ),
      },
    ]
  }, [currency])

  const transactionFilterFields = useMemo((): FilterField[] => {
    return [
      {
        field: "tx_kind",
        label: "Type",
        type: "select",
        options: TX_KIND_OPTIONS,
      },
      {
        field: "mode",
        label: "Mode",
        type: "select",
        options: TX_MODE_OPTIONS,
      },
      {
        field: "date",
        label: "Transaction date range",
        type: "date-range",
      },
    ]
  }, [])

  const loadTransactions = useCallback(
    async (
      queryParams?: Record<string, unknown>,
      pageOverride?: number,
      rowsPerPageOverride?: number,
    ) => {
      setTransactionsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("member_id", userId)
        params.set("savings_only", "true")
        appendQueryParams(params, queryParams)

        if (includeSummaryRef.current) {
          params.set("include_summary", "true")
        }

        const requestPage = typeof pageOverride === "number" ? pageOverride : txPage
        const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : txRowsPerPage
        params.set("page", String(requestPage + 1))
        params.set("pageSize", String(requestRows))

        const res = await fetch(`/api/institution/transactions?${params.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load transactions")

        setTransactions(mapTransactionItems(Array.isArray(data.items) ? data.items : []))
        setTxTotal(Number(data.total || 0))
        if (data.summary) {
          setTxSummary({
            totalDeposits: Number(data.summary.totalDeposits || 0),
            totalWithdrawals: Number(data.summary.totalWithdrawals || 0),
            monthlyNet: Number(data.summary.monthlyNet || 0),
          })
          includeSummaryRef.current = false
        }
      } catch {
        setTransactions([])
        setTxTotal(0)
      } finally {
        setTransactionsLoading(false)
      }
    },
    [userId, txPage, txRowsPerPage],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      includeSummaryRef.current = true
      try {
        const [memberRes, savingsRes] = await Promise.all([
          fetch(`/api/institution/members/${userId}`, { cache: "no-store" }),
          fetch(`/api/institution/savings?client_id=${encodeURIComponent(userId)}&limit=100`, {
            cache: "no-store",
          }),
        ])

        const memberData = await memberRes.json().catch(() => ({}))
        const savingsData = await savingsRes.json().catch(() => ({}))

        if (cancelled) return

        if (!memberRes.ok || !memberData?.member) {
          setMember(null)
          setAccounts([])
          setTransactions([])
          setTxTotal(0)
          setError(memberData?.error || "Member not found")
          return
        }

        const row = memberData.member
        setMember({
          id: String(row.id),
          fullName: String(row.full_name || ""),
          clientNumber: String(row.member_number || ""),
          monthlySavings: Number(row.monthly_savings || 0),
        })

        const accountRows = (savingsRes.ok ? savingsData.items : []) || []
        setAccounts(
          accountRows.map((acc: Record<string, unknown>) => ({
            id: String(acc.id),
            accountNumber: String(acc.account_number || ""),
            accountType: String(acc.account_type || "Savings"),
            availableBalance: Number(acc.available_balance || 0),
            totalBalance: Number(acc.total_balance || 0),
            status: String(acc.status || "Active"),
            openDate: acc.open_date ? String(acc.open_date) : null,
            lastTransactionDate: acc.last_transaction_date ? String(acc.last_transaction_date) : null,
          })),
        )
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load savings")
          setMember(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleTxQueryParamsChange = useCallback(
    (params: object) => {
      setTxPage(0)
      const normalized = params as Record<string, unknown>
      setActiveTxQueryParams(normalized)
      void loadTransactions(normalized, 0, txRowsPerPage)
    },
    [loadTransactions, txRowsPerPage],
  )

  const handleTxPageChange = useCallback(
    (_: unknown, newPage: number) => {
      setTxPage(newPage)
      void loadTransactions(activeTxQueryParams, newPage, txRowsPerPage)
    },
    [activeTxQueryParams, loadTransactions, txRowsPerPage],
  )

  const handleTxRowsPerPageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const nextRowsPerPage = parseInt(e.target.value, 10)
      setTxRowsPerPage(nextRowsPerPage)
      setTxPage(0)
      void loadTransactions(activeTxQueryParams, 0, nextRowsPerPage)
    },
    [activeTxQueryParams, loadTransactions],
  )

  const summary = useMemo(() => {
    const totalAvailable = accounts.reduce((sum, acc) => sum + acc.availableBalance, 0)

    return {
      totalAvailable,
      totalDeposits: txSummary.totalDeposits,
      totalWithdrawals: txSummary.totalWithdrawals,
      monthlyNet: txSummary.monthlyNet,
      activeAccounts: accounts.filter((a) => a.status === "Active").length,
    }
  }, [accounts, txSummary])

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link
        href={`/members/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="h-14 bg-linear-to-r from-accent/20 via-accent/10 to-transparent" />
        <div className="px-6 pb-5 -mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <PiggyBank className="h-5 w-5 text-accent" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Savings</h1>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {member.fullName} · {member.clientNumber}
                {member.monthlySavings > 0 ? (
                  <span> · Agreed monthly savings {formatMoney(member.monthlySavings)}</span>
                ) : null}
              </p>
            </div>
            <Link href={`/members/${userId}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                View profile
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatMoney(summary.totalAvailable)}
          icon={Wallet}
          accent="bg-accent/10 text-accent"
        />
        <StatCard
          label="Total deposits"
          value={formatMoney(summary.totalDeposits)}
          icon={TrendingUp}
          accent="bg-accent/10 text-accent"
        />
        <StatCard
          label="Total withdrawals"
          value={formatMoney(summary.totalWithdrawals)}
          icon={TrendingDown}
          accent="bg-foreground/5 text-foreground"
        />
        <StatCard
          label="This month (net)"
          value={formatMoney(summary.monthlyNet)}
          icon={Calendar}
          accent={summary.monthlyNet >= 0 ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Savings accounts</CardTitle>
          <CardDescription>
            {summary.activeAccounts} active account{summary.activeAccounts === 1 ? "" : "s"} for this{" "}
            {clientTerm.toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-10 text-center">
              <PiggyBank className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium">No savings accounts</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Accounts are created automatically when a {clientTerm.toLowerCase()} is registered with the
                savings module enabled.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-accent/40 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{acc.accountType}</p>
                      <p className="truncate text-xs text-muted-foreground">{acc.accountNumber || "—"}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        acc.status === "Active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {acc.status}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Available
                      </p>
                      <p className="mt-0.5 font-bold text-accent">{formatMoney(acc.availableBalance)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Opened
                      </p>
                      <p className="mt-0.5 font-medium">{formatDate(acc.openDate || "")}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Link href={`/savings/${acc.id}`}>
                      <Button variant="outline" size="sm">
                        Manage account
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable<SavingsTransaction>
        columns={transactionColumns}
        rows={transactions}
        loading={transactionsLoading}
        title={`Transaction history (${txTotal})`}
        filterFields={transactionFilterFields}
        onQueryParamsChange={handleTxQueryParamsChange}
        emptyMessage={`No savings transactions for this ${clientTerm.toLowerCase()}.`}
        getRowId={(row) => row.id}
        pagination={{
          page: txPage,
          rowsPerPage: txRowsPerPage,
          total: txTotal,
          onPageChange: handleTxPageChange,
          onRowsPerPageChange: handleTxRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
      />
    </div>
  )
}
