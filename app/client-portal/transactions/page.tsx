"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { FilterField } from "@/components/datatables/TableFilter";
import {
  History,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Wallet,
  Activity,
  Info,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Loader2,
} from "lucide-react";

import { ClientPortalPageHeader } from "@/components/client-portal-page-header";
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card";
import { useClientSession } from "@/components/client-session-provider";
import { cn } from "@/lib/utils";

// DataTable component import
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable";

// Recharts components for breakdown
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
  Legend,
} from "recharts";

type ClientTransaction = {
  id: string;
  transaction_number?: string;
  account_id?: string;
  memberName?: string;
  date: string;
  type: string;
  amount: number;
  balance: number;
  mode: string;
  description?: string;
};

type Aggregates = {
  depositsTotal?: number;
  withdrawalsTotal?: number;
  paymentsTotal?: number;
  totalSavings?: number;
  totalShares?: number;
};

function clientInitials(fullName: string): string {
  if (!fullName) return "?";
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientTransactionsPage() {
  const { data: sessionData, formatMoney } = useClientSession();
  const currentClient = sessionData?.client;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [filter, setFilter] = useState("all");
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const onPageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10);
    setPage(0);
    setRowsPerPage(next);
  };

  const buildQueryUrl = useCallback(
    (queryParams: Record<string, unknown>, status: string, endpoint: string) => {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (
            value &&
            typeof value === "object" &&
            "start" in (value as Record<string, unknown>) &&
            "end" in (value as Record<string, unknown>)
          ) {
            const range = value as { start?: string; end?: string };
            if (key === "date") {
              if (range.start) params.set("date_from", range.start);
              if (range.end) params.set("date_to", range.end);
            } else {
              if (range.start) params.set(`${key}Start`, range.start);
              if (range.end) params.set(`${key}End`, range.end);
            }
            return;
          }
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value));
          }
        });
      }
      const qs = params.toString();
      return qs ? `${endpoint}?${qs}` : endpoint;
    },
    [],
  );

  async function loadTransactions(
    queryParams?: object,
    statusOverride?: string,
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const currentStatus = statusOverride !== undefined ? statusOverride : filter;
      const currentParams = (queryParams !== undefined ? queryParams : activeQueryParams) as Record<string, unknown>;
      const url = buildQueryUrl(currentParams, currentStatus, "/api/client/transactions");
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load transactions");
      }
      setTransactions(data.transactions || []);
      if (data.aggregates) {
        setAggregates(data.aggregates);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTransactions(activeQueryParams, filter);
  }, [filter]);

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0);
      const normalized = params as Record<string, unknown>;
      setActiveQueryParams(normalized);
      const flat: Record<string, string> = {};
      Object.entries(normalized).forEach(([k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "start" in (v as Record<string, unknown>) &&
          "end" in (v as Record<string, unknown>)
        ) {
          const range = v as { start?: string; end?: string };
          if (k === "date") {
            if (range.start) flat["date_from"] = range.start;
            if (range.end) flat["date_to"] = range.end;
          } else {
            if (range.start) flat[`${k}Start`] = range.start;
            if (range.end) flat[`${k}End`] = range.end;
          }
          return;
        }
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          flat[k] = String(v);
        }
      });
      setActiveFilters(flat);
      void loadTransactions(params, filter);
    },
    [filter],
  );

  const normalizeType = (t: string) => {
    const s = String(t || "").toLowerCase();
    if (s.includes("deposit")) return "deposit";
    if (s.includes("withdraw")) return "withdrawal";
    if (s.includes("repay") || s.includes("payment")) return "payment";
    return "other";
  };

  // Paginated Rows
  const paginatedRows = useMemo(() => {
    return transactions.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [transactions, page, rowsPerPage]);

  // Aggregate stats
  const depositsTotal = useMemo(() => {
    if (typeof aggregates?.depositsTotal === "number") {
      return aggregates.depositsTotal;
    }
    return transactions
      .filter((t) => normalizeType(t.type) === "deposit")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [aggregates?.depositsTotal, transactions]);

  const withdrawalsTotal = useMemo(() => {
    if (typeof aggregates?.withdrawalsTotal === "number") {
      return aggregates.withdrawalsTotal;
    }
    return transactions
      .filter((t) => normalizeType(t.type) === "withdrawal")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [aggregates?.withdrawalsTotal, transactions]);

  const paymentsTotal = useMemo(() => {
    if (typeof aggregates?.paymentsTotal === "number") {
      return aggregates.paymentsTotal;
    }
    return transactions
      .filter((t) => normalizeType(t.type) === "payment")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [aggregates?.paymentsTotal, transactions]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
      case "Opening Balance":
      case "Shares Purchase":
        return (
          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
        );
      case "Withdrawal":
      case "Loan Repayment":
        return (
          <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
        );
      default:
        return (
          <ArrowUpDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        );
    }
  };

  const downloadExport = async (format: "excel" | "pdf") => {
    setExporting(format);
    try {
      const url = buildQueryUrl(
        { ...activeQueryParams, format },
        filter,
        "/api/client/transactions/export",
      );
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || `Failed to download ${format.toUpperCase()}`,
        );
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename =
        match?.[1] ||
        `transactions-statement-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`;
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlBlob);
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded transaction statement ${format.toUpperCase()} report.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description:
          e?.message || `Failed to download ${format.toUpperCase()}.`,
      });
    } finally {
      setExporting(null);
    }
  };

  const downloadTransactionPdf = async (txId: string, txNumber?: string) => {
    try {
      setDownloadingId(txId);
      const res = await fetch(
        `/api/client/transactions/${txId}/pdf?download=1`,
        {
          cache: "no-store",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to download receipt");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${txNumber || txId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        variant: "success",
        title: "Receipt Downloaded",
        description: `Receipt for ${txNumber || txId} downloaded successfully.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description:
          e?.message || "Failed to download transaction receipt PDF.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Custom DataTable Columns configuration matching app/(dashboard)/transactions/page.tsx
  const activityColumns: DataTableColumn<ClientTransaction>[] = useMemo(
    () => [
      {
        key: "transaction_number",
        header: "Transaction ID",
        render: (row: ClientTransaction) => (
          <div className="font-medium text-xs font-mono">
            {row.transaction_number || row.id}
          </div>
        ),
      },
      {
        key: "memberName",
        header: "Assigned to",
        render: (row: ClientTransaction) => (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-linear-to-br from-[#f08c2b] to-[#d97b1e] rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-xs">
              {clientInitials(row.memberName || currentClient?.fullName || "")}
            </div>
            <div className="font-medium text-xs truncate max-w-[130px]">
              {row.memberName || currentClient?.fullName || "—"}
            </div>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row: ClientTransaction) => {
          const typeStyles: Record<string, string> = {
            Deposit:
              "bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
            Withdrawal:
              "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
            "Loan Disbursement":
              "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
            "Loan Repayment":
              "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
            "Fee Payment":
              "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
            Transfer:
              "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
            "Interest Payment":
              "bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
            "Opening Balance":
              "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
            "Shares Purchase":
              "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
          };
          return (
            <div className="flex items-center space-x-2">
              {getTransactionIcon(row.type)}
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
                  typeStyles[row.type] ||
                    "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                )}
              >
                {row.type}
              </span>
            </div>
          );
        },
      },
      {
        key: "amount",
        header: "Amount",
        render: (row: ClientTransaction) => {
          const isDeposit =
            row.type === "Deposit" ||
            row.type === "Shares Purchase" ||
            row.type === "Loan Disbursement" ||
            row.type === "Opening Balance";
          return (
            <div
              className={cn(
                "font-semibold text-xs font-mono",
                isDeposit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-[#f08c2b]",
              )}
            >
              {formatMoney(Number(row.amount))}
            </div>
          );
        },
      },
      {
        key: "mode",
        header: "Mode",
        render: (row: ClientTransaction) => (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/60">
            {row.mode}
          </span>
        ),
      },
      {
        key: "date",
        header: "Date",
        render: (row: ClientTransaction) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span>
              {new Date(row.date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        ),
      },
      {
        key: "balance",
        header: "Balance",
        render: (row: ClientTransaction) => (
          <div>
            <div className="font-semibold text-xs font-mono text-muted-foreground">
              {formatMoney(Number(row.balance))}
            </div>
            {row.type === "Fee Payment" && (
              <div className="text-[10px] text-muted-foreground">Remaining</div>
            )}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row: ClientTransaction) => {
          const isDownloading = downloadingId === row.id;
          return (
            <div className="flex justify-center">
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void downloadTransactionPdf(row.id, row.transaction_number);
                }}
                disabled={isDownloading}
                title="Download Receipt PDF"
                className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                ) : (
                  <BsFileEarmarkPdf className="h-4 w-4 text-rose-600" />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [currentClient?.fullName, downloadingId, formatMoney],
  );

  // Recharts Breakdown Pie Chart configs
  const breakdownData = useMemo(() => {
    return [
      { name: "Deposits", value: depositsTotal || 1 },
      { name: "Withdrawals", value: withdrawalsTotal || 1 },
      { name: "Payments", value: paymentsTotal || 1 },
    ];
  }, [depositsTotal, withdrawalsTotal, paymentsTotal]);

  const filterFields: FilterField[] = useMemo(
    () => [
      {
        field: "search",
        label: "Search by member name, transaction ID, or description",
        type: "text",
      },
      {
        field: "type",
        label: "Type",
        options: [
          { value: "Deposit", label: "Deposit" },
          { value: "Withdrawal", label: "Withdrawal" },
          { value: "Loan Disbursement", label: "Loan Disbursement" },
          { value: "Loan Repayment", label: "Loan Repayment" },
          { value: "Fee Payment", label: "Fee Payment" },
          { value: "Shares Purchase", label: "Shares Purchase" },
        ],
        multiple: false,
        type: "select",
      },
      {
        field: "mode",
        label: "Mode",
        options: [
          { value: "Cash", label: "Cash" },
          { value: "Mobile Money", label: "Mobile Money" },
          { value: "Bank Transfer", label: "Bank Transfer" },
        ],
        multiple: false,
        type: "select",
      },
      {
        field: "date",
        label: "Search By Date Range",
        type: "date-range",
      },
    ],
    [],
  );

  const BREAKDOWN_COLORS = ["#10b981", "#ef4444", "#f08c2b"];

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Transaction History"
        description="Review all deposits, withdrawals, interest payouts, and loan settlements."
      />

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
              <Info className="h-4 w-4" />
              {error}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Dynamic Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ClientPortalSummaryCard
          variant="savings"
          label="Total Deposits"
          value={formatMoney(depositsTotal)}
          sub="Lifetime savings contributions"
          icon={ArrowDownRight}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="loans"
          label="Total Withdrawals"
          value={formatMoney(withdrawalsTotal)}
          sub="Lifetime cashouts paid"
          icon={ArrowUpRight}
          index={1}
        />
        <ClientPortalSummaryCard
          variant="shares"
          label="Repayments & Fees"
          value={formatMoney(paymentsTotal)}
          sub="Cooperative settlements"
          icon={CreditCard}
          index={2}
        />
      </div>

      {/* Grid Columns */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1 & 2: Transactions Ledger */}
        <div className="space-y-4 lg:col-span-2">
          <DataTable
            title={`All Transactions (${transactions.length})`}
            columns={activityColumns}
            rows={paginatedRows}
            filterFields={filterFields}
            onQueryParamsChange={handleQueryParamsChange}
            loading={isLoading}
            emptyMessage="No ledger transactions found matching the selected filters."
            pagination={{
              page,
              rowsPerPage,
              total: transactions.length,
              onPageChange,
              onRowsPerPageChange,
              rowsPerPageOptions: [5, 10, 25, 50],
            }}
            exportActions={{
              onExcel: () => void downloadExport("excel"),
              onPdf: () => void downloadExport("pdf"),
              excelDisabled:
                isLoading || transactions.length === 0 || exporting !== null,
              pdfDisabled:
                isLoading || transactions.length === 0 || exporting !== null,
              excelLoading: exporting === "excel",
              pdfLoading: exporting === "pdf",
            }}
          />
        </div>

        {/* Column 3: Sidebar Charts & Info */}
        <div className="space-y-6 lg:col-span-1">
          {/* Breakdown Pie Chart */}
          <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">
                Activity Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="h-48 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      cornerRadius={8}
                      dataKey="value"
                    >
                      {breakdownData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={BREAKDOWN_COLORS[idx % BREAKDOWN_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{
                        background: "#18181b",
                        borderColor: "#27272a",
                        borderRadius: 8,
                        color: "#fff",
                      }}
                      formatter={(val) => [
                        `UGX ${Number(val).toLocaleString()}`,
                        "Valuation",
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={24}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Reference guidelines Card */}
          <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">
                Reconciliation Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-foreground">
                  Mobile Money (MTN/Airtel)
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Cleared automatically within **15 minutes**. Transactions
                  require reference number match.
                </p>
              </div>
              <div className="space-y-1.5 text-xs border-t border-border/40 pt-3">
                <span className="font-bold text-foreground">
                  Bank Transfers
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Cleared in **1-2 working days**. Requires direct deposit
                  receipt upload to payments@senteloans.com.
                </p>
              </div>
              <div className="flex items-start gap-2 bg-[#f08c2b]/5 border border-[#f08c2b]/15 p-2.5 rounded-lg text-[10px] leading-relaxed text-muted-foreground">
                <Info className="h-4 w-4 text-[#f08c2b] shrink-0 mt-0.5" />
                <span>
                  Discrepancies in running balances should be reported to the
                  audit committee within **30 days**.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
