"use client"

import { Suspense, useEffect, useMemo, useState, useCallback } from "react"
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
import { useToast } from "@/components/ui/toast"
import { downloadClientInvoicePdfFile } from "@/lib/invoices/download"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Clock,
  Download,
  Eye,
  FileText,
  Receipt,
  QrCode,
  CheckSquare,
  Square,
  Info,
  Calendar,
  Loader2,
} from "lucide-react"
import { FaRobot, FaUserCheck } from "react-icons/fa"
import { BsFileEarmarkPdf } from "react-icons/bs"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"

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
  clientName?: string
  staffName?: string
  createdAt?: string
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

function getStatusMeta(status: string) {
  const normalized = normalizeStatus(status)
  switch (normalized) {
    case "fully paid":
    case "paid":
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
        cls: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
      }
    case "partially paid":
      return {
        icon: <Clock3 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />,
        cls: "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
      }
    case "overdue":
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />,
        cls: "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
      }
    case "sent":
      return {
        icon: <Receipt className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />,
        cls: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
      }
    default:
      return {
        icon: <Clock3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
        cls: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
      }
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function clientInitials(fullName: string): string {
  if (!fullName) return "?"
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
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
  const { data: sessionData, formatMoney } = useClientSession()
  const currentClient = sessionData?.client
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("invoice_id")

  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [statusFilter, setStatusFilter] = useState("all")
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  const buildQueryUrl = useCallback((params: Record<string, unknown>, status: string, endpoint: string) => {
    const q = new URLSearchParams()
    if (status && status !== "all") q.set("status", status)
    Object.entries(params).forEach(([k, v]) => {
      if (!v) return
      if (typeof v === "object" && "start" in (v as any) && "end" in (v as any)) {
        const range = v as { start?: string; end?: string }
        const start = range.start ? String(range.start).slice(0, 10) : ""
        const end = range.end ? String(range.end).slice(0, 10) : ""
        if (k === "invoiceDate") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) q.set("date_from", start)
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) q.set("date_to", end)
        } else if (k === "invoice_due") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) q.set("due_from", start)
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) q.set("due_to", end)
        }
        return
      }
      if (String(v).trim()) {
        q.set(k, String(v).trim())
      }
    })
    const qs = q.toString()
    return qs ? `${endpoint}?${qs}` : endpoint
  }, [])

  const loadInvoices = useCallback(async (params: Record<string, unknown> = {}, status: string = statusFilter) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = buildQueryUrl(params, status, "/api/client/invoices")
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to load invoices")
      setInvoices(data.invoices || [])
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to load invoices")
    } finally {
      setIsLoading(false)
      setIsInitialLoading(false)
    }
  }, [buildQueryUrl, statusFilter])

  useEffect(() => {
    void loadInvoices(activeQueryParams, statusFilter)
  }, [statusFilter])

  useEffect(() => {
    if (!highlightId || isLoading) return
    const el = document.getElementById(`invoice-${highlightId}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightId, isLoading, invoices.length])

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized = params as Record<string, unknown>
    setActiveQueryParams(normalized)
    setPage(0)
    void loadInvoices(normalized, statusFilter)
  }, [loadInvoices, statusFilter])

  const paginatedRows = useMemo(() => {
    return invoices.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  }, [invoices, page, rowsPerPage])

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
      toast({
        variant: "success",
        title: "Invoice Downloaded",
        description: `Invoice ${invoice.invoiceNumber} downloaded successfully.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: e?.message || "Failed to download invoice PDF.",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const downloadExport = async (format: "excel" | "pdf") => {
    setExporting(format)
    try {
      const url = buildQueryUrl({ ...activeQueryParams, format }, statusFilter, "/api/client/invoices/export")
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename =
        match?.[1] ||
        `invoices-statement-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`
      const urlBlob = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = urlBlob
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(urlBlob)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded invoices statement ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description: e?.message || `Failed to download ${format.toUpperCase()}.`,
      })
    } finally {
      setExporting(null)
    }
  }

  // Filter fields sent directly to backend
  const filterFields: FilterField[] = useMemo(() => [
    {
      field: "search",
      label: "Search by invoice number",
      type: "text",
    },
    {
      field: "invoice_type",
      label: "Invoice Type",
      type: "select",
      multiple: false,
      options: [
        { value: "Auto", label: "Auto" },
        { value: "Manual", label: "Manual" },
      ],
    },
    { field: "invoiceDate", label: "Invoice Date Range", type: "date-range" },
    { field: "invoice_due", label: "Due Date Range", type: "date-range" },
  ], [])

  // Columns matching staff invoices table
  const columns: DataTableColumn<ClientInvoice>[] = useMemo(
    () => [
    {
      key: "invoiceNumber",
      header: "Invoice Number",
      render: (row: ClientInvoice) => (
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-[#f7e6d3] dark:bg-[#f08c2b]/15 rounded-full flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#f08c2b]" />
            </div>
          </div>
          <div className="font-semibold text-xs font-mono">{row.invoiceNumber}</div>
        </div>
      ),
    },
    {
      key: "clientName",
      header: "Assigned To",
      render: (row: ClientInvoice) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-linear-to-br from-[#f08c2b] to-[#d97b1e] rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-xs">
            {clientInitials(row.clientName || currentClient?.fullName || "")}
          </div>
          <div className="font-medium text-xs truncate max-w-[130px]">
            {row.clientName || currentClient?.fullName || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "invoiceType",
      header: "Type",
      render: (row: ClientInvoice) => {
        const isAuto = row.invoiceType === "Auto" || row.invoiceType === "system.auto"
        const displayText = isAuto ? "system.auto" : "Manual"
        const bgColor = isAuto
          ? "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
          : "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
        const Icon = isAuto ? FaRobot : FaUserCheck

        return (
          <div className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 ${isAuto ? "text-purple-500" : "text-blue-500"}`} />
            <span
              className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${bgColor} border`}
            >
              {displayText}
            </span>
          </div>
        )
      },
    },
    {
      key: "invoiceDate",
      header: "Invoice Date",
      render: (row: ClientInvoice) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span>{formatDate(row.invoiceDate)}</span>
        </div>
      ),
    },
    {
      key: "invoiceDue",
      header: "Due Date",
      render: (row: ClientInvoice) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span>{formatDate(row.invoiceDue)}</span>
        </div>
      ),
    },
    {
      key: "staffName",
      header: "Created By",
      render: (row: ClientInvoice) =>
        row.staffName ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center border border-border">
              <span className="text-[#f08c2b] text-[10px] font-bold">
                {clientInitials(row.staffName)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{row.staffName}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        ),
    },
    {
      key: "totalAmount",
      header: "Total Amount",
      render: (row: ClientInvoice) => (
        <div className="font-semibold text-xs font-mono text-foreground">
          {formatMoney(Number(row.totalAmount || 0))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: ClientInvoice) => {
        const meta = getStatusMeta(row.status)
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
                meta.cls
              )}
            >
              {meta.icon}
              {formatStatusLabel(row.status)}
            </span>
          </div>
        )
      },
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row: ClientInvoice) => {
        const isDownloading = downloadingId === row.id
        return (
          <div className="flex items-center justify-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              asChild
              title="View Invoice PDF"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg cursor-pointer"
            >
              <a
                href={`/api/client/invoices/${encodeURIComponent(row.id)}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="h-4 w-4" />
              </a>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                void handleDownload(row)
              }}
              disabled={isDownloading}
              title="Download Invoice PDF"
              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
              ) : (
                <BsFileEarmarkPdf className="h-4 w-4 text-rose-600" />
              )}
            </Button>
          </div>
        )
      },
    },
  ], [currentClient?.fullName, downloadingId, handleDownload])

  if (isInitialLoading) {
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

  if (error && invoices.length === 0 && !isLoading) {
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
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val)
                setPage(0)
              }}
            >
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

      {/* Standard Summary KPI Cards */}
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
          value={formatMoney(overdueTotal)}
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

      {/* Grid container: Table left, sidebar right */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1 & 2: Reusable DataTable */}
        <div className="space-y-4 lg:col-span-2">
          <DataTable
            title={`All Invoices (${invoices.length})`}
            columns={columns}
            rows={paginatedRows}
            loading={isLoading}
            emptyMessage="No invoices found matching the selected filters."
            filterFields={filterFields}
            onQueryParamsChange={handleQueryParamsChange}
            pagination={{
              page,
              rowsPerPage,
              total: invoices.length,
              onPageChange: (_: unknown, newPage: number) => setPage(newPage),
              onRowsPerPageChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                setRowsPerPage(parseInt(e.target.value, 10))
                setPage(0)
              },
              rowsPerPageOptions: [5, 10, 25, 50],
            }}
            exportActions={{
              onExcel: () => void downloadExport("excel"),
              onPdf: () => void downloadExport("pdf"),
              excelDisabled: isLoading || invoices.length === 0 || exporting !== null,
              pdfDisabled: isLoading || invoices.length === 0 || exporting !== null,
              excelLoading: exporting === "excel",
              pdfLoading: exporting === "pdf",
            }}
          />
        </div>

        {/* Column 3: Sidebar Pending Checklist & MM Payment Guide */}
        <div className="space-y-6 lg:col-span-1">
          {/* Pending Dues Checklist */}
          <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
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
                        <p className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{formatMoney(inv.totalAmount)}</p>
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
          <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <QrCode className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">Sacco Settlement Guide</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4">
              <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-1">
                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-[#f08c2b] block">Option 1: Mobile Money</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Dial <strong>*165*4#</strong> (MTN) or <strong>*185*4#</strong> (Airtel).</p>
                    <p>Enter Sacco Merchant Code: <strong>612055</strong></p>
                    <p>Enter Reference: <strong>[Your Member ID or Invoice Number]</strong></p>
                    <p>Confirm with MM PIN.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground block">Option 2: Direct Bank Deposit</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Bank: <strong>Centenary Bank Uganda</strong></p>
                    <p>A/C Name: <strong>SenteLoans Cooperative Society</strong></p>
                    <p>A/C Number: <strong>3100099481</strong></p>
                    <p>Branch: <strong>Kampala Corporate Branch</strong></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground block">Option 3: Cash Payment at Branch</span>
                  <div className="bg-muted/30 border border-border/40 p-2.5 rounded-lg space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                    <p>Branch Office: <strong>Kampala Main Headquarters</strong></p>
                    <p>Location: <strong>Plot 45, Kampala Road, Regency Plaza, 2nd Floor</strong></p>
                    <p>Working Hours: <strong>Mon - Fri, 8:00 AM - 5:00 PM</strong></p>
                    <p>Note: <strong>Instant Sacco receipt generated on cash delivery.</strong></p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10.5px] leading-relaxed text-muted-foreground">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Please upload deposit slips to <strong>payments@senteloans.com</strong> or bring physical slips to our Kampala HQ office for verification.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
