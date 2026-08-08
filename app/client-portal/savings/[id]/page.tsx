"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  TrendingUp,
  PiggyBank,
  User,
  Eye,
  EyeOff,
  Calendar,
  Sparkles,
  Info,
  Clock,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ClientPortalPageHeader } from "@/components/client-portal-page-header";
import { useClientModuleGuard } from "@/hooks/use-client-module-guard";
import { useClientSession } from "@/components/client-session-provider";
import { cn } from "@/lib/utils";

// DataTable component import
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable";
import { FilterField } from "@/components/datatables/TableFilter";

type SavingsAccount = {
  id: string;
  account_number: string;
  account_type: string;
  available_balance: number;
  total_balance: number;
  status: string;
  open_date?: string;
  last_transaction_date?: string;
  client_name?: string;
  client_number?: string;
  member_id?: string;
  institution_id?: string;
};

type TransactionRow = {
  id: string;
  transaction_number?: string;
  date: string;
  type: string;
  amount: number;
  mode: string;
  description: string;
  balance: number;
};

const TRANSACTION_TYPE_OPTIONS = [
  { value: "Deposit", label: "Deposit" },
  { value: "Withdrawal", label: "Withdrawal" },
  { value: "Transfer", label: "Transfer" },
  { value: "Opening Balance", label: "Opening Balance" },
  { value: "Loan Repayment", label: "Loan Repayment" },
  { value: "Membership Fee", label: "Membership Fee" },
  { value: "Shares Purchase", label: "Shares Purchase" },
];

const TRANSACTION_MODE_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
];

const TRANSACTION_TYPE_STYLES: Record<string, string> = {
  Deposit: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  Withdrawal: "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
  Transfer: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  "Opening Balance": "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  "Loan Repayment": "bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800",
  "Membership Fee": "bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800",
  "Shares Purchase": "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
};

export default function ClientSavingsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const { data, formatMoney } = useClientSession();
  const currentClient = data?.client;
  const institution = data?.institution;
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("savings");
  const { toast } = useToast();

  const [accountLoading, setAccountLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBalance, setShowBalance] = useState(false);
  const [account, setAccount] = useState<SavingsAccount | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [txRowsPerPage, setTxRowsPerPage] = useState(10);
  const [activeTxQueryParams, setActiveTxQueryParams] = useState<
    Record<string, unknown>
  >({});
  const [activeTxFilters, setActiveTxFilters] = useState<
    Record<string, string>
  >({});
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const serializeQueryParams = (value: Record<string, unknown>) => {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return JSON.stringify(entries);
  };

  const loadAccountDetails = async (
    queryParams?: Record<string, unknown>,
    pageOverride?: number,
    rowsPerPageOverride?: number,
  ) => {
    const isInitialLoad = accountLoading && !account;
    if (isInitialLoad) {
      setAccountLoading(true);
    } else {
      setTransactionsLoading(true);
    }
    setError(null);
    try {
      const qParams = new URLSearchParams();
      const currentParams = (
        queryParams !== undefined ? queryParams : activeTxQueryParams
      ) as Record<string, unknown>;

      if (currentParams) {
        Object.entries(currentParams).forEach(([key, value]) => {
          if (
            value &&
            typeof value === "object" &&
            "start" in (value as Record<string, unknown>) &&
            "end" in (value as Record<string, unknown>)
          ) {
            const range = value as { start?: string; end?: string };
            if (key === "date" || key === "open_date") {
              if (range.start) qParams.set("dateStart", range.start);
              if (range.end) qParams.set("dateEnd", range.end);
            } else {
              if (range.start) qParams.set(`${key}Start`, range.start);
              if (range.end) qParams.set(`${key}End`, range.end);
            }
            return;
          }
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            qParams.set(key, String(value));
          }
        });
      }

      const requestPage =
        typeof pageOverride === "number" ? pageOverride : txPage;
      const requestRows =
        typeof rowsPerPageOverride === "number"
          ? rowsPerPageOverride
          : txRowsPerPage;
      qParams.set("page", String(requestPage + 1));
      qParams.set("pageSize", String(requestRows));

      const res = await fetch(
        `/api/client/savings/${encodeURIComponent(accountId)}?${qParams.toString()}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load savings account details");
      }
      setAccount(body.account || null);
      setTransactions(body.transactions || []);
      setTxTotal(Number(body?.transactionPagination?.total || 0));
    } catch (e: any) {
      setError(e?.message || "Failed to load savings account details");
    } finally {
      if (isInitialLoad) {
        setAccountLoading(false);
      }
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled || guardLoading || !accountId) return;
    void loadAccountDetails();
  }, [accountId, enabled, guardLoading]);

  const handleTransactionQueryParamsChange = useCallback(
    (params: object) => {
      const next = params as Record<string, unknown>;
      const sameQuery =
        serializeQueryParams(next) === serializeQueryParams(activeTxQueryParams);
      if (sameQuery) return;
      setTxPage(0);
      setActiveTxQueryParams(next);
      const flat: Record<string, string> = {};
      Object.entries(next).forEach(([k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "start" in (v as Record<string, unknown>) &&
          "end" in (v as Record<string, unknown>)
        ) {
          const range = v as { start?: string; end?: string };
          if (k === "date" || k === "open_date") {
            if (range.start) flat["dateStart"] = range.start;
            if (range.end) flat["dateEnd"] = range.end;
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
      setActiveTxFilters(flat);
      void loadAccountDetails(next, 0, txRowsPerPage);
    },
    [activeTxQueryParams, txRowsPerPage],
  );

  const handleTransactionPageChange = (_: unknown, newPage: number) => {
    setTxPage(newPage);
    void loadAccountDetails(activeTxQueryParams, newPage, txRowsPerPage);
  };

  const handleTransactionRowsPerPageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const next = parseInt(e.target.value, 10);
    setTxRowsPerPage(next);
    setTxPage(0);
    void loadAccountDetails(activeTxQueryParams, 0, next);
  };

  const downloadExport = async (format: "excel" | "pdf") => {
    setExporting(format);
    try {
      const q = new URLSearchParams();
      Object.entries(activeTxFilters).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      q.set("format", format);
      q.set("accountId", accountId);

      const res = await fetch(
        `/api/client/transactions/export?${q.toString()}`,
        { method: "GET" },
      );
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
        `statement-${account?.account_number || accountId}-${new Date()
          .toISOString()
          .slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded statement for account ${account?.account_number || ""}.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: `Download ${format.toUpperCase()} failed`,
        description: String(
          e?.message || `Failed to download ${format.toUpperCase()}.`,
        ),
      });
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getAccountTypeColor = (type?: string) => {
    switch (type) {
      case "Voluntary":
        return "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
      case "Fixed":
        return "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800";
      case "Shares":
        return "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800";
      case "Current":
        return "bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800";
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const getStatusColor = (status?: string) => {
    const s = String(status || "").toLowerCase();
    switch (s) {
      case "active":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
      case "inactive":
        return "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      case "suspended":
        return "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
      case "closed":
        return "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const transactionColumns: DataTableColumn<TransactionRow>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <span>{row.date ? formatDate(row.date) : "—"}</span>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => {
          const isDebit =
            row.type === "Withdrawal" ||
            row.type === "Transfer" ||
            row.type === "Loan Repayment";
          return (
            <div className="flex items-center">
              {isDebit ? (
                <ArrowUpDown className="h-4 w-4 text-rose-600 mr-2 shrink-0" />
              ) : (
                <TrendingUp className="h-4 w-4 text-emerald-600 mr-2 shrink-0" />
              )}
              <Badge
                className={cn(
                  "text-[11px] font-medium",
                  TRANSACTION_TYPE_STYLES[row.type] ||
                    "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300",
                )}
              >
                {row.type}
              </Badge>
            </div>
          );
        },
      },
      {
        key: "amount",
        header: "Amount",
        render: (row) => {
          const isCredit =
            row.type === "Deposit" ||
            row.type === "Opening Balance" ||
            row.type === "Shares Purchase";
          return (
            <span
              className={cn(
                "font-semibold text-xs font-mono",
                isCredit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {isCredit ? "+" : "−"}
              {showBalance ? formatMoney(Number(row.amount || 0)) : "••••••"}
            </span>
          );
        },
      },
      {
        key: "mode",
        header: "Mode",
        render: (row) => (
          <span className="text-xs text-muted-foreground font-medium">
            {row.mode || "System"}
          </span>
        ),
      },
      {
        key: "description",
        header: "Description",
        render: (row) => (
          <span className="inline-block max-w-xs truncate text-xs text-muted-foreground">
            {row.description || "—"}
          </span>
        ),
      },
      {
        key: "balance",
        header: "Running Balance",
        render: (row) => (
          <span className="font-semibold text-xs font-mono text-foreground">
            {showBalance
              ? formatMoney(Number(row.balance || 0))
              : "••••••"}
          </span>
        ),
      },
    ],
    [formatMoney, showBalance],
  );

  const transactionFilterFields: FilterField[] = useMemo(
    () => [
      {
        field: "type",
        label: "Type",
        type: "select",
        options: TRANSACTION_TYPE_OPTIONS,
      },
      {
        field: "mode",
        label: "Mode",
        type: "select",
        multiple: true,
        options: TRANSACTION_MODE_OPTIONS,
      },
      {
        field: "date",
        label: "Transaction Date Range",
        type: "date-range",
      },
    ],
    [],
  );

  if (accountLoading || guardLoading || !enabled) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="flex items-center space-x-4">
          <div className="h-9 w-9 bg-muted rounded-lg" />
          <div className="space-y-2">
            <div className="h-7 w-64 bg-muted rounded" />
            <div className="h-4 w-96 bg-muted rounded" />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-56 bg-muted rounded-xl" />
          <div className="h-56 bg-muted rounded-xl" />
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="w-full space-y-6 text-center py-12">
        <PiggyBank className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-2xl font-bold">Account Not Found</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {error || "The requested savings account could not be found or has been moved."}
        </p>
        <Link href="/client-portal/savings">
          <Button className="mt-4 cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Savings
          </Button>
        </Link>
      </div>
    );
  }

  const masked = "••••••";
  const accountAgeMonths = account.open_date
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(account.open_date).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ),
      )
    : 0;

  const reservedBalance =
    Number(account.total_balance || 0) - Number(account.available_balance || 0);

  return (
    <motion.div
      className="w-full space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/client-portal/savings">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg cursor-pointer"
              title="Back to Savings"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <PiggyBank className="h-5 w-5 text-[#f08c2b]" />
              <h1 className="text-2xl font-bold tracking-tight">
                Account Details - {account.account_number}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete account information and transaction ledger for{" "}
              {account.client_name || currentClient?.fullName || "Member"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              "px-2.5 py-1 text-xs font-semibold border",
              getStatusColor(account.status),
            )}
          >
            {account.status}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBalance((v) => !v)}
            className="gap-2 cursor-pointer"
            aria-label={showBalance ? "Hide balances" : "Show balances"}
          >
            {showBalance ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            <span className="text-xs">{showBalance ? "Hide" : "Show"}</span>
          </Button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {showBalance
                ? formatMoney(Number(account.available_balance || 0))
                : masked}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Ready for immediate withdrawals & transfers
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground font-mono">
              {showBalance
                ? formatMoney(Number(account.total_balance || 0))
                : masked}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Includes locked deposit terms & reserved funds
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account Age
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground flex items-center gap-1.5">
              <span>
                {accountAgeMonths > 0
                  ? `${accountAgeMonths} months`
                  : "First month"}
              </span>
              <Sparkles className="h-4 w-4 text-[#f08c2b]" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Opened on {formatDate(account.open_date)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Account & Member Information Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Account Information */}
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
            <PiggyBank className="h-4.5 w-4.5 text-[#f08c2b]" />
            <CardTitle className="text-sm font-semibold">
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label>Account Number</Label>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                {account.account_number}
              </p>
            </div>
            <div>
              <Label>Account Type</Label>
              <div className="mt-1">
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                    getAccountTypeColor(account.account_type),
                  )}
                >
                  {account.account_type}
                </span>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <div className="mt-1">
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                    getStatusColor(account.status),
                  )}
                >
                  {account.status}
                </span>
              </div>
            </div>
            <div>
              <Label>Opening Date</Label>
              <p className="text-sm font-medium text-foreground mt-0.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(account.open_date)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Member Information */}
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
            <User className="h-4.5 w-4.5 text-[#f08c2b]" />
            <CardTitle className="text-sm font-semibold">
              Member & Sacco Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label>Member Name</Label>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {account.client_name || currentClient?.fullName || "Member"}
              </p>
            </div>
            <div>
              <Label>Member ID</Label>
              <p className="text-sm font-mono text-muted-foreground mt-0.5">
                {account.client_number || currentClient?.id || "—"}
              </p>
            </div>
            <div>
              <Label>Account Summary Breakdown</Label>
              <div className="text-xs space-y-1.5 mt-1.5 bg-muted/30 p-3 rounded-lg border border-border/50">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {showBalance
                      ? formatMoney(Number(account.available_balance || 0))
                      : masked}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reserved / In-Transit:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {showBalance ? formatMoney(reservedBalance) : masked}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History DataTable */}
      <DataTable<TransactionRow>
        columns={transactionColumns}
        rows={transactions}
        loading={transactionsLoading}
        title="Transaction History"
        filterFields={transactionFilterFields}
        onQueryParamsChange={handleTransactionQueryParamsChange}
        emptyMessage="No transactions found for this account matching the filter criteria."
        getRowId={(row) => row.id}
        pagination={{
          page: txPage,
          rowsPerPage: txRowsPerPage,
          total: txTotal,
          onPageChange: handleTransactionPageChange,
          onRowsPerPageChange: handleTransactionRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled:
            transactionsLoading || txTotal === 0 || exporting !== null,
          pdfDisabled:
            transactionsLoading || txTotal === 0 || exporting !== null,
          excelLoading: exporting === "excel",
          pdfLoading: exporting === "pdf",
        }}
      />
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </span>
  );
}
