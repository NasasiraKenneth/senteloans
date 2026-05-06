"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Calendar,
  DollarSign,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Eye,
  Edit,
  Clock,
  FileText,
  Download,
  Truck,
  X,
} from "lucide-react";
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable";
import { FilterField } from "@/components/datatables/TableFilter";
import AddNewInvoice from "./components/add/addNewInvoice";
import EditInvoice from "./components/edit/editInvoice";
import ViewInvoicePdf from "./components/view-pdf/viewPdf";
import { getInitials } from "@/lib/invoices/utils";
import { FaRobot, FaUserCheck } from "react-icons/fa";
import { ActionSelect, SelectOption } from "@/components/datatables/actions";
import { Filter } from "@/types";
import { useToast } from "@/components/ui/toast"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { downloadInvoicesExport } from "./export/export"
import { downloadInvoicePdfFile } from "@/lib/invoices/download"

type InvoiceRow = {
  id: string;
  invoice_number: string;
  client_name: string;
  target_type?: "member" | "client";
  staff_name: string;
  client_number: string | null;
  invoice_date: string;
  invoice_due: string | null;
  subtotal: number;
  vat: number;
  total_amount: number;
  invoice_type: string;
  status: string;
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    total_price: number;
  }>;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function formatStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status);
  if (!normalized) return "Draft";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getStatusMeta(status: string) {
  switch (normalizeStatus(status)) {
    case "paid":
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
        cls: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      };
    case "overdue":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
        cls: "bg-rose-100 text-rose-700 border border-rose-200",
      };
    case "sent":
      return {
        icon: <Receipt className="h-4 w-4 text-blue-600" />,
        cls: "bg-blue-100 text-blue-700 border border-blue-200",
      };
    default:
      return {
        icon: <Clock3 className="h-4 w-4 text-amber-600" />,
        cls: "bg-amber-100 text-amber-700 border border-amber-200",
      };
  }
}

// Define your status helper in invoice page
const getAvailableStatuses = (
  currentStatus: string,
  onStatusChange: (newStatus: string) => void,
): SelectOption[] => {
  const allStatuses: SelectOption[] = [
    {
      value: "draft",
      label: "Mark as Draft",
      color: "text-gray-600",
      icon: <Clock3 className="mr-2 h-4 w-4" />,
    },
    {
      value: "sent",
      label: "Mark as Sent",
      color: "text-blue-600",
      icon: <Truck className="mr-2 h-4 w-4" />,
    },
    {
      value: "paid",
      label: "Mark as Paid",
      color: "text-green-600",
      icon: <CheckCircle2 className="mr-2 h-4 w-4" />,
    },
    {
      value: "overdue",
      label: "Mark as Overdue",
      color: "text-red-600",
      icon: <AlertTriangle className="mr-2 h-4 w-4" />,
    },
    {
      value: "cancelled",
      label: "Mark as Cancelled",
      color: "text-red-600",
      icon: <X className="mr-2 h-4 w-4" />,
    },
  ];
  return allStatuses
    .filter((s) => s.value !== normalizeStatus(currentStatus))
    .map((s) => ({
      ...s,
      onClick: () => onStatusChange(String(s.value)),
    }));
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [invoicePermissions, setInvoicePermissions] = useState({
    viewInvoices: false,
    downloadInvoice: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  });
  const exportPermissionToastShown = useRef(false);
  const { toast } = useToast()

  const onPageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    void loadInvoices(activeQueryParams, newPage, rowsPerPage);
  };
  const onRowsPerPageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextRows = parseInt(e.target.value, 10);
    setPage(0);
    setRowsPerPage(nextRows);
    void loadInvoices(activeQueryParams, 0, nextRows);
  };

  async function loadInvoices(
    queryParams?: object,
    pageOverride?: number,
    rowsPerPageOverride?: number,
  ) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (
            value &&
            typeof value === "object" &&
            "start" in (value as Record<string, unknown>) &&
            "end" in (value as Record<string, unknown>)
          ) {
            const range = value as { start?: string; end?: string };
            if (key === "invoiceDate") {
              if (range.start) params.set("date_from", range.start);
              if (range.end) params.set("date_to", range.end);
            } else if (key === "invoice_due") {
              if (range.start) params.set("due_from", range.start);
              if (range.end) params.set("due_to", range.end);
            }
            return;
          }
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value));
          }
        });
      }
      const requestPage = typeof pageOverride === "number" ? pageOverride : page;
      const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage;
      params.set("page", String(requestPage + 1));
      params.set("pageSize", String(requestRows));

      const res = await fetch(
        `/api/institution/invoices?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoices");
      setInvoices(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/institution/invoices/permissions", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          permissions?: {
            viewInvoices?: boolean;
            downloadInvoice?: boolean;
            isSuperAdmin?: boolean;
            branches?: Array<{ id: string; name: string }>;
          };
        };
        setInvoicePermissions({
          viewInvoices: !!data.permissions?.viewInvoices,
          downloadInvoice: !!data.permissions?.downloadInvoice,
          isSuperAdmin: !!data.permissions?.isSuperAdmin,
          branches: (data.permissions?.branches || []).map((b) => ({ value: b.id, label: b.name })),
        });
      } catch {
        // keep defaults
      }
    }
    void loadPermissions();
  }, []);

  useEffect(() => {
    void loadInvoices(activeQueryParams, page, rowsPerPage);
  }, []);

  const handleQueryParamsChange = useCallback((params: object) => {
    const normalized = params as Record<string, unknown>;
    setActiveQueryParams(normalized);
    setPage(0);
    const flat: Record<string, string> = {};
    Object.entries(normalized).forEach(([k, v]) => {
      if (
        v &&
        typeof v === "object" &&
        "start" in (v as Record<string, unknown>) &&
        "end" in (v as Record<string, unknown>)
      ) {
        const range = v as { start?: string; end?: string };
        const start = range.start ? String(range.start).slice(0, 10) : "";
        const end = range.end ? String(range.end).slice(0, 10) : "";
        if (k === "invoiceDate") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat.date_from = start;
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat.date_to = end;
        } else if (k === "invoice_due") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) flat.due_from = start;
          if (/^\d{4}-\d{2}-\d{2}$/.test(end)) flat.due_to = end;
        }
        return;
      }
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        flat[k] = String(v);
      }
    });
    setActiveFilters(flat);
    exportPermissionToastShown.current = false;
    void loadInvoices(normalized, 0, rowsPerPage);
  }, [rowsPerPage]);

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!invoicePermissions.viewInvoices) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export invoices.",
      });
      return;
    }
    setExporting(format);
    try {
      await downloadInvoicesExport(activeFilters, format);
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded invoice list ${format.toUpperCase()}.`,
      });
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "");
      if (message === "missing_permission:view_invoices") {
        if (!exportPermissionToastShown.current) {
          exportPermissionToastShown.current = true;
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to export invoices.",
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: `Download ${format.toUpperCase()} failed`,
          description: message || `Failed to download ${format.toUpperCase()}.`,
        });
      }
    } finally {
      setExporting(null);
    }
  };

  const totalAmount = invoices.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  );
  const paidCount = invoices.filter((i) => normalizeStatus(i.status) === "paid").length;
  const overdueCount = invoices.filter((i) => normalizeStatus(i.status) === "overdue").length;
  const draftCount = invoices.filter((i) => normalizeStatus(i.status) === "draft").length;

  const handleView = (row: InvoiceRow) => {
    setViewInvoiceId(row.id);
    setIsViewOpen(true);
  };

  const handleEdit = (row: InvoiceRow) => {
    setEditInvoiceId(row.id);
    setIsEditOpen(true);
  };

  const handleDownloadInvoicePdf = (row: InvoiceRow) => {
    const download = async () => {
      if (!invoicePermissions.downloadInvoice) {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to download invoices.",
        });
        return;
      }

      toast({
        variant: "warning",
        title: "Generating PDF",
        description: `Preparing invoice ${row.invoice_number || ""}...`,
      });

      try {
        await downloadInvoicePdfFile({
          invoiceId: row.id,
          fallbackName: `${String(row.invoice_number || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
        })

        toast({
          variant: "success",
          title: "Download invoice PDF successfully",
          description: `${row.invoice_number || "Invoice"} downloaded.`,
        });
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "Unexpected error")
        if (message === "missing_permission:download_invoice") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to download invoices.",
          })
          return
        }
        toast({
          variant: "destructive",
          title: "Download invoice PDF failed",
          description: message,
        });
      }
    };

    void download();
  };

  // Handle invoice status change (efficient - only sends id and status)
  const handleChangeInvoiceStatus = async (
    invoice: InvoiceRow,
    newStatus: string,
  ) => {
    try {
      const normalized = normalizeStatus(newStatus);
      const res = await fetch(`/api/institution/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: normalized }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to update invoice status");
      }

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id ? { ...inv, status: normalized } : inv,
        ),
      );

      toast({
        title: "Invoice status updated",
        description: `Invoice status updated to ${formatStatusLabel(normalized)} successfully.`,
        variant: "success",
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update invoice status";
      toast({
        title: "Failed to update invoice status",
        description: errorMessage || "Could not update invoice status.",
        variant: "destructive",
      });
    }
  };

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: "invoice_number",
      header: "Invoice Number",
      render: (row) => (
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-[#f7e6d3] rounded-full flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#f08c2b]" />
            </div>
          </div>
          <div className="font-medium">{row.invoice_number}</div>
        </div>
      ),
    },
    {
      key: "client_name",
      header: "Assigned To",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {getInitials(row.client_name)}
            </span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.client_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: "invoice_type",
      header: "Type",
      render: (row) => {
        const isAuto = row.invoice_type === "Auto";
        const displayText = isAuto ? "system.auto" : "Manual";
        const bgColor = isAuto
          ? "bg-purple-100 text-purple-800"
          : "bg-blue-100 text-blue-800";
        const Icon = isAuto ? FaRobot : FaUserCheck;

        return (
          <div className="flex items-center gap-2">
            <Icon
              className={`w-4 h-4 ${isAuto ? "text-purple-500" : "text-blue-500"}`}
            />
            <span
              className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${bgColor} border border-gray-200`}
            >
              {displayText}
            </span>
          </div>
        );
      },
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
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm">{formatDate(row.invoice_due)}</div>
        </div>
      ),
    },
    {
      key: "staff_name",
      header: "Created By",
      render: (row) =>
        row.staff_name ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-linear-to-br from-black/80 to-black/50 rounded-full flex items-center justify-center">
              <span className="text-[#f08c2b] text-xs font-semibold">
                {getInitials(row.staff_name)}
              </span>
            </div>
            <div className="text-sm text-gray-700">{row.staff_name}</div>
          </div>
        ) : (
          <span className="flex text-sm text-gray-700 justify-center ">-</span>
        ),
    },
    {
      key: "total_amount",
      header: "Total Amount",
      render: (row) => (
        <div className="font-medium">
          {formatCurrency(Number(row.total_amount || 0))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const meta = getStatusMeta(row.status);
        return (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}
            >
              {formatStatusLabel(row.status)}
            </span>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const actions: SelectOption[] = [
          {
            value: "view",
            label: "View Details",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => handleView(row),
          },
          {
            value: "edit",
            label: "Edit",
            icon: <Edit className="h-4 w-4" />,
            onClick: () => handleEdit(row),
          },
        ];
        if (invoicePermissions.downloadInvoice) {
          actions.push({
            value: "download",
            label: "Download PDF",
            icon: <Download className="h-4 w-4" />,
            onClick: () => handleDownloadInvoicePdf(row),
          });
        }

        const statusOptions = getAvailableStatuses(
          row.status || "draft",
          (nextStatus) => void handleChangeInvoiceStatus(row, nextStatus),
        );

        return (
          <div className="flex justify-center">
            {" "}
            <ActionSelect
              row={row}
              actions={actions}
              statusOptions={statusOptions}
            />{" "}
          </div>
        );
      },
    },
  ];

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      {
        field: "search",
        label: "Search by invoice number or assigned to",
        type: "text",
      },
      {
        field: "target_type",
        label: "Invoice Target",
        type: "select",
        multiple: false,
        options: [
          { value: "member", label: "Member Invoices" },
          { value: "client", label: "Client Invoices" },
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
      { field: "invoice_due", label: "Invoice Due Date", type: "date-range" },
    ];
    return withBranchFilterFirst(fields, {
      isSuperAdmin: invoicePermissions.isSuperAdmin,
      branchOptions: invoicePermissions.branches,
    });
  }, [invoicePermissions.isSuperAdmin, invoicePermissions.branches]);

  // Tabular filter options
  const filters: Filter[] = [
    { label: "All Invoices", value: "" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "paid", label: "Paid" },
    { value: "overdue", label: "Overdue" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Manage invoice records and monitor billing status.
          </p>
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
            <Badge className="bg-[#111111]/5 text-[#111111] border border-[#111111]/10 hover:bg-[#111111]/5">
              All statuses
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(totalAmount)}
            </CardTitle>
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
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
              Paid
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-[#1f1f1f]/10">
          <CardHeader className="pb-2">
            <CardDescription>Action Needed</CardDescription>
            <CardTitle className="text-2xl">
              {overdueCount + draftCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Badge className="bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-100">
                Overdue {overdueCount}
              </Badge>
              <Badge className="bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100">
                Draft {draftCount}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        title="Invoice Register"
        rows={invoices}
        columns={columns}
        loading={loading}
        emptyMessage="No invoices found."
        tabularFilters={filters}
        tabularFilterField="status"
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
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled:
            loading || total === 0 || exporting !== null || !invoicePermissions.viewInvoices,
          pdfDisabled:
            loading || total === 0 || exporting !== null || !invoicePermissions.viewInvoices,
        }}
      />

      <AddNewInvoice
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => void loadInvoices(activeQueryParams, page, rowsPerPage)}
      />

      <EditInvoice
        isOpen={isEditOpen}
        invoiceId={editInvoiceId}
        onClose={() => {
          setIsEditOpen(false);
          setEditInvoiceId(null);
        }}
        onSuccess={() => void loadInvoices(activeQueryParams, page, rowsPerPage)}
      />

      <ViewInvoicePdf
        isOpen={isViewOpen}
        invoiceId={viewInvoiceId}
        onClose={() => {
          setIsViewOpen(false);
          setViewInvoiceId(null);
        }}
        onEdit={() => {
          if (!viewInvoiceId) return;
          setIsViewOpen(false);
          setEditInvoiceId(viewInvoiceId);
          setIsEditOpen(true);
        }}
      />
    </div>
  );
}
