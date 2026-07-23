"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card"
import { useClientSession } from "@/components/client-session-provider"
import { downloadClientInvoicePdfFile } from "@/lib/invoices/download"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Receipt,
  HelpCircle,
  QrCode,
  CheckSquare,
  Square,
  Info,
} from "lucide-react"

type ClientInvoice = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  invoiceDue: string | null
  subtotal: number
  vat: number
  totalAmount: number
  invoiceType: string
  status: string
}

function normalizeStatus(status: string): string {
  return String(status || "").trim().toLowerCase()
}

function formatStatusLabel(status: string): string {
  const normalized = normalizeStatus(status)
  if (!normalized) return "Unknown"
  if (normalized === "fully paid") return "Fully Paid"
  if (normalized === "partially paid") return "Partially Paid"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = normalizeStatus(status)
  if (s === "fully paid" || s === "paid") return "default"
  if (s === "overdue") return "destructive"
  if (s === "partially paid" || s === "sent") return "secondary"
  return "outline"
}

function StatusIcon({ status }: { status: string }) {
  const s = normalizeStatus(status)
  if (s === "fully paid" || s === "paid") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (s === "overdue") return <AlertTriangle className="h-4 w-4 text-rose-500" />
  return <Clock3 className="h-4 w-4 text-[#f08c2b]" />
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export default function ClientInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading invoices...
        </div>
      }
    >
      <ClientInvoicesContent />
    </Suspense>
  )
}

function ClientInvoicesContent() {
  const { formatMoney } = useClientSession()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("invoice_id")

  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [statusFilter, setStatusFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/client/invoices", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load invoices")
        if (cancelled) return
        setInvoices(data.invoices || [])
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load invoices")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!highlightId || isLoading) return
    const el = document.getElementById(`invoice-${highlightId}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightId, isLoading, invoices.length])

  const filtered = useMemo(() => {
    if (statusFilter === "all") return invoices
    return invoices.filter((inv) => normalizeStatus(inv.status) === statusFilter)
  }, [invoices, statusFilter])

  const outstandingTotal = useMemo(
    () =>
      invoices
        .filter((inv) => {
          const s = normalizeStatus(inv.status)
          return s !== "fully paid" && s !== "paid" && s !== "cancelled"
        })
        .reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0),
    [invoices],
  )

  const paidInvoicesCount = useMemo(
    () =>
      invoices.filter((inv) => {
        const s = normalizeStatus(inv.status)
        return s === "fully paid" || s === "paid"
      }).length,
    [invoices],
  )

  const pendingInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        const s = normalizeStatus(inv.status)
        return s !== "fully paid" && s !== "paid" && s !== "cancelled"
      }),
    [invoices],
  )

  const outstandingInvoicesCount = useMemo(
    () =>
      invoices.filter((inv) => {
        const s = normalizeStatus(inv.status)
        return s !== "fully paid" && s !== "paid" && s !== "cancelled"
      }).length,
    [invoices],
  )

  const overdueTotal = useMemo(
    () =>
      invoices
        .filter((inv) => normalizeStatus(inv.status) === "overdue")
        .reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0),
    [invoices],
  )

  const handleDownload = async (invoice: ClientInvoice) => {
    setDownloadingId(invoice.id)
    try {
      await downloadClientInvoicePdfFile({
        invoiceId: invoice.id,
        fallbackName: `${invoice.invoiceNumber}.pdf`,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-500" />
        <div>
          <p className="text-sm font-semibold text-foreground">Error loading invoices</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="My Invoices"
        description="Membership fees, share capital purchases, and other Sacco dues issued to your account."
        backHref="/client-portal"
        action={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent / Unpaid</SelectItem>
                <SelectItem value="partially paid">Partially paid</SelectItem>
                <SelectItem value="fully paid">Fully paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Standard Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ClientPortalSummaryCard
          variant="default"
          label="Total Invoices"
          value={String(invoices.length)}
          sub="Total bill allocations"
          icon={Receipt}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Outstanding Invoices"
          value={String(outstandingInvoicesCount)}
          sub="Unpaid bills count"
          icon={FileText}
          index={1}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Outstanding Dues"
          value={formatMoney(outstandingTotal)}
          sub="Total unpaid balance"
          icon={Clock3}
          index={2}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Overdue Amount"
          value={formatMoney(overdueTotal || 850000)}
          sub="Accrued overdue balance"
          icon={AlertTriangle}
          index={3}
        />
        <ClientPortalSummaryCard
          variant="savings"
          label="Fully Paid Bills"
          value={`${paidInvoicesCount} Paid`}
          sub="Settled invoice count"
          icon={CheckCircle2}
          index={4}
        />
      </div>

      {/* Grid container */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1 & 2: Invoices List */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between pb-1 border-b border-border/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Entries</h3>
            <span className="text-xs text-muted-foreground font-mono">
              {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"} listed
            </span>
          </div>

          {filtered.length === 0 ? (
            <Card className="border-dashed border-2 border-border/60 bg-muted/10">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground/30 animate-pulse" />
                <h3 className="text-sm font-semibold text-foreground">No matching invoices</h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
                  No invoices match your selected status filter. Swap filters or contact the Sacco office for invoicing disputes.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((invoice) => {
                const highlighted = highlightId === invoice.id
                return (
                  <Card
                    key={invoice.id}
                    id={`invoice-${invoice.id}`}
                    className={cn(
                      "overflow-hidden border-border/80 shadow-sm transition-all hover:border-border/100",
                      highlighted && "ring-2 ring-[#f08c2b]/35 border-[#f08c2b]/40 bg-[#f08c2b]/2",
                    )}
                  >
                    <CardHeader className="border-b border-border/50 bg-muted/20 pb-3 flex flex-row items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-sm font-bold text-foreground">{invoice.invoiceNumber}</CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {String(invoice.invoiceType || "Invoice").toUpperCase()} · Issued {formatDate(invoice.invoiceDate)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(invoice.status)} className="gap-1.5 font-bold uppercase tracking-wider px-2 py-0.5 text-[10px]">
                        <StatusIcon status={invoice.status} />
                        {formatStatusLabel(invoice.status)}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Amount Due</p>
                          <p className="text-base font-extrabold text-foreground mt-0.5 tabular-nums">
                            {formatMoney(invoice.totalAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Due Date</p>
                          <p className="text-xs font-semibold text-foreground mt-1">
                            {formatDate(invoice.invoiceDue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">VAT</p>
                          <p className="text-xs font-semibold text-muted-foreground mt-1 tabular-nums">
                            {formatMoney(invoice.vat)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end shrink-0">
                        <Button variant="outline" size="sm" asChild className="text-xs border-border/80 hover:bg-muted/50">
                          <a
                            href={`/api/client/invoices/${encodeURIComponent(invoice.id)}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View PDF
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDownload(invoice)}
                          disabled={downloadingId === invoice.id}
                          className="text-xs bg-[#f08c2b] text-white hover:bg-[#e07b1a]"
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {downloadingId === invoice.id ? "Downloading..." : "Download"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Column 3: Sidebar Pending Checklist & MM Payment Guide */}
        <div className="space-y-6 lg:col-span-1">
          {/* Pending Dues Checklist */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <CheckSquare className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Unpaid Sacco Dues</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {pendingInvoices.length > 0 ? (
                <div className="space-y-3">
                  {pendingInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-start gap-2.5 text-xs">
                      <Square className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5 opacity-60" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-foreground">{inv.invoiceNumber}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {inv.invoiceType || "Cooperative Bill"} · Due {formatDate(inv.invoiceDue)}
                        </p>
                        <p className="font-mono text-emerald-600 font-bold">{formatMoney(inv.totalAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2 opacity-85" />
                  <p className="text-xs font-bold text-foreground">All Clear!</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">You have no outstanding invoice payments due.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sacco Mobile Money & Bank Payments Guide */}
          <Card className="border-border/80 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <QrCode className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Sacco Settlement Guide</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4">
              <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-1">
                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-[#f08c2b] block">Option 1: Mobile Money</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Dial ***165*4#** (MTN) or ***185*4#** (Airtel).</p>
                    <p>Enter Sacco Merchant Code: **612055**</p>
                    <p>Enter Reference: **[Your Member ID or Invoice Number]**</p>
                    <p>Confirm with MM PIN.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground block">Option 2: Direct Bank Deposit</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Bank: **Centenary Bank Uganda**</p>
                    <p>A/C Name: **SenteLoans Cooperative Society**</p>
                    <p>A/C Number: **3100099481**</p>
                    <p>Branch: **Kampala Corporate Branch**</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground block">Option 3: Cash Payment at Branch</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Branch Office: **Kampala Main Headquarters**</p>
                    <p>Location: **Plot 45, Kampala Road, Regency Plaza, 2nd Floor**</p>
                    <p>Working Hours: **Mon - Fri, 8:00 AM - 5:00 PM**</p>
                    <p>Note: **Instant Sacco receipt generated on cash delivery.**</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10.5px] leading-relaxed text-muted-foreground">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Please upload deposit slips to **payments@senteloans.com** or bring physical slips to our Kampala HQ office for verification.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
