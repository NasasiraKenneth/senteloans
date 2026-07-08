"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClientPortalPageHeader } from "@/components/client-portal-page-header"
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
  if (normalized === "fully paid") return "Fully paid"
  if (normalized === "partially paid") return "Partially paid"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
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
  if (s === "fully paid" || s === "paid") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (s === "overdue") return <AlertTriangle className="h-4 w-4 text-red-600" />
  return <Clock3 className="h-4 w-4 text-primary" />
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
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading invoices...</div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-destructive">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      <ClientPortalPageHeader
        title="My Invoices"
        description="Membership fees, share purchases, and other bills issued to your account."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total invoices</p>
              <p className="text-2xl font-bold tabular-nums">{invoices.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(outstandingTotal)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"}
        </p>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partially paid">Partially paid</SelectItem>
            <SelectItem value="fully paid">Fully paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No invoices yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Invoices for membership fees and other charges will appear here when they are issued.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((invoice) => {
            const highlighted = highlightId === invoice.id
            return (
              <Card
                key={invoice.id}
                id={`invoice-${invoice.id}`}
                className={cn(
                  "overflow-hidden border-border/80 shadow-sm transition-colors",
                  highlighted && "ring-2 ring-primary/30",
                )}
              >
                <CardHeader className="border-b border-border/60 bg-muted/20 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold">{invoice.invoiceNumber}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {String(invoice.invoiceType || "Invoice").toUpperCase()} · Issued {formatDate(invoice.invoiceDate)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(invoice.status)} className="gap-1.5 shrink-0">
                      <StatusIcon status={invoice.status} />
                      {formatStatusLabel(invoice.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-3 sm:grid-cols-3 sm:gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="text-lg font-bold tabular-nums">{formatMoney(invoice.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Due date</p>
                      <p className="text-sm font-medium">{formatDate(invoice.invoiceDue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">VAT</p>
                      <p className="text-sm font-medium tabular-nums">{formatMoney(invoice.vat)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`/api/client/invoices/${encodeURIComponent(invoice.id)}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View PDF
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(invoice)}
                      disabled={downloadingId === invoice.id}
                    >
                      <Download className="mr-2 h-4 w-4" />
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
  )
}
