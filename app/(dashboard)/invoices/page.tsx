"use client"

import { useEffect, useState, useCallback, type ChangeEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Receipt, Calendar, DollarSign, Clock3, CheckCircle2, AlertTriangle, Plus, User, Pencil, Eye, Edit } from "lucide-react"
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import AddNewInvoice from "./components/add/addNewInvoice"
import EditInvoice from "./components/edit/editInvoice"

type InvoiceRow = {
  id: string
  invoice_number: string
  client_name: string
  client_number: string | null
  invoice_date: string
  invoice_due: string | null
  subtotal: number
  vat: number
  total_amount: number
  invoice_type: string
  status: string
  items?: Array<{
    id: string
    description: string
    quantity: number
    total_price: number
  }>
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function getStatusMeta(status: string) {
  switch (status) {
    case "Paid":
      return { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" }
    case "Overdue":
      return { icon: <AlertTriangle className="h-4 w-4 text-rose-600" />, cls: "bg-rose-100 text-rose-700 border border-rose-200" }
    case "Sent":
      return { icon: <Receipt className="h-4 w-4 text-blue-600" />, cls: "bg-blue-100 text-blue-700 border border-blue-200" }
    default:
      return { icon: <Clock3 className="h-4 w-4 text-amber-600" />, cls: "bg-amber-100 text-amber-700 border border-amber-200" }
  }
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
  }

  async function loadInvoices(queryParams?: object) {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value && typeof value === "object" && "start" in (value as Record<string, unknown>) && "end" in (value as Record<string, unknown>)) {
            const range = value as { start?: string; end?: string }
            if (key === "invoiceDate") {
              if (range.start) params.set("date_from", range.start)
              if (range.end) params.set("date_to", range.end)
            }
            return
          }
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      params.set("page", "1")
      params.set("pageSize", "200")

      const res = await fetch(`/api/institution/invoices?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load invoices")
      setInvoices(Array.isArray(data.items) ? data.items : [])
      setTotal(Number(data.total || 0))
    } catch (e: any) {
      setError(e?.message || "Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadInvoices(params)
  }, [])

  const totalAmount = invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const paidCount = invoices.filter((i) => i.status === "Paid").length
  const overdueCount = invoices.filter((i) => i.status === "Overdue").length
  const draftCount = invoices.filter((i) => i.status === "Draft").length

  const handleView = (row: InvoiceRow) => {
    setEditInvoiceId(row.id)
    setIsEditOpen(true)
  }

  const handleEdit = (row: InvoiceRow) => {
    setEditInvoiceId(row.id)
    setIsEditOpen(true)
  }

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: "invoice_number",
      header: "Invoice Number",
      render: (row) => <div className="font-medium">{row.invoice_number}</div>,
    },
    {
      key: "client_name",
      header: "Client",
      render: (row) => (
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-gray-400" />
          <div>
            <div className="font-medium text-sm">{row.client_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.client_number || "No client number"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "invoice_type",
      header: "Type",
      render: (row) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
          {row.invoice_type}
        </span>
      ),
    },
    {
      key: "invoice_date",
      header: "Invoice Date",
      render: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          {formatDate(row.invoice_date)}
        </div>
      ),
    },
    {
      key: "invoice_due",
      header: "Due Date",
      render: (row) => (
        <div className="text-sm">{formatDate(row.invoice_due)}</div>
      ),
    },
    {
      key: "total_amount",
      header: "Total Amount",
      render: (row) => <div className="font-medium">{formatCurrency(Number(row.total_amount || 0))}</div>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const meta = getStatusMeta(row.status)
        return (
          <div className="flex items-center gap-2">
            {meta.icon}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
              {row.status}
            </span>
          </div>
        )
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={actions} row={row} />,
    },
  ]

  const actions = [
      {
        label: "View",
        onClick: handleView,
        variant: "view",
        icon: <Eye className="h-4 w-4" />,
      },
      {
        label: "Edit",
        onClick: handleEdit,
        variant: "primary",
        icon: <Edit className="h-4 w-4" />,
      },
    ]

  const filterFields: FilterField[] = [
    { field: "search", label: "Search by invoice number or client", type: "text" },
    {
      field: "status",
      label: "Status",
      type: "select",
      multiple: false,
      options: [
        { value: "Draft", label: "Draft" },
        { value: "Sent", label: "Sent" },
        { value: "Paid", label: "Paid" },
        { value: "Overdue", label: "Overdue" },
        { value: "Cancelled", label: "Cancelled" },
      ],
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
  ]

  const pagedRows = invoices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">Manage invoice records and monitor billing status.</p>
        </div>
        <Button 
          className="bg-[#111111] text-white hover:bg-[#111111] disabled:opacity-70"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Total Invoices</CardDescription>
            <CardTitle className="text-2xl">{total}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-[#111111]/5 text-[#111111] border border-[#111111]/10 hover:bg-[#111111]/5">All statuses</Badge>
          </CardContent>
        </Card>
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalAmount)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4 text-[#f08c2b]" />
              Invoice portfolio
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Paid Invoices</CardDescription>
            <CardTitle className="text-2xl">{paidCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">Paid</Badge>
          </CardContent>
        </Card>
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Action Needed</CardDescription>
            <CardTitle className="text-2xl">{overdueCount + draftCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Badge className="bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-100">Overdue {overdueCount}</Badge>
              <Badge className="bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100">Draft {draftCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        title="Invoice Register"
        rows={pagedRows}
        columns={columns}
        loading={loading}
        emptyMessage="No invoices found."
        onQueryParamsChange={handleQueryParamsChange}
        filterFields={filterFields}
        pagination={{
          page,
          rowsPerPage,
          total,
          onPageChange,
          onRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
      />

      <AddNewInvoice
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadInvoices()}
      />
        
      <EditInvoice
        isOpen={isEditOpen}
        invoiceId={editInvoiceId}
        onClose={() => { setIsEditOpen(false); setEditInvoiceId(null) }}
        onSuccess={() => loadInvoices()}
      />
    </div>
  )
}
