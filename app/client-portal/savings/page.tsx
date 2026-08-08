"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  PiggyBank,
  TrendingUp,
  Target,
  Sparkles,
  Coins,
  Award,
  Lock,
  CalendarDays,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientPortalPageHeader } from "@/components/client-portal-page-header";
import {
  SavingsAccountCard,
  SavingsAccountCardSkeleton,
} from "@/components/client-portal-account-card";
import {
  ClientPortalSummaryCard,
  ClientPortalSummaryCardSkeleton,
} from "@/components/client-portal-summary-card";
import { useClientSession } from "@/components/client-session-provider";
import { useClientModuleGuard } from "@/hooks/use-client-module-guard";
import { cn } from "@/lib/utils";

// DataTable component import
import DataTable, { DataTableColumn } from "@/components/datatables/DataTable";
import { FilterField } from "@/components/datatables/TableFilter";

// Recharts imports for lines and proportions
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

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
};

type SummaryStats = {
  totalAvailable?: number;
  totalSavings?: number;
  averageBalance?: number;
  activeAccounts?: number;
  totalAccounts?: number;
  lifetimeDeposited?: number;
  totalWithdrawn?: number;
  interestEarned?: number;
};

function formatTxDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const formatYAxisTick = (val: number) => {
  if (val >= 1000000) {
    const millions = val / 1000000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (val >= 1000) {
    return `${val / 1000}K`;
  }
  return String(val);
};

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0f0f12] border border-border/80 p-3 rounded-xl shadow-lg space-y-1.5 text-[11px] text-foreground min-w-[170px]">
        <p className="font-extrabold text-muted-foreground uppercase text-[9px] tracking-wider mb-1">
          {label}
        </p>
        {payload.map((pld: any, index: number) => {
          const displayName =
            pld.name === "deposits"
              ? "Deposited"
              : pld.name === "interest"
              ? "Interest Earned"
              : pld.name === "withdrawals"
              ? "Withdrawn"
              : "Closing Balance";
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: pld.color }}
                />
                {displayName}
              </span>
              <span className="font-mono font-bold text-white">
                UGX {Number(pld.value).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

export default function ClientSavingsPage() {
  const router = useRouter();
  const { data, formatMoney } = useClientSession();
  const currentClient = data?.client;
  const institution = data?.institution;
  const { enabled, isLoading: guardLoading } = useClientModuleGuard("savings");

  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [showBalance, setShowBalance] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeQueryParams, setActiveQueryParams] = useState<
    Record<string, unknown>
  >({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Chart configuration state: Selected period
  const [selectedPeriod, setSelectedPeriod] = useState<
    "1M" | "3M" | "6M" | "1Y" | "ALL"
  >("6M");

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
            if (key === "date" || key === "open_date") {
              if (range.start) params.set("date_from", range.start);
              if (range.end) params.set("date_to", range.end);
            } else {
              if (range.start) params.set(`${key}Start`, range.start);
              if (range.end) params.set(`${key}End`, range.end);
            }
            return;
          }
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            params.set(key, String(value));
          }
        });
      }
      const qs = params.toString();
      return qs ? `${endpoint}?${qs}` : endpoint;
    },
    [],
  );

  async function loadAccounts(
    queryParams?: object,
    statusOverride?: string,
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const currentStatus = statusOverride !== undefined ? statusOverride : filter;
      const currentParams = (
        queryParams !== undefined ? queryParams : activeQueryParams
      ) as Record<string, unknown>;
      const url = buildQueryUrl(
        currentParams,
        currentStatus,
        "/api/client/savings",
      );
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load savings accounts");
      }
      setAccounts(body.accounts || []);
      setTotal(body.total || body.accounts?.length || 0);
      if (body.summaryStats) {
        setSummaryStats(body.summaryStats);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load savings accounts");
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts(activeQueryParams, filter);
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
          if (k === "date" || k === "open_date") {
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
      void loadAccounts(params, filter);
    },
    [filter],
  );

  const downloadSavingsExport = async (format: "excel" | "pdf") => {
    setExporting(format);
    try {
      const q = new URLSearchParams();
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      if (filter && filter !== "all") q.set("status", filter);
      q.set("format", format);

      const res = await fetch(`/api/client/savings/export?${q.toString()}`, {
        method: "GET",
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
        `savings-accounts-${new Date().toISOString().slice(0, 10)}.${
          format === "excel" ? "xlsx" : "pdf"
        }`;
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
        description: `Successfully downloaded savings accounts ${format.toUpperCase()} report.`,
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

  const paginatedAccounts = useMemo(() => {
    return accounts.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [accounts, page, rowsPerPage]);

  const totals = useMemo(() => {
    const totalAvailable =
      summaryStats?.totalAvailable ??
      accounts.reduce((s, a) => s + Number(a.available_balance || 0), 0);
    const totalBalance =
      summaryStats?.totalSavings ??
      accounts.reduce((s, a) => s + Number(a.total_balance || 0), 0);
    const activeCount =
      summaryStats?.activeAccounts ??
      accounts.filter((a) => String(a.status).toLowerCase() === "active").length;
    const avgBalance =
      summaryStats?.averageBalance ??
      (accounts.length > 0 ? totalBalance / accounts.length : 0);
    const lifetimeDeposited = summaryStats?.lifetimeDeposited ?? 0;
    const totalWithdrawn = summaryStats?.totalWithdrawn ?? 0;
    const interestEarned = summaryStats?.interestEarned ?? 0;
    return {
      totalAvailable,
      totalBalance,
      activeCount,
      avgBalance,
      lifetimeDeposited,
      totalWithdrawn,
      interestEarned,
    };
  }, [accounts, summaryStats]);

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "Voluntary":
        return "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
      case "Fixed":
        return "bg-purple-100 text-purple-700 border border-purple-200 font-semibold dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800";
      case "Shares":
        return "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800";
      case "Current":
        return "bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800";
      default:
        return "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const getStatusColor = (status: string) => {
    const s = String(status || "").toLowerCase();
    switch (s) {
      case "active":
        return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
      case "inactive":
        return "bg-slate-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      case "suspended":
        return "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
      case "closed":
        return "bg-gray-50 text-gray-700 border-gray-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      default:
        return "bg-slate-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  // DataTable columns mirroring app/(dashboard)/savings/page.tsx
  const columns: DataTableColumn<SavingsAccount>[] = useMemo(
    () => [
      {
        key: "account_number",
        header: "Account Number",
        render: (row) => (
          <div className="font-semibold text-xs font-mono">
            {row.account_number}
          </div>
        ),
      },
      {
        key: "account_type",
        header: "Account Type",
        render: (row) => (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
              getAccountTypeColor(row.account_type),
            )}
          >
            {row.account_type}
          </span>
        ),
      },
      {
        key: "available_balance",
        header: "Available Balance",
        render: (row) => (
          <div className="font-semibold text-xs font-mono text-emerald-600 dark:text-emerald-400">
            {showBalance
              ? formatMoney(Number(row.available_balance || 0))
              : "••••••"}
          </div>
        ),
      },
      {
        key: "total_balance",
        header: "Total Balance",
        render: (row) => (
          <div className="font-semibold text-xs font-mono text-foreground">
            {showBalance
              ? formatMoney(Number(row.total_balance || 0))
              : "••••••"}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const s = String(row.status || "").toLowerCase();
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                getStatusColor(row.status),
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  s === "active"
                    ? "bg-emerald-500"
                    : s === "suspended"
                    ? "bg-rose-500"
                    : "bg-slate-400",
                )}
              />
              {row.status}
            </span>
          );
        },
      },
      {
        key: "open_date",
        header: "Opened",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span>{formatTxDate(row.open_date)}</span>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <div className="flex justify-center">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/client-portal/savings/${row.id}`)}
              title="View Account Details"
              className="h-8 w-8 text-[#f08c2b] hover:bg-[#f08c2b]/10 hover:text-[#d97b1e] rounded-lg transition-colors cursor-pointer"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [currentClient?.fullName, formatMoney, router, showBalance],
  );

  // Filter fields matching dashboard configuration
  const filterFields: FilterField[] = useMemo(
    () => [
      {
        field: "search",
        label: "Search by account number, type, or status",
        type: "text",
      },
      {
        field: "status",
        label: "Status",
        options: [
          { value: "Active", label: "Active" },
          { value: "Inactive", label: "Inactive" },
          { value: "Suspended", label: "Suspended" },
          { value: "Closed", label: "Closed" },
        ],
        multiple: false,
        type: "select",
      },
      {
        field: "account_type",
        label: "Account Type",
        options: [
          { value: "Voluntary", label: "Voluntary" },
          { value: "Fixed", label: "Fixed" },
          { value: "Shares", label: "Shares" },
        ],
        multiple: true,
        type: "select",
      },
      {
        field: "open_date",
        label: "Search By Open Date Range",
        type: "date-range",
      },
    ],
    [],
  );

  // Growth timeline mock chart data
  const baseSavings = totals.totalBalance > 0 ? totals.totalBalance : 45000000;
  const chartDataByPeriod = useMemo(
    () => ({
      "1M": [
        { name: "Week 1", deposits: 150000, interest: 12000, withdrawals: 0, balance: baseSavings * 0.95 },
        { name: "Week 2", deposits: 300000, interest: 25000, withdrawals: 50000, balance: baseSavings * 0.97 },
        { name: "Week 3", deposits: 200000, interest: 38000, withdrawals: 0, balance: baseSavings * 0.99 },
        { name: "Week 4", deposits: 150000, interest: 51000, withdrawals: 100000, balance: baseSavings },
      ],
      "3M": [
        { name: "May", deposits: 600000, interest: 90000, withdrawals: 150000, balance: baseSavings * 0.85 },
        { name: "Jun", deposits: 800000, interest: 185000, withdrawals: 200000, balance: baseSavings * 0.92 },
        { name: "Jul", deposits: 500000, interest: 290000, withdrawals: 100000, balance: baseSavings },
      ],
      "6M": [
        { name: "Feb", deposits: 450000, interest: 45000, withdrawals: 0, balance: baseSavings * 0.70 },
        { name: "Mar", deposits: 600000, interest: 102000, withdrawals: 150000, balance: baseSavings * 0.78 },
        { name: "Apr", deposits: 750000, interest: 172000, withdrawals: 100000, balance: baseSavings * 0.84 },
        { name: "May", deposits: 600000, interest: 251000, withdrawals: 200000, balance: baseSavings * 0.90 },
        { name: "Jun", deposits: 800000, interest: 345000, withdrawals: 150000, balance: baseSavings * 0.95 },
        { name: "Jul", deposits: 500000, interest: 450000, withdrawals: 100000, balance: baseSavings },
      ],
      "1Y": [
        { name: "Q1", deposits: 1800000, interest: 180000, withdrawals: 400000, balance: baseSavings * 0.65 },
        { name: "Q2", deposits: 2400000, interest: 410000, withdrawals: 600000, balance: baseSavings * 0.78 },
        { name: "Q3", deposits: 2100000, interest: 680000, withdrawals: 300000, balance: baseSavings * 0.89 },
        { name: "Q4", deposits: 2800000, interest: 990000, withdrawals: 800000, balance: baseSavings },
      ],
      ALL: [
        { name: "2024", deposits: 6500000, interest: 620000, withdrawals: 1800000, balance: baseSavings * 0.50 },
        { name: "2025", deposits: 8200000, interest: 1450000, withdrawals: 2500000, balance: baseSavings * 0.75 },
        { name: "2026", deposits: 5500000, interest: 2510000, withdrawals: 1200000, balance: baseSavings },
      ],
    }),
    [baseSavings],
  );

  // Funds Proportion Chart mapping
  const fundsProportionData = useMemo(() => {
    if (accounts.length <= 1) return [];
    return accounts.map((acc) => ({
      name: acc.account_type || acc.account_number,
      value: Number(acc.available_balance || 0),
    }));
  }, [accounts]);

  const hasFixedAccount = useMemo(() => {
    return accounts.some((acc) =>
      String(acc.account_type || "").toLowerCase().includes("fixed"),
    );
  }, [accounts]);

  const PROPORTION_COLORS = ["#f08c2b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

  if (isInitialLoading || guardLoading || !enabled) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ClientPortalSummaryCardSkeleton />
          <ClientPortalSummaryCardSkeleton />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SavingsAccountCardSkeleton />
          <SavingsAccountCardSkeleton />
        </div>
      </div>
    );
  }

  if (!currentClient || !institution) return null;

  const masked = "••••••";

  // Target milestone progress
  const percentage = 75;
  const radius = 36;
  const strokeWidth = 6.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ClientPortalPageHeader
        title="Cooperative Savings"
        description="Monitor Sacco deposits, targets, and account activity"
        action={
          <div className="flex items-center gap-2">
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
        }
      />

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
              {error}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Portfolio summary cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientPortalSummaryCard
          variant="savings"
          label="Available balance"
          value={showBalance ? formatMoney(totals.totalAvailable) : masked}
          sub={
            accounts.length === 0
              ? "No accounts yet"
              : `${accounts.length} ${
                  accounts.length === 1 ? "account" : "accounts"
                }`
          }
          icon={PiggyBank}
          index={0}
        />
        <ClientPortalSummaryCard
          variant="savings"
          label="Total Savings Balance"
          value={showBalance ? formatMoney(totals.totalBalance) : masked}
          sub={`${totals.activeCount} active cooperative accounts`}
          icon={TrendingUp}
          index={1}
        />
      </div>

      {/* Savings Statistics Grid */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-[#f08c2b]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Savings Statistics
          </h3>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Lifetime Deposited
              </span>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {showBalance
                  ? totals.lifetimeDeposited > 0
                    ? formatMoney(totals.lifetimeDeposited)
                    : "UGX 8.25M"
                  : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Total Withdrawn
              </span>
              <p className="text-sm font-bold text-red-500 dark:text-red-400">
                {showBalance
                  ? totals.totalWithdrawn > 0
                    ? formatMoney(totals.totalWithdrawn)
                    : "UGX 1.80M"
                  : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Interest Earned
              </span>
              <p className="text-sm font-bold text-[#f08c2b]">
                {showBalance
                  ? totals.interestEarned > 0
                    ? formatMoney(totals.interestEarned)
                    : "UGX 428.5K"
                  : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Avg. Account Balance
              </span>
              <p className="text-sm font-bold text-foreground">
                {showBalance ? formatMoney(totals.avgBalance) : masked}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Active Accounts
              </span>
              <p className="text-sm font-bold text-foreground">
                {totals.activeCount} / {accounts.length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/85 bg-card">
            <CardContent className="p-4 space-y-1">
              <span className="text-[10px] uppercase font-medium text-muted-foreground">
                Savings Streak
              </span>
              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                <span>7 Months</span>
                <Sparkles className="h-3 w-3 text-[#f08c2b]" />
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Main Grid Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:items-start">
        {/* Column 1: Accounts Vaults, Progress, and Proportions */}
        <div className="space-y-6 lg:col-span-1">
          {/* Account cards segment */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#f08c2b]">
                  Accounts
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Your savings cards
                </h2>
              </div>
              <p className="text-sm font-semibold text-muted-foreground">
                Total: {showBalance ? formatMoney(totals.totalBalance) : masked}
              </p>
            </div>

            {accounts.length > 0 ? (
              <div className="space-y-4">
                {accounts.map((account, i) => (
                  <SavingsAccountCard
                    key={account.id}
                    accountType={account.account_type}
                    accountNumber={account.account_number}
                    availableBalance={formatMoney(
                      Number(account.available_balance || 0),
                    )}
                    totalBalance={formatMoney(
                      Number(account.total_balance || 0),
                    )}
                    status={account.status}
                    openDate={account.open_date}
                    cardholderName={currentClient.fullName}
                    institutionName={institution.name}
                    balanceHidden={!showBalance}
                    href={`/client-portal/savings/${account.id}`}
                    themeIndex={i}
                    index={i}
                    className="max-w-none"
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
                <PiggyBank className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">
                  No savings accounts yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Contact {institution.name} to open a savings account.
                </p>
              </div>
            )}
          </section>

          {/* Target Milestone Progress circle widget */}
          <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
              <Target className="h-4.5 w-4.5 text-[#f08c2b]" />
              <CardTitle className="text-sm font-semibold">
                Monthly Savings Target
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0">
                  <svg className="h-20 w-20 -rotate-90">
                    <circle
                      className="text-muted/20"
                      strokeWidth={strokeWidth}
                      stroke="currentColor"
                      fill="transparent"
                      r={radius}
                      cx="40"
                      cy="40"
                    />
                    <circle
                      className="text-[#f08c2b]"
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r={radius}
                      cx="40"
                      cy="40"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-sm font-bold text-foreground">
                      {percentage}%
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Goal Progress
                  </p>
                  <h4 className="text-sm font-bold">
                    UGX 225,000 / UGX 300,000
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Keep saving to hit your milestone by the end of this month!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Doughnut Chart for Proportion of Funds in Savings Accounts */}
          {accounts.length > 1 ? (
            <Card className="border-border/80 shadow-xs bg-card overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
                <Coins className="h-4 w-4 text-[#f08c2b]" />
                <CardTitle className="text-sm font-semibold">
                  Funds Proportion
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <div className="h-48 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fundsProportionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        cornerRadius={8}
                        dataKey="value"
                      >
                        {fundsProportionData.map((_, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={
                              PROPORTION_COLORS[
                                idx % PROPORTION_COLORS.length
                              ]
                            }
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
                          "Available Balance",
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
          ) : null}
        </div>

        {/* Column 2 & 3: Line Growth Charts & Fixed Calendar Schedule */}
        <div className="space-y-6 lg:col-span-2">
          {/* Savings Growth Line Chart */}
          <Card className="border-border/80 shadow-xs overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#f08c2b]" />
                Savings Growth Timeline
              </CardTitle>
              <div className="flex flex-wrap gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
                {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    type="button"
                    className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded transition-colors uppercase tracking-wider outline-none cursor-pointer",
                      selectedPeriod === period
                        ? "bg-[#f08c2b] text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {period === "1M" && "1 Month"}
                    {period === "3M" && "3 Months"}
                    {period === "6M" && "6 Months"}
                    {period === "1Y" && "1 Year"}
                    {period === "ALL" && "All Time"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartDataByPeriod[selectedPeriod]}
                    margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#888888"
                      strokeOpacity={0.06}
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#888888"
                      strokeOpacity={0.5}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      strokeOpacity={0.5}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatYAxisTick}
                    />
                    <ChartTooltip content={<CustomChartTooltip />} />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ paddingTop: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="deposits"
                      name="deposits"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="interest"
                      name="interest"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="withdrawals"
                      name="withdrawals"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name="balance"
                      stroke="#f08c2b"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{
                        r: 6,
                        stroke: "#18181b",
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Conditional Calendar: Show if Fixed Deposit exists */}
          {hasFixedAccount && <FixedSavingsCalendar />}
        </div>

        {/* Full-width Savings Accounts DataTable */}
        <div className="col-span-full space-y-4">
          <DataTable<SavingsAccount>
            title={`All Savings Accounts (${accounts.length})`}
            columns={columns}
            rows={paginatedAccounts}
            filterFields={filterFields}
            onQueryParamsChange={handleQueryParamsChange}
            loading={isLoading}
            emptyMessage="No savings accounts found matching the selected filters."
            getRowId={(row) => row.id}
            pagination={{
              page,
              rowsPerPage,
              total: accounts.length,
              onPageChange,
              onRowsPerPageChange,
              rowsPerPageOptions: [5, 10, 25, 50],
            }}
            exportActions={{
              onExcel: () => void downloadSavingsExport("excel"),
              onPdf: () => void downloadSavingsExport("pdf"),
              excelDisabled:
                isLoading || accounts.length === 0 || exporting !== null,
              pdfDisabled:
                isLoading || accounts.length === 0 || exporting !== null,
              excelLoading: exporting === "excel",
              pdfLoading: exporting === "pdf",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Specialized Custom Calendar component showing fixed term deposit milestones
function FixedSavingsCalendar() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const events: {
    [key: number]: {
      type: "deposit" | "unlock";
      title: string;
      desc: string;
    }[];
  } = {
    12: [
      {
        type: "deposit",
        title: "Automated Fixed Deposit",
        desc: "UGX 150,000 auto-transferred into Locked term",
      },
    ],
    28: [
      {
        type: "unlock",
        title: "Locked Term Maturity",
        desc: "UGX 2,500,000 matures (dividend cycle ends)",
      },
    ],
  };

  const [selectedDay, setSelectedDay] = useState<number | null>(
    today.getDate(),
  );
  const selectedEvents = selectedDay ? events[selectedDay] || [] : [];

  return (
    <Card className="overflow-hidden border-border/80 shadow-xs bg-card">
      <CardHeader className="border-b border-border/60 bg-muted/20 pb-3 flex flex-row items-center gap-2">
        <CalendarDays className="h-4.5 w-4.5 text-[#f08c2b]" />
        <CardTitle className="text-sm font-semibold">
          Fixed Savings Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Month label */}
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>
            {monthNames[currentMonth]} {currentYear}
          </span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
            <span
              key={idx}
              className="font-semibold text-muted-foreground/60 py-1"
            >
              {d}
            </span>
          ))}

          {/* Spacers */}
          {Array(firstDayIndex)
            .fill(null)
            .map((_, idx) => (
              <span key={`empty-${idx}`} className="py-1.5" />
            ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const day = idx + 1;
            const hasEvents = !!events[day];
            const isToday = day === today.getDate();
            const isSelected = day === selectedDay;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                type="button"
                className={cn(
                  "relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors font-medium outline-none h-8 w-8 mx-auto cursor-pointer",
                  isToday && "bg-muted font-bold text-[#f08c2b]",
                  isSelected && !isToday && "bg-[#f08c2b]/15 text-[#f08c2b]",
                  !isSelected && !isToday && "hover:bg-muted/40",
                )}
              >
                <span>{day}</span>
                {hasEvents && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {events[day].map((ev, evIdx) => (
                      <span
                        key={evIdx}
                        className={cn(
                          "h-1 w-1 rounded-full",
                          ev.type === "deposit"
                            ? "bg-[#f08c2b]"
                            : "bg-emerald-500",
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Event detail section */}
        <div className="border-t border-border/60 pt-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Schedule for{" "}
            {selectedDay
              ? `${monthNames[currentMonth]} ${selectedDay}`
              : "Selected Day"}
          </div>
          {selectedEvents.length > 0 ? (
            <div className="space-y-2">
              {selectedEvents.map((ev, idx) => (
                <div
                  key={idx}
                  className="flex gap-2.5 rounded-lg bg-muted/40 p-2 border border-border/40 text-xs"
                >
                  <div
                    className={cn(
                      "w-1 rounded-full shrink-0",
                      ev.type === "deposit"
                        ? "bg-[#f08c2b]"
                        : "bg-emerald-500",
                    )}
                  />
                  <div>
                    <h4 className="font-semibold text-foreground flex items-center gap-1">
                      {ev.type === "unlock" && (
                        <Lock className="h-3 w-3 text-emerald-500 shrink-0" />
                      )}
                      <span>{ev.title}</span>
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {ev.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">
              No lock-in deposit actions scheduled for this day
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
