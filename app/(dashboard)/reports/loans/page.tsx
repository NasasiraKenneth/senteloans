"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import StyledSelect from "@/components/newUI/styled_select";
import StyledMultiSelect from "@/components/newUI/styled_multi_select";
import RangeDatePicker, {
  type DateRangeValue,
} from "@/components/newUI/range_date_picker";
import TooltipButton from "@/components/newUI/tooltip_button";
import { Badge } from "@/components/ui/badge";
import { Filter, Loader2, RefreshCw, ChevronDown, ChevronUp, X } from "lucide-react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { BsFiletypePdf } from "react-icons/bs";
import { RiFileExcel2Line } from "react-icons/ri";
import { RiResetLeftFill } from "react-icons/ri";
import { useToast } from "@/components/ui/toast";
import { useStaffSession } from "@/components/staff-session-provider";
import { readInstitutionCurrency } from "@/lib/institution-branch-config";
import DataTable, {
  type DataTableColumn,
} from "@/components/datatables/DataTable";
import { exportLoanReportsExcel } from "./components/excel-export";
import { exportLoanReportsPdf } from "./components/pdf-export";
import { exportLoanSummaryPdf } from "./components/summaryPdf";
import LoanReportAnalytics, {
  type LoanReportBreakdown,
  type LoanReportSummary,
} from "./components/LoanReportAnalytics";
import LoanReportExpandableContent from "./components/LoanReportExpandableContent";

const DEFAULT_ROWS_PER_PAGE = 25;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const LOAN_STATUSES = [
  "Applied",
  "Under Review",
  "Reviewed",
  "Approved",
  "Partially Disbursed",
  "Fully Disbursed",
  "Active",
  "Closed",
  "Defaulted",
  "Rejected",
] as const;

const ACTIVE_LIKE = new Set([
  "Partially Disbursed",
  "Fully Disbursed",
  "Active",
]);

const filterInputClass = (hasError = false) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`;

export interface LoanReportRow {
  id: string;
  application_id: string;
  memberName: string;
  memberNumber: string;
  productName: string;
  principal_amount: number;
  interest_rate: number;
  tenure_months: number;
  outstanding_balance: number;
  status: string;
  loan_type: string;
  application_date?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  disbursed_at?: string | null;
  reviewed_by_name?: string | null;
  next_payment_date?: string | null;
  disbursement_date?: string | null;
  approved_by_name?: string | null;
  created_by_name?: string | null;
  disbursed_by?: string[];
  guarantors?: string[];
  total_amount_paid?: number;
  total_interest?: number;
  penalties_collected?: number;
  late_pay_days_avg?: number;
  early_payments?: number;
  overdue?: boolean;
}

type ProductOption = { id: string; product_name: string };
type BranchOption = { id: string; name: string; branch_code?: string };

const EMPTY_BREAKDOWN: LoanReportBreakdown = {
  by_status: [],
  by_product: [],
  by_loan_type: [],
  by_month: [],
  collections_by_month: [],
};

function statusPillClass(status: string): string {
  switch (status) {
    case "Applied":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "Under Review":
      return "bg-violet-70 text-violet-400 border border-violet-130";
    case "Reviewed":
      return "bg-violet-100 text-violet-700 border border-violet-200";
    case "Approved":
      return "bg-green-100 text-green-700 border border-green-200";
    case "Partially Disbursed":
      return "bg-blue-70 text-blue-400 border border-blue-130";
    case "Fully Disbursed":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "Active":
      return "bg-cyan-100 text-cyan-700 border border-cyan-200";
    case "Rejected":
      return "bg-rose-100 text-rose-700 border border-rose-200";
    case "Defaulted":
      return "bg-red-100 text-red-700 border border-red-200";
    case "Closed":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

export default function LoanReportsPage() {
  const { toast } = useToast();
  const { session } = useStaffSession();
  const currency = readInstitutionCurrency(session?.institution?.config);
  const [items, setItems] = useState<LoanReportRow[]>([]);
  const [totalFromApi, setTotalFromApi] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set());
  const [breakdown, setBreakdown] = useState<LoanReportBreakdown>(EMPTY_BREAKDOWN);
  const [summary, setSummary] = useState<LoanReportSummary>({
    principal_booked: 0,
    principal_disbursed: 0,
    outstanding: 0,
    total_amount_paid: 0,
    total_interest: 0,
    total_penalties_collected: 0,
    total_early_payments: 0,
    avg_late_pay_days: 0,
    with_balance: 0,
    overdue: 0,
    defaulted: 0,
    pipeline: 0,
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState<string>("all");
  const [productId, setProductId] = useState<string>("all");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [applicationRange, setApplicationRange] = useState<DateRangeValue>({
    start: "",
    end: "",
  });
  const [reviewedRange, setReviewedRange] = useState<DateRangeValue>({
    start: "",
    end: "",
  });
  const [approvedRange, setApprovedRange] = useState<DateRangeValue>({
    start: "",
    end: "",
  });
  const [disbursedRange, setDisbursedRange] = useState<DateRangeValue>({
    start: "",
    end: "",
  });
  const [summaryCreatedRange, setSummaryCreatedRange] =
    useState<DateRangeValue>({ start: "", end: "" });

  const statusSelectOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...LOAN_STATUSES.map((s) => ({ value: s, label: s })),
    ],
    [],
  );

  const loanTypeSelectOptions = useMemo(
    () => [
      { value: "all", label: "All types" },
      { value: "normal", label: "Normal" },
      { value: "top up", label: "Top up" },
      { value: "buy off", label: "Buy off" },
    ],
    [],
  );

  const productSelectOptions = useMemo(
    () => [
      { value: "all", label: "All products" },
      ...products.map((p) => ({ value: p.id, label: p.product_name })),
    ],
    [products],
  );
  const branchMultiOptions = useMemo(
    () =>
      branches.map((b) => ({
        value: b.id,
        label: b.branch_code ? `${b.name} (${b.branch_code})` : b.name,
      })),
    [branches],
  );

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/institution/loan-products?status=Active&pageSize=200",
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const raw = Array.isArray(data.items) ? data.items : [];
      setProducts(
        raw
          .map((p: { id?: string; product_name?: string }) => ({
            id: String(p.id || ""),
            product_name: String(p.product_name || "Product"),
          }))
          .filter((p: ProductOption) => p.id),
      );
    } catch {
      setProducts([]);
    }
  }, []);

  const buildQuery = useCallback(
    (opts?: { exportAll?: boolean; pageOverride?: number; pageSizeOverride?: number }) => {
    const p = new URLSearchParams();
    if (opts?.exportAll) {
      p.set("export_all", "true");
      p.set("pageSize", "5000");
    } else {
      p.set("page", String((opts?.pageOverride ?? page) + 1));
      p.set("pageSize", String(opts?.pageSizeOverride ?? rowsPerPage));
    }
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (loanTypeFilter !== "all") p.set("loan_type", loanTypeFilter);
    if (productId !== "all") p.set("product_id", productId);
    if (isSuperAdmin && branchIds.length > 0)
      p.set("branches", branchIds.join(","));
    if (applicationRange.start.trim())
      p.set("applicationDateStart", applicationRange.start.trim());
    if (applicationRange.end.trim())
      p.set("applicationDateEnd", applicationRange.end.trim());
    if (reviewedRange.start.trim())
      p.set("reviewedDateStart", reviewedRange.start.trim());
    if (reviewedRange.end.trim())
      p.set("reviewedDateEnd", reviewedRange.end.trim());
    if (approvedRange.start.trim())
      p.set("approvedDateStart", approvedRange.start.trim());
    if (approvedRange.end.trim())
      p.set("approvedDateEnd", approvedRange.end.trim());
    if (disbursedRange.start.trim())
      p.set("disbursedDateStart", disbursedRange.start.trim());
    if (disbursedRange.end.trim())
      p.set("disbursedDateEnd", disbursedRange.end.trim());
    if (memberSearch.trim()) p.set("search", memberSearch.trim());
    if (overdueOnly) p.set("overdue_only", "true");
    return p;
  },
    [
      page,
      rowsPerPage,
      statusFilter,
      loanTypeFilter,
      productId,
      isSuperAdmin,
      branchIds,
      applicationRange.start,
      applicationRange.end,
      reviewedRange.start,
      reviewedRange.end,
      approvedRange.start,
      approvedRange.end,
      disbursedRange.start,
      disbursedRange.end,
      memberSearch,
      overdueOnly,
    ],
  );

  const loadLoans = useCallback(async (opts?: { pageOverride?: number; pageSizeOverride?: number }) => {
    setLoading(true);
    try {
      const base = buildQuery({
        pageOverride: opts?.pageOverride,
        pageSizeOverride: opts?.pageSizeOverride,
      });
      const res = await fetch(
        `/api/institution/reports/loans?${base.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (
        res.status === 403 &&
        data?.error === "missing_permission:view_loans"
      ) {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to view loans.",
        });
        setItems([]);
        setTotalFromApi(0);
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setItems(
        Array.isArray(data.items) ? (data.items as LoanReportRow[]) : [],
      );
      setTotalFromApi(Number(data.total ?? 0));
      const s = (data.summary || {}) as Partial<LoanReportSummary>;
      setSummary({
        principal_booked: Number(s.principal_booked ?? 0),
        principal_disbursed: Number(s.principal_disbursed ?? s.principal_booked ?? 0),
        outstanding: Number(s.outstanding ?? 0),
        total_amount_paid: Number(s.total_amount_paid ?? 0),
        total_interest: Number(s.total_interest ?? 0),
        total_penalties_collected: Number(s.total_penalties_collected ?? 0),
        total_early_payments: Number(s.total_early_payments ?? 0),
        avg_late_pay_days: Number(s.avg_late_pay_days ?? 0),
        with_balance: Number(s.with_balance ?? 0),
        overdue: Number(s.overdue ?? 0),
        defaulted: Number(s.defaulted ?? 0),
        pipeline: Number(s.pipeline ?? 0),
      });
      const b = data.breakdown as Partial<LoanReportBreakdown> | undefined;
      setBreakdown({
        by_status: Array.isArray(b?.by_status) ? b.by_status : [],
        by_product: Array.isArray(b?.by_product) ? b.by_product : [],
        by_loan_type: Array.isArray(b?.by_loan_type) ? b.by_loan_type : [],
        by_month: Array.isArray(b?.by_month) ? b.by_month : [],
        collections_by_month: Array.isArray(b?.collections_by_month) ? b.collections_by_month : [],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load loans";
      toast({
        variant: "destructive",
        title: "Could not load report",
        description: msg,
      });
      setItems([]);
      setTotalFromApi(0);
      setSummary({
        principal_booked: 0,
        principal_disbursed: 0,
        outstanding: 0,
        total_amount_paid: 0,
        total_interest: 0,
        total_penalties_collected: 0,
        total_early_payments: 0,
        avg_late_pay_days: 0,
        with_balance: 0,
        overdue: 0,
        defaulted: 0,
        pipeline: 0,
      });
      setBreakdown(EMPTY_BREAKDOWN);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, toast]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/institution/navigation/permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.permissions) return;
        const superAdmin = !!body.permissions.isSuperAdmin;
        setIsSuperAdmin(superAdmin);
        if (superAdmin && Array.isArray(body.permissions.branches)) {
          setBranches(
            body.permissions.branches.map((b: { id?: string; name?: string }) => ({
              id: String(b.id || ""),
              name: String(b.name || "Branch"),
              branch_code: "",
            })).filter((b: BranchOption) => b.id),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadLoans();
  }, [loadLoans, page, rowsPerPage]);

  useEffect(() => {
    if (resetVersion > 0) {
      if (page === 0) void loadLoans({ pageOverride: 0 });
      else setPage(0);
    }
  }, [resetVersion, loadLoans, page]);

  const onPageChange = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const onRowsPerPageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  }, []);

  const toggleRowExpand = useCallback((rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (statusFilter !== "all") chips.push({ key: "status", label: `Status: ${statusFilter}`, onClear: () => setStatusFilter("all") });
    if (loanTypeFilter !== "all") chips.push({ key: "type", label: `Type: ${loanTypeFilter}`, onClear: () => setLoanTypeFilter("all") });
    if (productId !== "all") {
      const name = products.find((p) => p.id === productId)?.product_name || "Product";
      chips.push({ key: "product", label: `Product: ${name}`, onClear: () => setProductId("all") });
    }
    if (isSuperAdmin && branchIds.length > 0) {
      const names = branchIds.map((id) => branches.find((b) => b.id === id)?.name || "Branch").join(", ");
      chips.push({ key: "branches", label: `Branches: ${names}`, onClear: () => setBranchIds([]) });
    }
    if (memberSearch.trim()) chips.push({ key: "search", label: `Search: ${memberSearch.trim()}`, onClear: () => setMemberSearch("") });
    if (overdueOnly) chips.push({ key: "overdue", label: "Overdue only", onClear: () => setOverdueOnly(false) });
    const ranges: Array<[string, DateRangeValue, (v: DateRangeValue) => void, string]> = [
      ["Applied", applicationRange, setApplicationRange, "application"],
      ["Reviewed", reviewedRange, setReviewedRange, "reviewed"],
      ["Approved", approvedRange, setApprovedRange, "approved"],
      ["Disbursed", disbursedRange, setDisbursedRange, "disbursed"],
    ];
    for (const [label, range, setter] of ranges) {
      if (range.start || range.end) {
        chips.push({
          key: label,
          label: `${label}: ${range.start || "…"} – ${range.end || "…"}`,
          onClear: () => setter({ start: "", end: "" }),
        });
      }
    }
    return chips;
  }, [
    statusFilter,
    loanTypeFilter,
    productId,
    products,
    isSuperAdmin,
    branchIds,
    branches,
    memberSearch,
    overdueOnly,
    applicationRange,
    reviewedRange,
    approvedRange,
    disbursedRange,
  ]);

  const loanColumns = useMemo<DataTableColumn<LoanReportRow>[]>(
    () => [
      {
        key: "application",
        header: "Application",
        render: (loan) => (
          <Link
            href={`/loans/${loan.id}`}
            className="text-primary hover:underline"
          >
            {loan.application_id}
          </Link>
        ),
      },
      {
        key: "member",
        header: "Member",
        render: (loan) => (
          <div>
            <div className="font-medium">{loan.memberName || "—"}</div>
            <div className="text-xs text-muted-foreground">
              {loan.memberNumber || ""}
            </div>
          </div>
        ),
      },
      {
        key: "product",
        header: "Product",
        render: (loan) => loan.productName || "—",
      },
      {
        key: "type",
        header: "Type",
        render: (loan) => loan.loan_type || "normal",
      },
      {
        key: "principal",
        header: "Principal",
        render: (loan) => formatCurrency(loan.principal_amount, currency),
      },
      {
        key: "outstanding",
        header: "Outstanding",
        render: (loan) => formatCurrency(loan.outstanding_balance, currency),
      },
      {
        key: "rate",
        header: "Interest rate %",
        render: (loan) => `${Number(loan.interest_rate || 0)}%`,
      },
      {
        key: "status",
        header: "Status",
        render: (loan) => (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPillClass(String(loan.status))}`}
          >
            {loan.status}
          </span>
        ),
      },
      {
        key: "overdue",
        header: "Overdue",
        render: (loan) =>
          loan.overdue ? (
            <Badge variant="destructive">Yes</Badge>
          ) : (
            <Badge variant="secondary">No</Badge>
          ),
      },
      {
        key: "applied",
        header: "Applied",
        render: (loan) =>
          loan.application_date
            ? String(loan.application_date).slice(0, 10)
            : "—",
      },
      {
        key: "nextDue",
        header: "Next due",
        render: (loan) =>
          loan.next_payment_date
            ? String(loan.next_payment_date).slice(0, 10)
            : "—",
      },
      {
        key: "guarantors",
        header: "Guarantors",
        render: (loan) => {
          const count = Array.isArray(loan.guarantors) ? loan.guarantors.length : 0;
          return count > 0 ? `${count}` : "—";
        },
      },
    ],
    [currency],
  );

  const handleExportExcel = async () => {
    try {
      const exportedRows = await exportLoanReportsExcel({
        items,
        isSuperAdmin,
        branchIds,
        branches,
        statusFilter,
        loanTypeFilter,
        productId,
        products,
        applicationRange,
        reviewedRange,
        approvedRange,
        disbursedRange,
        buildQuery,
      });
      if (exportedRows <= 0) {
        toast({
          variant: "warning",
          title: "No data exported",
          description: "No rows found for selected branches.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Export complete",
        description: `${exportedRows} row(s) in XLSX.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export XLSX";
      toast({
        variant: "destructive",
        title: "Export failed",
        description: msg,
      });
    }
  };

  const handleExportPdf = async () => {
    try {
      const exportedRows = await exportLoanReportsPdf({
        items,
        isSuperAdmin,
        branchIds,
        branches,
        statusFilter,
        loanTypeFilter,
        productId,
        products,
        applicationRange,
        reviewedRange,
        approvedRange,
        disbursedRange,
        buildQuery,
      });
      if (exportedRows <= 0) {
        toast({
          variant: "warning",
          title: "No data exported",
          description: "No rows found for selected branches.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Export complete",
        description: `${exportedRows} row(s) in PDF.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export PDF";
      toast({
        variant: "destructive",
        title: "Export failed",
        description: msg,
      });
    }
  };

  const handleSummaryPdf = async () => {
    try {
      const summaryQuery = buildQuery({ exportAll: true });
      if (summaryCreatedRange.start.trim())
        summaryQuery.set(
          "applicationDateStart",
          summaryCreatedRange.start.trim(),
        );
      if (summaryCreatedRange.end.trim())
        summaryQuery.set("applicationDateEnd", summaryCreatedRange.end.trim());
      if (isSuperAdmin && branchIds.length > 0)
        summaryQuery.set("branches", branchIds.join(","));

      const summaryRes = await fetch(
        `/api/institution/reports/loans?${summaryQuery.toString()}`,
        { cache: "no-store" },
      );
      const summaryData = await summaryRes.json().catch(() => ({}));
      if (!summaryRes.ok) {
        throw new Error(
          summaryData?.error || `Request failed (${summaryRes.status})`,
        );
      }
      const summaryItems = Array.isArray(summaryData.items)
        ? (summaryData.items as LoanReportRow[])
        : [];

      const exportedRows = await exportLoanSummaryPdf({
        items: summaryItems,
        isSuperAdmin,
        branchIds,
        branches,
        buildQuery: () => {
          const p = buildQuery({ exportAll: true });
          if (summaryCreatedRange.start.trim())
            p.set("applicationDateStart", summaryCreatedRange.start.trim());
          if (summaryCreatedRange.end.trim())
            p.set("applicationDateEnd", summaryCreatedRange.end.trim());
          return p;
        },
      });
      if (exportedRows <= 0) {
        toast({
          variant: "warning",
          title: "No data exported",
          description: "No rows found for selected branches.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Summary export started",
        description: `${exportedRows} row(s) summarized in PDF.`,
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to export summary PDF";
      toast({
        variant: "destructive",
        title: "Summary export failed",
        description: msg,
      });
    }
  };

  const handleApplyFilters = () => {
    if (page === 0) void loadLoans({ pageOverride: 0 });
    else setPage(0);
  };

  const handleReset = () => {
    setStatusFilter("all");
    setLoanTypeFilter("all");
    setProductId("all");
    setBranchIds([]);
    setApplicationRange({ start: "", end: "" });
    setReviewedRange({ start: "", end: "" });
    setApprovedRange({ start: "", end: "" });
    setDisbursedRange({ start: "", end: "" });
    setMemberSearch("");
    setOverdueOnly(false);
    setResetVersion((v) => v + 1);
  };

  return (
    <div className="animate-in fade-in duration-300">
      {/* Premium hero */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0f0f12]/[0.04] via-[#f08c2b]/[0.08] to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#f08c2b]/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#0f0f12] px-2.5 py-0.5 text-xs font-semibold text-[#f08c2b]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f08c2b]" />
              Portfolio intelligence
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Loan reports</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Track collections, monitor risk, and export executive summaries — all filtered to your branch scope.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-[#f08c2b]/20 bg-[#f08c2b]/5 px-4 py-3">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Book size</p>
              <p className="text-xl font-extrabold tabular-nums text-[#0f0f12]">
                {loading ? "—" : totalFromApi.toLocaleString()}
              </p>
            </div>
            <div className="h-10 w-px bg-[#f08c2b]/30" />
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Currency</p>
              <p className="text-xl font-extrabold text-[#f08c2b]">{currency}</p>
            </div>
          </div>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex min-h-[50vh] w-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-[#f08c2b]" />
            <p className="text-muted-foreground">Loading loan reports…</p>
          </div>
        </div>
      ) : (
        <>
          <LoanReportAnalytics
            total={totalFromApi}
            summary={summary}
            breakdown={breakdown}
            currency={currency}
            loading={loading}
          />

          <Card className="mb-6">
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters &amp; export
                  </CardTitle>
                  <CardDescription>
                    Refine the portfolio view, then export or open row details for full loan metrics.
                  </CardDescription>
                </div>
                {filtersOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {filtersOpen && (
            <CardContent className="space-y-4">
              <div className="flex flex-row flex-wrap items-end gap-2">
                <div className="w-auto min-w-[260px] space-y-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Search member / application
                  </label>
                  <input
                    type="text"
                    placeholder="Name, member no, or application ID"
                    className={filterInputClass()}
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyFilters();
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={overdueOnly}
                        onChange={(e) => setOverdueOnly(e.target.checked)}
                      />
                      <div className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#f08c2b]" />
                      <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-sm text-gray-700">Overdue only</span>
                  </label>
                </div>
                {isSuperAdmin && (
                  <div className="w-auto min-w-[300px] space-y-2">
                    <Label>Branch</Label>
                    <StyledMultiSelect
                      value={branchIds}
                      onChange={setBranchIds}
                      placeholder="All branches"
                      options={branchMultiOptions}
                      searchable
                    />
                  </div>
                )}
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Status</Label>
                  <StyledSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    placeholder="All statuses"
                    options={statusSelectOptions}
                    searchable
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Loan type</Label>
                  <StyledSelect
                    value={loanTypeFilter}
                    onChange={setLoanTypeFilter}
                    placeholder="All types"
                    options={loanTypeSelectOptions}
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Product</Label>
                  <StyledSelect
                    value={productId}
                    onChange={setProductId}
                    placeholder="All products"
                    options={productSelectOptions}
                    searchable
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Application date range</Label>
                  <RangeDatePicker
                    value={applicationRange}
                    onChange={setApplicationRange}
                    placeholder="Filter by application date"
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Reviewed date range</Label>
                  <RangeDatePicker
                    value={reviewedRange}
                    onChange={setReviewedRange}
                    placeholder="Filter by reviewed date"
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Approved date range</Label>
                  <RangeDatePicker
                    value={approvedRange}
                    onChange={setApprovedRange}
                    placeholder="Filter by approved date"
                  />
                </div>
                <div className="w-auto min-w-[300px] space-y-2">
                  <Label>Disbursed date range</Label>
                  <RangeDatePicker
                    value={disbursedRange}
                    onChange={setDisbursedRange}
                    placeholder="Filter by disbursed date"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <TooltipButton
                  tooltip="Apply filters"
                  onClick={handleApplyFilters}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Filter className="h-4 w-4" />
                  )}
                </TooltipButton>
                <TooltipButton
                  tooltip="Reset filters"
                  onClick={handleReset}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <RiResetLeftFill className="h-4 w-4" />
                </TooltipButton>
                <TooltipButton
                  tooltip="Refresh"
                  onClick={() => loadLoans()}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </TooltipButton>
                <TooltipButton
                  tooltip="Export XLS"
                  onClick={() => void handleExportExcel()}
                  disabled={loading || items.length === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
                >
                  <RiFileExcel2Line className="h-4 w-4" />
                </TooltipButton>
                <TooltipButton
                  tooltip="Export PDF"
                  onClick={() => void handleExportPdf()}
                  disabled={loading || items.length === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <BsFileEarmarkPdf className="h-4 w-4" />
                </TooltipButton>
                <div className="min-w-[260px]">
                  <RangeDatePicker
                    value={summaryCreatedRange}
                    onChange={setSummaryCreatedRange}
                    placeholder="Summary created-at range"
                  />
                </div>
                <TooltipButton
                  tooltip="Summary PDF"
                  onClick={() => void handleSummaryPdf()}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <BsFiletypePdf className="h-4 w-4" />
                </TooltipButton>
              </div>

              {activeFilterChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</span>
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.onClear}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {chip.label}
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
            )}
          </Card>

          <DataTable
            title={`Loan portfolio detail (${totalFromApi})`}
            columns={loanColumns}
            rows={items}
            loading={loading}
            emptyMessage="No loans match the current filters."
            getRowId={(row) => row.id}
            renderDetail={(row) => (
              <LoanReportExpandableContent loan={row} currency={currency} />
            )}
            expandedRowIds={expandedRowIds}
            onToggleExpand={toggleRowExpand}
            onRowClick={(row) => toggleRowExpand(row.id)}
            pagination={{
              total: totalFromApi,
              page,
              onPageChange,
              rowsPerPage,
              onRowsPerPageChange,
              rowsPerPageOptions: ROWS_PER_PAGE_OPTIONS,
            }}
          />
        </>
      )}
    </div>
  );
}
