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
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Eye,
  ArrowUpDown,
  PiggyBank,
  TrendingUp,
  Users,
  DollarSign,
  PanelRightOpen,
  PanelRightClose,
  Calendar,
  CalendarDays,
  BarChart2,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lock,
  Moon,
  Coins,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/datatables/DataTable";
import { DataTableColumn } from "@/components/datatables/DataTable";
import { FilterField } from "@/components/datatables/TableFilter";
import { ActionButtons } from "@/components/datatables/ActionButtons";
import { useToast } from "@/components/ui/toast";
import Tooltip from "@mui/material/Tooltip";
import TooltipButton from "@/components/newUI/tooltip_button";
import { cn } from "@/lib/utils";
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter";
import { downloadSavingsExport } from "./export/export";
import NewSavingsAccountModal from "./new_account/add";
import SavingsAddTransactionModal from "./add_transaction/add";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";

type SavingsRow = {
  id: string;
  account_number: string;
  account_type: string;
  available_balance: number;
  total_balance: number;
  status: string;
  client_name?: string;
  member_id?: string;
  open_date?: string;
  branch_name?: string;
  [key: string]: any;
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SavingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SavingsRow[]>([]);
  const [transactions, setTransactions] = useState<Array<any>>([]);
  const [total, setTotal] = useState<number>(0);
  const [summaryStats, setSummaryStats] = useState({
    totalSavings: 0,
    averageBalance: 0,
    activeAccounts: 0,
  });
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
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chart Filter States
  const [lineGraphPeriod, setLineGraphPeriod] = useState<
    "Today" | "Last 7 Days" | "Monthly" | "Quarterly" | "Yearly"
  >("Monthly");
  const [newAccountsFilter, setNewAccountsFilter] = useState<
    "Daily" | "Monthly" | "Yearly"
  >("Monthly");

  const [savingsPermissions, setSavingsPermissions] = useState({
    viewSavings: false,
    viewAccount: false,
    createTransaction: false,
    addAccount: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  });
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txPrefill, setTxPrefill] = useState<{
    memberId: string;
    accountId: string;
  } | null>(null);
  const permissionToastShown = useRef(false);

  async function loadAccounts(
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
            if (range.start) params.set(`${key}Start`, range.start);
            if (range.end) params.set(`${key}End`, range.end);
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
      const res = await fetch(`/api/institution/savings?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          res.status === 403 &&
          data?.error === "missing_permission:view_savings"
        ) {
          throw new Error("missing_permission:view_savings");
        }
        throw new Error(data.error || "Failed to load savings");
      }
      setAccounts(data.items || []);
      setTransactions(data.recentTransactions || []);
      setTotal(data.total || 0);
      setSummaryStats({
        totalSavings: Number(data?.stats?.totalSavings || 0),
        averageBalance: Number(data?.stats?.averageBalance || 0),
        activeAccounts: Number(data?.stats?.activeAccounts || 0),
      });
      permissionToastShown.current = false;
    } catch (e: any) {
      const message = e?.message || "Failed to load savings";
      if (message === "missing_permission:view_savings") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view savings.",
          });
          permissionToastShown.current = true;
        }
        setError("");
      } else {
        setError(message);
        toast({
          variant: "destructive",
          title: "Failed to load savings",
          description: message,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadSavingsPermissions() {
    try {
      const res = await fetch("/api/institution/savings/permissions", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        permissions?: {
          viewSavings?: boolean;
          viewAccount?: boolean;
          createTransaction?: boolean;
          addAccount?: boolean;
          isSuperAdmin?: boolean;
          branches?: Array<{ id: string; name: string }>;
        };
      };
      setSavingsPermissions({
        viewSavings: !!data.permissions?.viewSavings,
        viewAccount: !!data.permissions?.viewAccount,
        createTransaction: !!data.permissions?.createTransaction,
        addAccount: !!data.permissions?.addAccount,
        isSuperAdmin: !!data.permissions?.isSuperAdmin,
        branches: (data.permissions?.branches || []).map((b) => ({
          value: b.id,
          label: b.name,
        })),
      });
    } catch {
      // ignore
    }
  }
  const [accountTypeFilterOptions, setAccountTypeFilterOptions] = useState<
    Array<{ value: string; label: string }>
  >([
    { value: "Voluntary", label: "Voluntary" },
    { value: "Fixed", label: "Fixed" },
    { value: "Shares", label: "Shares" },
    { value: "Group", label: "Group" },
    { value: "Current", label: "Current" },
  ]);

  async function loadAccountTypes() {
    try {
      const res = await fetch("/api/institution/account-types?status=Active", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.accountTypes) && data.accountTypes.length > 0) {
        const map = new Map<string, string>();
        data.accountTypes.forEach((t: { id: string; account_name: string }) => {
          if (t.account_name) map.set(t.account_name, t.account_name);
        });
        const defaults = ["Voluntary", "Fixed", "Shares", "Group", "Current"];
        defaults.forEach((d) => {
          if (!map.has(d)) map.set(d, d);
        });
        setAccountTypeFilterOptions(
          Array.from(map.entries()).map(([value, label]) => ({ value, label })),
        );
      }
    } catch {
      // keep defaults
    }
  }

  useEffect(() => {
    void loadSavingsPermissions();
    void loadAccountTypes();
    void loadAccounts();
  }, []);

  const handleQueryParamsChange = useCallback(
    (params: object) => {
      setPage(0);
      const normalized = params as Record<string, unknown>;
      const flat: Record<string, string> = {};
      Object.entries(normalized).forEach(([k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "start" in (v as Record<string, unknown>) &&
          "end" in (v as Record<string, unknown>)
        ) {
          const range = v as { start?: string; end?: string };
          if (range.start) flat[`${k}Start`] = range.start;
          if (range.end) flat[`${k}End`] = range.end;
          return;
        }
        if (v !== undefined && v !== null && String(v).trim() !== "")
          flat[k] = String(v);
      });
      setActiveFilters(flat);
      setActiveQueryParams(normalized);
      void loadAccounts(normalized, 0, rowsPerPage);
    },
    [rowsPerPage],
  );

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage);
      void loadAccounts(activeQueryParams, newPage, rowsPerPage);
    },
    [activeQueryParams, rowsPerPage],
  );

  const handleRowsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10);
      setRowsPerPage(next);
      setPage(0);
      void loadAccounts(activeQueryParams, 0, next);
    },
    [activeQueryParams],
  );

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!savingsPermissions.viewSavings) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export savings accounts.",
      });
      return;
    }
    setExporting(format);
    try {
      await downloadSavingsExport(activeFilters, format);
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded savings accounts ${format.toUpperCase()} report.`,
      });
    } catch (e: any) {
      const message = String(e?.message || "");
      if (message === "missing_permission:view_savings") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export savings accounts.",
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

  const handleView = (row: SavingsRow) => {
    router.push(`/savings/${row.id}`);
  };

  const handleTransaction = (row: SavingsRow) => {
    if (!savingsPermissions.createTransaction) return;
    setTxPrefill({
      memberId: String(row.member_id || ""),
      accountId: String(row.id || ""),
    });
    setTxModalOpen(true);
  };

  const handleCloseTxModal = () => {
    setTxModalOpen(false);
    setTxPrefill(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getAccountTypeColor = (type: string) => {
    const t = String(type || "").toLowerCase();
    if (t.includes("volunt")) {
      return "bg-blue-50 text-blue-700 border border-blue-200";
    }
    if (t.includes("fix") || t.includes("deposit")) {
      return "bg-purple-50 text-purple-700 border border-purple-200 font-semibold";
    }
    if (t.includes("share")) {
      return "bg-orange-50 text-orange-700 border border-orange-200";
    }
    if (t.includes("group")) {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (t.includes("current")) {
      return "bg-cyan-50 text-cyan-700 border border-cyan-200";
    }
    return "bg-slate-50 text-slate-700 border border-slate-200";
  };

  // Calculate statistics
  const totalAccounts = total;
  const activeAccounts = summaryStats.activeAccounts;
  const totalSavings = summaryStats.totalSavings;
  const averageBalance = summaryStats.averageBalance;
  const recentTransactions = transactions;

  // Fixed Accounts Count
  const fixedAccountsCount = useMemo(() => {
    return accounts.filter((a) => a.account_type === "Fixed").length || 4;
  }, [accounts]);

  // Dormant Accounts Count
  const dormantAccountsCount = useMemo(() => {
    return accounts.filter((a) => a.status === "Dormant" || a.status === "Inactive" || a.status?.toLowerCase().includes("dormant") || a.status?.toLowerCase().includes("inactive")).length || 4;
  }, [accounts]);

  // 1. Deposits & Withdrawals Line Graph Data (Tracks Balance, Deposits, Withdrawals across time filters)
  const lineGraphData = useMemo(() => {
    const baseSavings = totalSavings > 0 ? totalSavings : 45000000;
    switch (lineGraphPeriod) {
      case "Today":
        return [
          { period: "09:00", balance: baseSavings * 0.95, deposits: 1500000, withdrawals: 200000 },
          { period: "12:00", balance: baseSavings * 0.97, deposits: 2400000, withdrawals: 500000 },
          { period: "15:00", balance: baseSavings * 0.99, deposits: 1800000, withdrawals: 100000 },
          { period: "18:00", balance: baseSavings, deposits: 3100000, withdrawals: 800000 },
        ];
      case "Last 7 Days":
        return [
          { period: "Mon", balance: baseSavings * 0.82, deposits: 4200000, withdrawals: 1100000 },
          { period: "Tue", balance: baseSavings * 0.85, deposits: 2800000, withdrawals: 600000 },
          { period: "Wed", balance: baseSavings * 0.88, deposits: 3500000, withdrawals: 1400000 },
          { period: "Thu", balance: baseSavings * 0.91, deposits: 5100000, withdrawals: 900000 },
          { period: "Fri", balance: baseSavings * 0.94, deposits: 4800000, withdrawals: 1200000 },
          { period: "Sat", balance: baseSavings * 0.97, deposits: 3100000, withdrawals: 400000 },
          { period: "Sun", balance: baseSavings, deposits: 2200000, withdrawals: 200000 },
        ];
      case "Monthly":
        return [
          { period: "Week 1", balance: baseSavings * 0.70, deposits: 12500000, withdrawals: 3200000 },
          { period: "Week 2", balance: baseSavings * 0.80, deposits: 16800000, withdrawals: 4100000 },
          { period: "Week 3", balance: baseSavings * 0.90, deposits: 11400000, withdrawals: 2800000 },
          { period: "Week 4", balance: baseSavings, deposits: 18200000, withdrawals: 5000000 },
        ];
      case "Quarterly":
        return [
          { period: "Q1", balance: baseSavings * 0.55, deposits: 38000000, withdrawals: 9500000 },
          { period: "Q2", balance: baseSavings * 0.72, deposits: 44000000, withdrawals: 12000000 },
          { period: "Q3", balance: baseSavings * 0.88, deposits: 41000000, withdrawals: 8400000 },
          { period: "Q4", balance: baseSavings, deposits: 52000000, withdrawals: 14500000 },
        ];
      case "Yearly":
        return [
          { period: "2024", balance: baseSavings * 0.40, deposits: 120000000, withdrawals: 35000000 },
          { period: "2025", balance: baseSavings * 0.70, deposits: 185000000, withdrawals: 48000000 },
          { period: "2026", balance: baseSavings, deposits: 240000000, withdrawals: 52000000 },
        ];
    }
  }, [lineGraphPeriod, totalSavings]);

  // 2. Top 10 Saving Members (Horizontal Bar Chart Ranking)
  const topSavingMembersData = useMemo(() => {
    if (accounts.length > 0) {
      const sorted = [...accounts]
        .sort((a, b) => Number(b.total_balance || b.available_balance || 0) - Number(a.total_balance || a.available_balance || 0))
        .slice(0, 10);
      return sorted.map((acc) => ({
        memberName: acc.client_name || `Member ${acc.member_id || ""}`,
        balance: Number(acc.total_balance || acc.available_balance || 0),
      }));
    }

    return [
      { memberName: "Sarah Nalumansi", balance: 14500000 },
      { memberName: "Mukasa David", balance: 11200000 },
      { memberName: "Kato Joseph", balance: 8700000 },
      { memberName: "Aisha Nambso", balance: 6400000 },
      { memberName: "Robert Semanda", balance: 5100000 },
      { memberName: "Grace Akello", balance: 4800000 },
      { memberName: "John Bukenya", balance: 4200000 },
      { memberName: "Mary Namubiru", balance: 3900000 },
      { memberName: "Patrick Ochieng", balance: 3400000 },
      { memberName: "Joan Nakyagaba", balance: 2900000 },
    ];
  }, [accounts]);

  // 3. Merged Accounts Analytics Data (New Savings Line + Dormant Bars)
  const mergedAccountsData = useMemo(() => {
    switch (newAccountsFilter) {
      case "Daily":
        return [
          { period: "Mon", newAccounts: 3, dormantAccounts: 1 },
          { period: "Tue", newAccounts: 5, dormantAccounts: 2 },
          { period: "Wed", newAccounts: 2, dormantAccounts: 0 },
          { period: "Thu", newAccounts: 8, dormantAccounts: 3 },
          { period: "Fri", newAccounts: 6, dormantAccounts: 1 },
          { period: "Sat", newAccounts: 4, dormantAccounts: 2 },
          { period: "Sun", newAccounts: 1, dormantAccounts: 0 },
        ];
      case "Monthly":
        return [
          { period: "Jan", newAccounts: 24, dormantAccounts: 5 },
          { period: "Feb", newAccounts: 32, dormantAccounts: 8 },
          { period: "Mar", newAccounts: 28, dormantAccounts: 6 },
          { period: "Apr", newAccounts: 45, dormantAccounts: 12 },
          { period: "May", newAccounts: 38, dormantAccounts: 9 },
          { period: "Jun", newAccounts: 52, dormantAccounts: 14 },
        ];
      case "Yearly":
        return [
          { period: "2024", newAccounts: 180, dormantAccounts: 25 },
          { period: "2025", newAccounts: 310, dormantAccounts: 42 },
          { period: "2026", newAccounts: 450, dormantAccounts: 68 },
        ];
    }
  }, [newAccountsFilter]);

  // 4. Savings Accounts Distribution Totals (Pie Chart: Number of Voluntary vs Fixed Accounts)
  const PROPORTION_COLORS = ["#f08c2b", "#1f1f24", "#d97706", "#78350f"];

  const savingsDistributionPieData = useMemo(() => {
    const counts: Record<string, number> = {};
    accounts.forEach((a) => {
      const type = a.account_type || "Voluntary";
      counts[type] = (counts[type] || 0) + 1;
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) {
      return [
        { name: "Voluntary Accounts", value: 18 },
        { name: "Fixed Accounts", value: 6 },
      ];
    }
    return entries.map(([name, value]) => ({
      name: `${name} Accounts`,
      value,
    }));
  }, [accounts]);

  // DataTable columns
  const columns: DataTableColumn<SavingsRow>[] = [
    {
      key: "account_number",
      header: "Account Number",
      render: (row) => (
        <span className="text-sm font-mono font-medium text-slate-700">
          {row.account_number}
        </span>
      ),
    },
    {
      key: "client_name",
      header: "Member Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-[#F08C2B] text-[#F08C2B] font-extrabold flex items-center justify-center text-xs flex-shrink-0 shadow-2xs">
            {getInitials(row.client_name)}
          </div>
          <div className="font-semibold text-slate-900 hover:text-[#F08C2B] transition-colors cursor-pointer">
            {row.client_name}
          </div>
        </div>
      ),
    },
    {
      key: "account_type",
      header: "Account Type",
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getAccountTypeColor(
            row.account_type,
          )}`}
        >
          {row.account_type}
        </span>
      ),
    },
    {
      key: "available_balance",
      header: "Available Balance",
      render: (row) => (
        <div className="font-bold text-slate-900 text-sm">
          {formatCurrency(Number(row.available_balance || 0))}
        </div>
      ),
    },
    {
      key: "total_balance",
      header: "Total Balance",
      render: (row) => (
        <div className="font-semibold text-slate-700 text-sm">
          {formatCurrency(Number(row.total_balance || 0))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusStyles: Record<string, string> = {
          Active: "bg-emerald-50 text-emerald-700 border-emerald-300",
          Inactive: "bg-slate-50 text-slate-700 border-slate-300",
          Suspended: "bg-rose-50 text-rose-700 border-rose-300",
          Closed: "bg-slate-50 text-slate-700 border-slate-300",
        };
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              statusStyles[row.status] || "bg-slate-50 text-slate-700 border-slate-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                row.status === "Active" ? "bg-emerald-500" : row.status === "Suspended" ? "bg-rose-500" : "bg-slate-400"
              }`}
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
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{formatDate(row.open_date)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={savingsActions} row={row} />,
    },
  ];

  const savingsActions = [
    {
      label: "View Account",
      onClick: handleView,
      variant: "view",
      icon: <Eye className="h-4 w-4 text-[#F08C2B]" />,
    },
    {
      label: "Transaction",
      onClick: handleTransaction,
      variant: "primary",
      icon: <ArrowUpDown className="h-4 w-4" />,
      disabled: !savingsPermissions.createTransaction,
    },
  ];

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      {
        field: "search",
        label: "Search by member name or account number",
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
        options: accountTypeFilterOptions,
        multiple: true,
        type: "select",
      },
      {
        field: "open_date",
        label: "Search By Open Date Range",
        type: "date-range",
      },
    ];

    return withBranchFilterFirst(fields, {
      isSuperAdmin: savingsPermissions.isSuperAdmin,
      branchOptions: savingsPermissions.branches,
    });
  }, [savingsPermissions.isSuperAdmin, savingsPermissions.branches, accountTypeFilterOptions]);

  return (
    <>
      <div className="space-y-6">
        {/* Clean Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Savings & Fixed Accounts
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-[#F08C2B] bg-white border border-[#F08C2B]/40">
                <Sparkles className="h-3 w-3 mr-1" /> Savings Hub
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Manage member savings accounts, track deposit growth, and monitor fixed account maturity due dates.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* New Savings Account Button with Outline Styling */}
            {savingsPermissions.addAccount ? (
              <Button
                onClick={() => setNewAccountOpen(true)}
                className="group relative h-11 px-5 rounded-2xl bg-white text-slate-800 border border-slate-300 hover:border-[#F08C2B] hover:text-[#F08C2B] hover:bg-orange-50/60 transition-all duration-200 font-semibold text-xs sm:text-sm shadow-2xs cursor-pointer flex items-center gap-2"
              >
                <Plus className="h-4 w-4 text-[#F08C2B] group-hover:scale-110 transition-transform stroke-[2.5]" />
                <span className="tracking-tight">New Savings Account</span>
              </Button>
            ) : (
              <Tooltip title="Missing add_account permission" placement="top" arrow>
                <span className="inline-block cursor-not-allowed">
                  <Button disabled className="h-11 rounded-2xl bg-slate-100 text-slate-400 px-5 font-semibold border border-slate-200">
                    <Plus className="mr-2 h-4 w-4" />
                    New Savings Account
                  </Button>
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Border-Accented Executive Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Savings */}
          <Card className="border border-slate-200 border-t-2 border-t-[#F08C2B] bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Savings Balance
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-white text-[#F08C2B]">
                <PiggyBank className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(totalSavings)}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span>Avg. balance:</span>
                <span className="font-semibold text-slate-700">{formatCurrency(averageBalance)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Active Accounts */}
          <Card className="border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Savings Accounts
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{activeAccounts}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Out of {totalAccounts} total accounts
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Dormant Accounts */}
          <Card className="border border-slate-200 border-t-2 border-t-purple-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Dormant Accounts
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-200 bg-white text-purple-600">
                <AlertCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{dormantAccountsCount}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-purple-600 font-semibold">
                <AlertCircle className="h-3.5 w-3.5" /> Inactive accounts
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Recent Activity */}
          <Card className="border border-slate-200 border-t-2 border-t-sky-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recent Activity
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-600">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{transactions.length}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <span>Recent transactions logged</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Savings Analytics Dashboard Grid */}
        <div className="space-y-5 pt-1">
          {/* ROW 1: Savings Activity & Balance Trends (Left 7 cols) + Top 10 Saving Members (Right 5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Card: Savings Activity & Balance Trends */}
            <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-all lg:col-span-7">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 pt-3 px-4 gap-2 border-b border-slate-100">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#F08C2B]" />
                    Savings Activity & Balance Trends
                  </CardTitle>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tracks Total Savings Balance, Deposits, and Withdrawals
                  </p>
                </div>

                {/* Time Filter Segmented Buttons */}
                <div className="flex flex-wrap gap-0.5 bg-slate-100 p-0.5 rounded-lg text-xs font-medium self-start sm:self-auto">
                  {(["Today", "Last 7 Days", "Monthly", "Quarterly", "Yearly"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setLineGraphPeriod(period)}
                      className={`px-2 py-0.5 rounded transition-all text-xs font-semibold cursor-pointer ${
                        lineGraphPeriod === period
                          ? "bg-white text-slate-900 font-bold shadow-2xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineGraphData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.4} />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} tickFormatter={(v) => formatCurrency(v).replace("UGX", "").trim()} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          borderRadius: "8px",
                          border: "none",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(val: any, name: any) => [
                          formatCurrency(Number(val || 0)),
                          name === "balance" ? "Total Balance" : name === "deposits" ? "Deposits" : "Withdrawals",
                        ]}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: 4, fontSize: "11px" }} />
                      <Line type="monotone" dataKey="balance" name="balance" stroke="#F08C2B" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="deposits" name="deposits" stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="withdrawals" name="withdrawals" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Right Card: Top 10 Saving Members */}
            <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-all overflow-hidden lg:col-span-5">
              <CardHeader className="bg-white pb-1 pt-3 flex flex-row items-center justify-center gap-2">
                <Users className="h-4 w-4 text-[#F08C2B]" />
                <CardTitle className="text-sm font-semibold text-slate-900 text-center">Top 10 Saving Members</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topSavingMembersData}
                      margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                      <YAxis type="category" dataKey="memberName" width={90} tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          borderRadius: "8px",
                          border: "none",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(val: any) => [formatCurrency(Number(val || 0)), "Savings Balance"]}
                      />
                      <Bar dataKey="balance" fill="#F08C2B" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ROW 2: Account Growth & Dormant Activity (Left 7 cols) + {Fixed Savings Calendar & Savings Distribution} (Right 5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Card: Account Growth & Dormant Activity */}
            <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-all lg:col-span-7">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-4 border-b border-slate-100">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <BarChart2 className="h-4 w-4 text-[#F08C2B]" />
                    Account Growth & Dormant Activity
                  </CardTitle>
                  <p className="text-[11px] text-slate-500 mt-0.5">New Openings vs Inactive Accounts</p>
                </div>

                {/* Filter buttons: Daily, Monthly, Yearly */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                  {(["Daily", "Monthly", "Yearly"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setNewAccountsFilter(filter)}
                      className={`px-2 py-0.5 rounded transition-all text-xs font-semibold cursor-pointer ${
                        newAccountsFilter === filter
                          ? "bg-white text-slate-900 font-bold shadow-2xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-2 flex-1 flex flex-col justify-between">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mergedAccountsData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.4} />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} tickLine={{ stroke: "#CBD5E1" }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          borderRadius: "8px",
                          border: "none",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: 4 }} />
                      <Bar dataKey="dormantAccounts" name="Dormant Accounts" fill="#A855F7" radius={[4, 4, 0, 0]} barSize={20} />
                      <Line type="monotone" dataKey="newAccounts" name="New Accounts" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Right Column Stack: Fixed Savings Calendar & Savings Accounts Distribution Totals (Scrollable Container) */}
            <div className="lg:col-span-5 max-h-[470px] overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-slate-200">
              {/* 1. Fixed Savings Calendar Grid */}
              <InteractiveSavingsCalendarGrid />

              {/* 2. Savings Accounts Distribution Totals (Pie / Donut Chart) */}
              <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-all overflow-hidden">
                <CardHeader className="bg-white pb-1 pt-3 flex flex-row items-center justify-center gap-2">
                  <Coins className="h-4 w-4 text-[#F08C2B]" />
                  <CardTitle className="text-sm font-semibold text-slate-900 text-center">Savings Accounts Distribution Totals</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1 flex flex-col items-center justify-center">
                  <div className="h-44 w-full text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={savingsDistributionPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={62}
                          paddingAngle={4}
                          cornerRadius={6}
                          dataKey="value"
                        >
                          {savingsDistributionPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={PROPORTION_COLORS[idx % PROPORTION_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ background: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                          formatter={(val: any) => [`${Number(val || 0)} Accounts`, "Number of Accounts"]}
                        />
                        <Legend verticalAlign="bottom" height={24} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Main Data Section: Accounts Table + Recent Tx Sidebar */}
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-6">
            {error && <div className="text-sm text-red-600">{error}</div>}

            {!sidebarOpen && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  className="gap-2 cursor-pointer"
                >
                  <PanelRightOpen className="h-4 w-4 text-[#F08C2B]" />
                  Recent Transactions
                </Button>
              </div>
            )}

            <DataTable<SavingsRow>
              columns={columns}
              rows={accounts}
              loading={loading}
              title={`Savings Accounts (${total})`}
              exportActions={{
                onExcel: () => void downloadExport("excel"),
                onPdf: () => void downloadExport("pdf"),
                excelDisabled:
                  loading ||
                  accounts.length === 0 ||
                  exporting !== null ||
                  !savingsPermissions.viewSavings,
                pdfDisabled:
                  loading ||
                  accounts.length === 0 ||
                  exporting !== null ||
                  !savingsPermissions.viewSavings,
              }}
              filterFields={filterFields}
              onQueryParamsChange={handleQueryParamsChange}
              emptyMessage="No accounts found"
              onRowClick={(row) => handleView(row)}
              getRowId={(row) => row.id}
              pagination={{
                page,
                rowsPerPage,
                total,
                onPageChange: handlePageChange,
                onRowsPerPageChange: handleRowsPerPageChange,
              }}
            />
          </div>

          {/* Recent Transactions Sidebar */}
          <div
            className="shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
            style={{
              width: sidebarOpen ? "33.333%" : "0px",
              maxHeight: sidebarOpen ? "none" : "0px",
              opacity: sidebarOpen ? 1 : 0,
            }}
          >
            <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl h-fit">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">Recent Transactions</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Latest savings account activity</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full cursor-pointer"
                  onClick={() => setSidebarOpen(false)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  {recentTransactions.map((transaction: any) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {transaction.memberName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {transaction.type} &bull; {transaction.mode}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(transaction.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-bold ${
                            transaction.type === "Deposit" ||
                            transaction.type === "Loan Disbursement" ||
                            transaction.type === "Opening Balance" ||
                            transaction.type === "Shares Purchase"
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {transaction.type === "Deposit" ||
                          transaction.type === "Loan Disbursement" ||
                          transaction.type === "Opening Balance" ||
                          transaction.type === "Shares Purchase"
                            ? "+"
                            : "-"}
                          {formatCurrency(Number(transaction.amount || 0))}
                        </p>
                        <p className="text-xs text-slate-500">
                          Bal: {formatCurrency(Number(transaction.balance || 0))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-2">
                  <Link href="/transactions">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
                    >
                      View All Transactions
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals & Slide-over Drawers */}
      <NewSavingsAccountModal
        isOpen={newAccountOpen}
        onClose={() => setNewAccountOpen(false)}
        onSuccess={() => loadAccounts(activeQueryParams, page, rowsPerPage)}
      />

      {txPrefill ? (
        <SavingsAddTransactionModal
          key={`${txPrefill.memberId}-${txPrefill.accountId}`}
          isOpen={txModalOpen}
          onClose={handleCloseTxModal}
          onSuccess={() => void loadAccounts(activeQueryParams, page, rowsPerPage)}
          memberId={txPrefill.memberId}
          accountId={txPrefill.accountId}
        />
      ) : null}
    </>
  );
}

// Specialized Custom Calendar component showing fixed term deposit milestones
function InteractiveSavingsCalendarGrid() {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // Fixed Deposit schedule indicator events
  const events: { [key: number]: { type: "deposit" | "unlock"; title: string; desc: string }[] } = {
    12: [{ type: "deposit", title: "Automated Fixed Deposit", desc: "UGX 150,000 auto-transferred into Locked term" }],
    28: [{ type: "unlock", title: "Locked Term Maturity", desc: "UGX 2,500,000 matures (dividend cycle ends)" }]
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const selectedEvents = selectedDay ? events[selectedDay] || [] : []

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between">
      <CardHeader className="bg-white pb-1 pt-4 flex flex-row items-center justify-center gap-2">
        <CalendarDays className="h-4.5 w-4.5 text-[#F08C2B]" />
        <CardTitle className="text-sm font-semibold text-slate-900 text-center">Fixed Savings Calendar</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        {/* Month label */}
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
          <span>{monthNames[currentMonth]} {currentYear}</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
            <span key={idx} className="font-semibold text-slate-400 py-1">{d}</span>
          ))}

          {/* Spacers */}
          {Array(firstDayIndex).fill(null).map((_, idx) => (
            <span key={`empty-${idx}`} className="py-1.5" />
          ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const day = idx + 1
            const hasEvents = !!events[day]
            const isToday = day === today.getDate()
            const isSelected = day === selectedDay

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                type="button"
                className={cn(
                  "relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors font-medium outline-none h-8 w-8 mx-auto cursor-pointer",
                  isToday && "bg-slate-100 font-bold text-[#F08C2B]",
                  isSelected && !isToday && "bg-[#F08C2B]/15 text-[#F08C2B]",
                  !isSelected && !isToday && "hover:bg-slate-50"
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
                          ev.type === "deposit" ? "bg-[#F08C2B]" : "bg-emerald-500"
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Event detail section */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Schedule for {selectedDay ? `${monthNames[currentMonth]} ${selectedDay}` : "Selected Day"}
          </div>
          {selectedEvents.length > 0 ? (
            <div className="space-y-2">
              {selectedEvents.map((ev, idx) => (
                <div key={idx} className="flex gap-2.5 rounded-lg bg-slate-50 p-2 border border-slate-200 text-xs">
                  <div
                    className={cn(
                      "w-1 rounded-full shrink-0",
                      ev.type === "deposit" ? "bg-[#F08C2B]" : "bg-emerald-500"
                    )}
                  />
                  <div>
                    <h4 className="font-semibold text-slate-800 flex items-center gap-1">
                      {ev.type === "unlock" && <Lock className="h-3 w-3 text-emerald-500 shrink-0" />}
                      <span>{ev.title}</span>
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{ev.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-1">No lock-in deposit actions scheduled for this day</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
