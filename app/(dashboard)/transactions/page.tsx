"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import {
  Plus,
  Eye,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Calendar,
  CreditCard,
  Banknote,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tooltip from "@mui/material/Tooltip";
import DataTable from "@/components/datatables/DataTable";
import { DataTableColumn } from "@/components/datatables/DataTable";
import { FilterField } from "@/components/datatables/TableFilter";
import { ActionButtons } from "@/components/datatables/ActionButtons";
import { useToast } from "@/components/ui/toast";
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter";
import { downloadTransactionsExport } from "./export/export";
import AddTransactionModal from "./components/add/new";

type TransactionRow = {
  id: string;
  transaction_number: string;
  memberName: string;
  description: string;
  amount: number;
  mode: string;
  date: string;
  type: string;
  balance: number;
  accountNumber: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TransactionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeQueryParams, setActiveQueryParams] = useState<
    Record<string, unknown>
  >({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [txPermissions, setTxPermissions] = useState({
    viewTransactions: false,
    createTransaction: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  });
  const permissionToastShown = useRef(false);

  const onPageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    void loadTransactions(activeQueryParams, newPage, rowsPerPage);
  };
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10);
    setPage(0);
    setRowsPerPage(next);
    void loadTransactions(activeQueryParams, 0, next);
  };

  async function loadTransactions(
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
      const requestPage =
        typeof pageOverride === "number" ? pageOverride : page;
      const requestRows =
        typeof rowsPerPageOverride === "number"
          ? rowsPerPageOverride
          : rowsPerPage;
      params.set("page", String(requestPage + 1));
      params.set("pageSize", String(requestRows));
      const res = await fetch(
        `/api/institution/transactions?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        if (
          res.status === 403 &&
          data?.error === "missing_permission:view_transactions"
        ) {
          throw new Error("missing_permission:view_transactions");
        }
        throw new Error(data.error || "Failed to load transactions");
      }
      setTransactions(data.items || []);
      setRecentTransactions(data.recentTransactions || []);
      setTotal(data.total || 0);
      permissionToastShown.current = false;
    } catch (e: any) {
      const message = e?.message || "Failed to load transactions";
      if (message === "missing_permission:view_transactions") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view transactions.",
          });
          permissionToastShown.current = true;
        }
        setError("");
      } else {
        setError(message);
        toast({
          variant: "destructive",
          title: "Failed to load transactions",
          description: message,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactionPermissions() {
    try {
      const res = await fetch("/api/institution/transactions/permissions", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        permissions?: {
          viewTransactions?: boolean;
          createTransaction?: boolean;
          isSuperAdmin?: boolean;
          branches?: Array<{ id: string; name: string }>;
        };
      };
      setTxPermissions({
        viewTransactions: !!data.permissions?.viewTransactions,
        createTransaction: !!data.permissions?.createTransaction,
        isSuperAdmin: !!data.permissions?.isSuperAdmin,
        branches: (data.permissions?.branches || []).map((b) => ({
          value: b.id,
          label: b.name,
        })),
      });
    } catch {
      // keep defaults
    }
  }

  useEffect(() => {
    loadTransactionPermissions();
    loadTransactions();
  }, []);

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
        if (v !== undefined && v !== null && String(v).trim() !== "")
          flat[k] = String(v);
      });
      setActiveFilters(flat);
      void loadTransactions(params, 0, rowsPerPage);
    },
    [rowsPerPage],
  );

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!txPermissions.viewTransactions) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export transactions.",
      });
      return;
    }
    setExporting(format);
    try {
      await downloadTransactionsExport(activeFilters, format);
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded transactions ${format.toUpperCase()} report.`,
      });
    } catch (e: any) {
      const message = String(e?.message || "");
      if (message === "missing_permission:view_transactions") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export transactions.",
        });
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

  const handleView = (row: TransactionRow) => {
    router.push(`/transactions/${row.id}`);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "Deposit":
      case "Loan Disbursement":
      case "Opening Balance":
      case "Shares Purchase":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "Withdrawal":
      case "Loan Repayment":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <ArrowUpDown className="h-4 w-4 text-blue-600" />;
    }
  };

  // Calculate statistics
  const totalTransactions = transactions.length;
  const totalDeposits = transactions.filter(
    (t) => t.type === "Deposit" || t.type === "Shares Purchase",
  ).length;
  const totalWithdrawals = transactions.filter(
    (t) => t.type === "Withdrawal",
  ).length;
  const totalLoanTransactions = transactions.filter((t) =>
    t.type.includes("Loan"),
  ).length;

  const totalDepositAmount = transactions
    .filter(
      (t) =>
        t.type === "Deposit" ||
        t.type === "Loan Disbursement" ||
        t.type === "Opening Balance" ||
        t.type === "Shares Purchase",
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalWithdrawalAmount = transactions
    .filter((t) => t.type === "Withdrawal" || t.type === "Loan Repayment")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const netCashFlow = totalDepositAmount - totalWithdrawalAmount;

  // DataTable columns
  const columns: DataTableColumn<TransactionRow>[] = [
    {
      key: "transaction_number",
      header: "Transaction ID",
      render: (row) => (
        <div className="font-medium">{row.transaction_number || row.id}</div>
      ),
    },
    {
      key: "memberName",
      header: "Assigned to",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-linear-to-br from-primary/80 to-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {getInitials(row.memberName)}
            </span>
          </div>
          <div className="font-medium text-sm">{row.memberName || "—"}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => {
        const typeStyles: Record<string, string> = {
          Deposit: "bg-green-100 text-green-700 border border-green-200",
          Withdrawal: "bg-red-100 text-red-700 border border-red-200",
          "Loan Disbursement":
            "bg-blue-100 text-blue-700 border border-blue-200",
          "Loan Repayment":
            "bg-purple-100 text-purple-700 border border-purple-200",
          "Fee Payment":
            "bg-orange-100 text-orange-700 border border-orange-200",
          Transfer: "bg-gray-100 text-gray-700 border border-gray-200",
          "Interest Payment":
            "bg-yellow-100 text-yellow-700 border border-yellow-200",
          "Opening Balance": "bg-teal-100 text-teal-700 border border-teal-200",
          "Shares Purchase":
            "bg-emerald-100 text-emerald-700 border border-emerald-200",
        };
        return (
          <div className="flex items-center space-x-2">
            {getTransactionIcon(row.type)}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeStyles[row.type] || "bg-gray-100 text-gray-700 border border-gray-200"}`}
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
      render: (row) => (
        <div className="font-medium">{formatCurrency(Number(row.amount))}</div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (row) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
          {row.mode}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <div className="text-sm">
            {new Date(row.date).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row) => (
        <div>
          <div className="font-medium">
            {formatCurrency(Number(row.balance))}
          </div>
          {row.type === "Fee Payment" && (
            <div className="text-xs text-muted-foreground">Remaining</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex justify-center">
          <ActionButtons actions={actions} row={row} />
        </div>
      ),
    },
  ];

  const actions = [
    {
      label: "View",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4" />,
      disabled: !txPermissions.viewTransactions,
    },
  ];

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
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
    ];

    return withBranchFilterFirst(fields, {
      isSuperAdmin: txPermissions.isSuperAdmin,
      branchOptions: txPermissions.branches,
    });
  }, [txPermissions.isSuperAdmin, txPermissions.branches]);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-balance">
              Transaction Management
            </h2>
            <p className="text-muted-foreground text-pretty">
              Monitor all financial transactions, deposits, withdrawals, and
              loan activities.
            </p>
          </div>
          {txPermissions.createTransaction ? (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Transaction
            </Button>
          ) : (
            <Tooltip
              title="Missing create_transaction permission"
              placement="top"
              arrow
            >
              <span className="inline-block cursor-not-allowed">
                <Button disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Transaction
                </Button>
              </span>
            </Tooltip>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Total Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTransactions}</div>
              <p className="text-xs text-muted-foreground">
                {totalLoanTransactions} loan-related
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Deposits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDeposits}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totalDepositAmount).replace("UGX", "UGX ")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Withdrawals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWithdrawals}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totalWithdrawalAmount).replace("UGX", "UGX ")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Net Cash Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(netCashFlow).replace("UGX", "UGX ")}
              </div>
              <Progress value={netCashFlow > 0 ? 75 : 25} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {error && (
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription className="text-destructive">
                {error}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex items-start gap-6">
          {/* Transactions DataTable - expands when sidebar is collapsed */}
          <div className="min-w-0 flex-1 space-y-6">
            {!sidebarOpen && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  className="gap-2"
                >
                  <PanelRightOpen className="h-4 w-4" />
                  Recent Activity
                </Button>
              </div>
            )}

            <DataTable<TransactionRow>
              columns={columns}
              rows={transactions}
              loading={loading}
              title={`All Transactions (${transactions.length}${total > transactions.length ? ` of ${total}` : ""})`}
              filterFields={filterFields}
              onQueryParamsChange={handleQueryParamsChange}
              emptyMessage="No transactions found"
              getRowId={(row) => row.id}
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
                excelDisabled: loading || total === 0 || exporting !== null,
                pdfDisabled: loading || total === 0 || exporting !== null,
              }}
            />
          </div>

          {/* Recent Activity - Collapsible sidebar */}
          <div
            className="shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
            style={{
              width: sidebarOpen ? "33.333%" : "0px",
              maxHeight: sidebarOpen ? "none" : "0px",
              opacity: sidebarOpen ? 1 : 0,
            }}
          >
            <Card className="flex flex-col" style={{ maxHeight: "34rem" }}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 shrink-0">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest transactions</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setSidebarOpen(false)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {recentTransactions.map((transaction: any) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        {getTransactionIcon(transaction.type)}
                        <div>
                          <div className="text-sm font-medium">
                            {transaction.memberName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {transaction.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatCurrency(transaction.amount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <AddTransactionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => void loadTransactions(activeQueryParams, page, rowsPerPage)}
      />
    </>
  );
}
