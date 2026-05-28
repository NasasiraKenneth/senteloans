"use client"

import type { CSSProperties } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import RangeDatePicker, { type DateRangeValue } from "@/components/newUI/range_date_picker"
import TooltipButton from "@/components/newUI/tooltip_button"
import {
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  Coins,
  CreditCard,
  Filter,
  HandCoins,
  Inbox,
  Landmark,
  LineChart as LineChartIcon,
  Loader2,
  PiggyBank,
  Receipt,
  RefreshCw,
  Scale,
  Smartphone,
  Sigma,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { RiFileExcel2Line, RiResetLeftFill } from "react-icons/ri"
import { BsFileEarmarkPdf, BsFiletypePdf } from "react-icons/bs"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useToast } from "@/components/ui/toast"
import { getSession } from "@/lib/session"
import DataTable, { type DataTableColumn } from "@/components/datatables/DataTable"

/* ------------------------------------------------------------------ types */

type BranchOption = { id: string; name: string }

type DailyReportRow = {
  id: string
  report_date: string
  branch_name: string
  branch_id: string
  bank_total_amount: number
  mobile_money_amount: number
  cash_amount: number
  total_amount: number
  available_balance: number
  reported_by: string
}

type BankBalanceRow = {
  id: string
  bank_name: string
  bank_account_number: string
  branch_name: string
  total_amount: number
  updated_at: string
}

type GrantRow = {
  id: string
  client_name: string
  branch_name: string
  total_amount: number
  available_balance: number
  remaining_amount: number
  percentage_received: number
  status: "Active" | "Complete" | "Stalled"
}

type UnclaimedRollupRow = {
  branch_name: string
  open_count: number
  open_amount: number
  claimed_count: number
  last_claim_date: string | null
}

type BranchInvestmentRow = {
  branch_name: string
  amount: number
  positions: number
}

type BranchSaccoLoanRow = {
  branch_name: string
  outstanding_amount: number
  loans_count: number
}

type TreasurySummary = {
  declared_total: number
  bank_share: number
  mobile_money_share: number
  cash_share: number
  branches_reporting_today: number
  avg_daily_total: number
  unclaimed_open_amount: number
  grants_remaining: number
}

type TreasurySection =
  | "branches"
  | "income"
  | "balance"
  | "loans"
  | "membership"
  | "grants"

type RevenueBreakdown = {
  fines: number
  loan_interest: number
  investment_interest: number
  membership_fees: number
}

type ExpenseRow = {
  type: string
  amount: number
}

type PnlPoint = {
  period: string
  revenue: number
  expenses: number
  profit: number
}

type AssetsBreakdown = {
  capital_expenses: number
  investments: number
  loans_outstanding: number
  bank_balances: number
  mobile_money: number
  cash: number
}

type LiabilitiesBreakdown = {
  unclaimed_deposits: number
  sacco_loans: number
}

type EquityBreakdown = {
  accumulated_profits: number
  share_capital: number
  members_savings: number
}

type LoanProductRow = {
  product: string
  balance: number
  borrowers: number
  active_loans: number
  par30_pct: number
}

type LoanPortfolioSummary = {
  total_balance: number
  active_borrowers: number
  active_loans: number
  par30_amount: number
  par30_pct: number
  average_loan: number
}

type MembershipTierRow = {
  tier: string
  threshold: number
  members_total: number
  members_meeting: number
  members_short: number
  avg_contribution: number
}

type TreasurySummaryBreakdown = {
  dailyTotal: number
  loansOutstanding: number
  investments: number
  investmentsInitial: number
  investmentsCapital: number
  capitalExpenses: number
  saccoLoansOutstanding: number
  unclaimedDeposits: number
}

type TreasurySummaryResponse = {
  totalAssets: number
  totalLiabilities: number
  breakdown: TreasurySummaryBreakdown
  asOf?: {
    dailyFinanceDate: string | null
  }
}

const SUMMARY_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in again to load treasury summary.",
  not_staff: "Only staff accounts can load the treasury summary.",
  user_not_linked: "Your account is not linked to an institution.",
  actor_branch_missing: "Your account is not assigned to a branch.",
  "missing_permission:generate_treasury_reports":
    "You do not have permission to view treasury reports.",
}

/* ------------------------------------------------------------------ dummy data */

const DUMMY_BRANCHES: BranchOption[] = [
  { id: "b-1", name: "Kampala Central" },
  { id: "b-2", name: "Ntinda" },
  { id: "b-3", name: "Mbarara" },
  { id: "b-4", name: "Gulu" },
]

const DUMMY_DAILY_REPORTS: DailyReportRow[] = [
  {
    id: "dr-1",
    report_date: "2026-05-26",
    branch_name: "Kampala Central",
    branch_id: "b-1",
    bank_total_amount: 142_750_000,
    mobile_money_amount: 8_320_000,
    cash_amount: 3_460_500,
    total_amount: 154_530_500,
    available_balance: 154_530_500,
    reported_by: "Annet Mukasa",
  },
  {
    id: "dr-2",
    report_date: "2026-05-26",
    branch_name: "Ntinda",
    branch_id: "b-2",
    bank_total_amount: 88_400_000,
    mobile_money_amount: 5_120_000,
    cash_amount: 2_180_000,
    total_amount: 95_700_000,
    available_balance: 95_700_000,
    reported_by: "Samuel Kato",
  },
  {
    id: "dr-3",
    report_date: "2026-05-26",
    branch_name: "Mbarara",
    branch_id: "b-3",
    bank_total_amount: 41_900_000,
    mobile_money_amount: 4_650_000,
    cash_amount: 1_805_000,
    total_amount: 48_355_000,
    available_balance: 48_355_000,
    reported_by: "Peter Ssali",
  },
  {
    id: "dr-4",
    report_date: "2026-05-25",
    branch_name: "Kampala Central",
    branch_id: "b-1",
    bank_total_amount: 140_500_000,
    mobile_money_amount: 7_980_000,
    cash_amount: 3_120_000,
    total_amount: 151_600_000,
    available_balance: 151_600_000,
    reported_by: "Annet Mukasa",
  },
  {
    id: "dr-5",
    report_date: "2026-05-25",
    branch_name: "Ntinda",
    branch_id: "b-2",
    bank_total_amount: 86_220_000,
    mobile_money_amount: 4_700_000,
    cash_amount: 2_050_000,
    total_amount: 92_970_000,
    available_balance: 92_970_000,
    reported_by: "Samuel Kato",
  },
  {
    id: "dr-6",
    report_date: "2026-05-25",
    branch_name: "Mbarara",
    branch_id: "b-3",
    bank_total_amount: 41_120_000,
    mobile_money_amount: 4_300_000,
    cash_amount: 1_640_000,
    total_amount: 47_060_000,
    available_balance: 47_060_000,
    reported_by: "Peter Ssali",
  },
  {
    id: "dr-7",
    report_date: "2026-05-24",
    branch_name: "Kampala Central",
    branch_id: "b-1",
    bank_total_amount: 138_900_000,
    mobile_money_amount: 7_640_000,
    cash_amount: 2_980_000,
    total_amount: 149_520_000,
    available_balance: 149_520_000,
    reported_by: "Annet Mukasa",
  },
  {
    id: "dr-8",
    report_date: "2026-05-24",
    branch_name: "Gulu",
    branch_id: "b-4",
    bank_total_amount: 26_310_000,
    mobile_money_amount: 3_140_000,
    cash_amount: 1_212_000,
    total_amount: 30_662_000,
    available_balance: 30_662_000,
    reported_by: "Grace Nakato",
  },
]

const DUMMY_BANK_BALANCES: BankBalanceRow[] = [
  {
    id: "ba-1",
    bank_name: "Equity Bank",
    bank_account_number: "1230 0091 4521",
    branch_name: "Kampala Central",
    total_amount: 78_500_000,
    updated_at: "2026-05-26",
  },
  {
    id: "ba-2",
    bank_name: "Stanbic Bank",
    bank_account_number: "9404 1110 2233",
    branch_name: "Kampala Central",
    total_amount: 64_250_000,
    updated_at: "2026-05-26",
  },
  {
    id: "ba-3",
    bank_name: "Centenary Bank",
    bank_account_number: "3001 2280 4419",
    branch_name: "Ntinda",
    total_amount: 88_400_000,
    updated_at: "2026-05-26",
  },
  {
    id: "ba-4",
    bank_name: "DFCU Bank",
    bank_account_number: "6789 0114 3308",
    branch_name: "Mbarara",
    total_amount: 41_900_000,
    updated_at: "2026-05-26",
  },
  {
    id: "ba-5",
    bank_name: "Post Bank",
    bank_account_number: "5544 9921 1106",
    branch_name: "Gulu",
    total_amount: 26_310_000,
    updated_at: "2026-05-24",
  },
]

const DUMMY_GRANTS: GrantRow[] = [
  {
    id: "g-1",
    client_name: "USAID Uganda",
    branch_name: "Kampala Central",
    total_amount: 250_000_000,
    available_balance: 180_000_000,
    remaining_amount: 70_000_000,
    percentage_received: 72,
    status: "Active",
  },
  {
    id: "g-2",
    client_name: "UNCDF Inclusive Growth",
    branch_name: "Ntinda",
    total_amount: 150_000_000,
    available_balance: 150_000_000,
    remaining_amount: 0,
    percentage_received: 100,
    status: "Complete",
  },
  {
    id: "g-3",
    client_name: "AGRA Smallholder",
    branch_name: "Mbarara",
    total_amount: 95_000_000,
    available_balance: 40_000_000,
    remaining_amount: 55_000_000,
    percentage_received: 42,
    status: "Active",
  },
  {
    id: "g-4",
    client_name: "Mastercard Foundation",
    branch_name: "Gulu",
    total_amount: 60_000_000,
    available_balance: 12_000_000,
    remaining_amount: 48_000_000,
    percentage_received: 20,
    status: "Stalled",
  },
]

const DUMMY_UNCLAIMED_ROLLUP: UnclaimedRollupRow[] = [
  { branch_name: "Kampala Central", open_count: 6, open_amount: 4_220_000, claimed_count: 41, last_claim_date: "2026-05-26" },
  { branch_name: "Ntinda", open_count: 3, open_amount: 1_980_000, claimed_count: 28, last_claim_date: "2026-05-25" },
  { branch_name: "Mbarara", open_count: 2, open_amount: 860_000, claimed_count: 14, last_claim_date: "2026-05-23" },
  { branch_name: "Gulu", open_count: 4, open_amount: 1_310_000, claimed_count: 9, last_claim_date: "2026-05-24" },
]

const DUMMY_BRANCH_INVESTMENTS: BranchInvestmentRow[] = [
  { branch_name: "Kampala Central", amount: 65_000_000, positions: 8 },
  { branch_name: "Ntinda", amount: 32_000_000, positions: 5 },
  { branch_name: "Mbarara", amount: 15_000_000, positions: 3 },
  { branch_name: "Gulu", amount: 8_000_000, positions: 2 },
]

const DUMMY_BRANCH_SACCO_LOANS: BranchSaccoLoanRow[] = [
  { branch_name: "Kampala Central", outstanding_amount: 48_000_000, loans_count: 3 },
  { branch_name: "Ntinda", outstanding_amount: 28_000_000, loans_count: 2 },
  { branch_name: "Mbarara", outstanding_amount: 12_000_000, loans_count: 2 },
  { branch_name: "Gulu", outstanding_amount: 7_000_000, loans_count: 1 },
]

const DUMMY_REVENUE: RevenueBreakdown = {
  fines: 4_200_000,
  loan_interest: 56_800_000,
  investment_interest: 12_400_000,
  membership_fees: 7_500_000,
}

const DUMMY_EXPENSES: ExpenseRow[] = [
  { type: "Salaries & wages", amount: 28_500_000 },
  { type: "Office rent", amount: 6_000_000 },
  { type: "Travel & transport", amount: 1_950_000 },
  { type: "Utilities", amount: 2_400_000 },
  { type: "Marketing", amount: 1_800_000 },
  { type: "Maintenance", amount: 1_310_000 },
  { type: "Bank charges", amount: 1_120_000 },
  { type: "Stationery & printing", amount: 720_000 },
  { type: "Other", amount: 2_080_000 },
]

const DUMMY_PNL_TREND: PnlPoint[] = [
  { period: "Dec 25", revenue: 12_300_000, expenses: 6_800_000, profit: 0 },
  { period: "Jan 26", revenue: 13_100_000, expenses: 7_200_000, profit: 0 },
  { period: "Feb 26", revenue: 12_700_000, expenses: 7_400_000, profit: 0 },
  { period: "Mar 26", revenue: 14_500_000, expenses: 7_800_000, profit: 0 },
  { period: "Apr 26", revenue: 13_900_000, expenses: 8_100_000, profit: 0 },
  { period: "May 26", revenue: 14_400_000, expenses: 8_580_000, profit: 0 },
]

const DUMMY_ASSETS: AssetsBreakdown = {
  capital_expenses: 85_000_000,
  investments: 120_000_000,
  loans_outstanding: 458_900_000,
  bank_balances: 299_360_000,
  mobile_money: 21_230_000,
  cash: 8_657_500,
}

const DUMMY_LIABILITIES: LiabilitiesBreakdown = {
  unclaimed_deposits: 8_370_000,
  sacco_loans: 95_000_000,
}

const DUMMY_EQUITY: EquityBreakdown = {
  accumulated_profits: 142_500_000,
  share_capital: 215_400_000,
  members_savings: 531_877_500,
}

const DUMMY_LOAN_PORTFOLIO: LoanPortfolioSummary = {
  total_balance: 458_900_000,
  active_borrowers: 624,
  active_loans: 712,
  par30_amount: 18_356_000,
  par30_pct: 4.0,
  average_loan: 644_521,
}

const DUMMY_LOAN_PRODUCTS: LoanProductRow[] = [
  { product: "Salary loan", balance: 168_400_000, borrowers: 245, active_loans: 268, par30_pct: 2.4 },
  { product: "Business loan", balance: 142_300_000, borrowers: 158, active_loans: 184, par30_pct: 5.1 },
  { product: "Agriculture", balance: 78_600_000, borrowers: 112, active_loans: 124, par30_pct: 6.8 },
  { product: "Emergency", balance: 36_200_000, borrowers: 78, active_loans: 92, par30_pct: 3.2 },
  { product: "Group loan", balance: 33_400_000, borrowers: 31, active_loans: 44, par30_pct: 1.9 },
]

const DUMMY_MEMBERSHIP_TIERS: MembershipTierRow[] = [
  { tier: "Below 100K", threshold: 100_000, members_total: 184, members_meeting: 0, members_short: 184, avg_contribution: 38_500 },
  { tier: "100K – 500K", threshold: 500_000, members_total: 312, members_meeting: 246, members_short: 66, avg_contribution: 287_400 },
  { tier: "500K – 1M", threshold: 1_000_000, members_total: 226, members_meeting: 198, members_short: 28, avg_contribution: 743_000 },
  { tier: "1M – 5M", threshold: 5_000_000, members_total: 132, members_meeting: 118, members_short: 14, avg_contribution: 2_120_000 },
  { tier: "5M+", threshold: 5_000_000, members_total: 68, members_meeting: 64, members_short: 4, avg_contribution: 8_400_000 },
]

/* ------------------------------------------------------------------ helpers */

function formatUgx(value: number): string {
  return `UGX ${Math.round(Number(value || 0)).toLocaleString()}`
}

function compactUgx(value: number): string {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const CHART_COLORS = {
  bank: "#f08c2b",
  mobile_money: "#3b82f6",
  cash: "#10b981",
  remaining: "#e11d48",
  grid: "#f1f5f9",
  axis: "#94a3b8",
  revenue: "#10b981",
  expense: "#ef4444",
  profit: "#f08c2b",
  asset: "#0ea5e9",
  liability: "#f97316",
  equity: "#8b5cf6",
  met: "#10b981",
  short: "#fb7185",
}

const ASSET_PALETTE = ["#f08c2b", "#0ea5e9", "#10b981", "#8b5cf6", "#3b82f6", "#facc15"]
const LIABILITY_PALETTE = ["#f97316", "#e11d48"]
const EQUITY_PALETTE = ["#8b5cf6", "#22c55e", "#3b82f6"]
const REVENUE_PALETTE = ["#10b981", "#f08c2b", "#3b82f6", "#8b5cf6"]


const tooltipContentStyle: CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
}

function withinRange(value: string, start: string, end: string): boolean {
  if (!value) return false
  if (start && value < start) return false
  if (end && value > end) return false
  return true
}

function grantStatusPill(status: GrantRow["status"]): string {
  if (status === "Complete") return "bg-green-100 text-green-700 border border-green-200"
  if (status === "Stalled") return "bg-rose-100 text-rose-700 border border-rose-200"
  return "bg-amber-100 text-amber-700 border border-amber-200"
}

/* ------------------------------------------------------------------ tabs */

type TabConfig = {
  id: TreasurySection
  label: string
  description: string
  icon: LucideIcon
}

const TREASURY_TABS: TabConfig[] = [
  {
    id: "branches",
    label: "Branches",
    description: "Daily liquidity & deposits",
    icon: Building2,
  },
  {
    id: "income",
    label: "Income statement",
    description: "Revenue & expenses",
    icon: Receipt,
  },
  {
    id: "balance",
    label: "Balance sheet",
    description: "Assets · Liabilities · Equity",
    icon: Scale,
  },
  {
    id: "loans",
    label: "Loan portfolio",
    description: "Outstanding loan book",
    icon: CreditCard,
  },
  {
    id: "membership",
    label: "Membership",
    description: "Contribution compliance",
    icon: Users,
  },
  {
    id: "grants",
    label: "Grants",
    description: "Pledges & utilisation",
    icon: HandCoins,
  },
]

const ACTIVE_TAB_BG = "border border-[#f08c2b]/15 bg-[#000000]/90"
const ACTIVE_TAB_BADGE =
  "border border-[#f08c2b]/15 bg-[#f08c2b]/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f08c2b]/80"

function TreasuryTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TreasurySection
  onTabChange: (tab: TreasurySection) => void
}) {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col gap-2 p-1 bg-gray-100 rounded-2xl sm:flex-row sm:space-x-2 sm:space-y-0 overflow-x-auto">
        {TREASURY_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <motion.button
              key={tab.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex-1 flex min-w-[150px] items-center justify-center rounded-xl px-4 py-3 transition-all duration-300 group ${
                isActive
                  ? "text-[#f08c2b]"
                  : "text-gray-600 hover:bg-white/80 hover:text-gray-900"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="treasuryActiveTab"
                  className={`absolute inset-0 rounded-xl ${ACTIVE_TAB_BG}`}
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <div className="relative flex w-full items-center justify-center gap-2 sm:gap-3">
                <div
                  className={`shrink-0 rounded-lg p-2 transition-all duration-300 ${
                    isActive ? "bg-[#f08c2b]/10" : "bg-gray-100 group-hover:bg-white"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 transition-all duration-300 ${
                      isActive
                        ? "text-[#f08c2b]"
                        : "text-gray-500 group-hover:text-gray-700"
                    }`}
                  />
                </div>

                <div className="flex min-w-0 flex-col items-start text-left">
                  <span
                    className={`truncate text-sm font-semibold transition-all duration-300 ${
                      isActive
                        ? "text-[#f08c2b]"
                        : "text-gray-700 group-hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                  </span>
                  <span
                    className={`hidden truncate text-[11px] transition-all duration-300 sm:block ${
                      isActive
                        ? "text-[#f08c2b]/80"
                        : "text-gray-500 group-hover:text-gray-600"
                    }`}
                  >
                    {tab.description}
                  </span>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function TreasuryReportsPage() {
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [branches] = useState<BranchOption[]>(DUMMY_BRANCHES)
  const [activeTab, setActiveTab] = useState<TreasurySection>("branches")
  const [treasurySummary, setTreasurySummary] = useState<TreasurySummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" })

  const branchSelectOptions = useMemo(
    () => [
      { value: "all", label: "All branches" },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches],
  )

  const selectedBranchName = useMemo(
    () =>
      branchFilter === "all"
        ? null
        : (branches.find((b) => b.id === branchFilter)?.name ?? null),
    [branchFilter, branches],
  )

  const filteredDaily = useMemo(() => {
    return DUMMY_DAILY_REPORTS.filter((r) => {
      if (isSuperAdmin && branchFilter !== "all" && r.branch_id !== branchFilter) return false
      if (dateRange.start || dateRange.end) {
        if (!withinRange(r.report_date, dateRange.start, dateRange.end)) return false
      }
      return true
    })
  }, [branchFilter, dateRange.start, dateRange.end, isSuperAdmin])

  const filteredBankBalances = useMemo(() => {
    if (!isSuperAdmin || !selectedBranchName) return DUMMY_BANK_BALANCES
    return DUMMY_BANK_BALANCES.filter((r) => r.branch_name === selectedBranchName)
  }, [selectedBranchName, isSuperAdmin])

  const filteredGrants = useMemo(() => {
    if (!isSuperAdmin || !selectedBranchName) return DUMMY_GRANTS
    return DUMMY_GRANTS.filter((r) => r.branch_name === selectedBranchName)
  }, [selectedBranchName, isSuperAdmin])

  const filteredUnclaimed = useMemo(() => {
    if (!isSuperAdmin || !selectedBranchName) return DUMMY_UNCLAIMED_ROLLUP
    return DUMMY_UNCLAIMED_ROLLUP.filter((r) => r.branch_name === selectedBranchName)
  }, [selectedBranchName, isSuperAdmin])

  const filteredBranchInvestments = useMemo(() => {
    const rows =
      isSuperAdmin && selectedBranchName
        ? DUMMY_BRANCH_INVESTMENTS.filter((r) => r.branch_name === selectedBranchName)
        : DUMMY_BRANCH_INVESTMENTS
    return [...rows].sort((a, b) => b.amount - a.amount)
  }, [selectedBranchName, isSuperAdmin])

  const filteredBranchSaccoLoans = useMemo(() => {
    const rows =
      isSuperAdmin && selectedBranchName
        ? DUMMY_BRANCH_SACCO_LOANS.filter((r) => r.branch_name === selectedBranchName)
        : DUMMY_BRANCH_SACCO_LOANS
    return [...rows].sort((a, b) => b.outstanding_amount - a.outstanding_amount)
  }, [selectedBranchName, isSuperAdmin])

  const branchInvestmentsTotal = useMemo(
    () => filteredBranchInvestments.reduce((s, r) => s + r.amount, 0),
    [filteredBranchInvestments],
  )

  const branchSaccoLoansTotal = useMemo(
    () => filteredBranchSaccoLoans.reduce((s, r) => s + r.outstanding_amount, 0),
    [filteredBranchSaccoLoans],
  )

  const summary = useMemo<TreasurySummary>(() => {
    const declaredTotal = filteredDaily.reduce((s, r) => s + r.total_amount, 0)
    const bankSum = filteredDaily.reduce((s, r) => s + r.bank_total_amount, 0)
    const mmSum = filteredDaily.reduce((s, r) => s + r.mobile_money_amount, 0)
    const cashSum = filteredDaily.reduce((s, r) => s + r.cash_amount, 0)
    const today = todayIso()
    const reportingToday = new Set(
      filteredDaily.filter((r) => r.report_date === today).map((r) => r.branch_id),
    ).size
    const distinctDays = new Set(filteredDaily.map((r) => r.report_date)).size || 1
    const grantsRemaining = filteredGrants.reduce((s, r) => s + r.remaining_amount, 0)
    const unclaimedOpenAmount = filteredUnclaimed.reduce((s, r) => s + r.open_amount, 0)

    return {
      declared_total: declaredTotal,
      bank_share: declaredTotal > 0 ? Math.round((bankSum / declaredTotal) * 100) : 0,
      mobile_money_share: declaredTotal > 0 ? Math.round((mmSum / declaredTotal) * 100) : 0,
      cash_share: declaredTotal > 0 ? Math.round((cashSum / declaredTotal) * 100) : 0,
      branches_reporting_today: reportingToday,
      avg_daily_total: distinctDays > 0 ? Math.round(declaredTotal / distinctDays) : 0,
      unclaimed_open_amount: unclaimedOpenAmount,
      grants_remaining: grantsRemaining,
    }
  }, [filteredDaily, filteredGrants, filteredUnclaimed])

  /* ---------------------------------------------- chart datasets */

  const branchContribData = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const r of filteredDaily) {
      grouped.set(r.branch_name, (grouped.get(r.branch_name) ?? 0) + r.total_amount)
    }
    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredDaily])

  const grantsCompareData = useMemo(
    () =>
      filteredGrants.map((g) => ({
        name:
          g.client_name.length > 18 ? `${g.client_name.slice(0, 16)}…` : g.client_name,
        full_name: g.client_name,
        received: g.available_balance,
        remaining: g.remaining_amount,
      })),
    [filteredGrants],
  )

  /* ---------------------------------------------- income statement */

  const revenueBreakdown = useMemo(
    () => [
      { name: "Loan interest", value: DUMMY_REVENUE.loan_interest, color: REVENUE_PALETTE[0] },
      { name: "Investment interest", value: DUMMY_REVENUE.investment_interest, color: REVENUE_PALETTE[1] },
      { name: "Membership fees", value: DUMMY_REVENUE.membership_fees, color: REVENUE_PALETTE[2] },
      { name: "Fines", value: DUMMY_REVENUE.fines, color: REVENUE_PALETTE[3] },
    ],
    [],
  )

  const totalRevenue = useMemo(
    () => revenueBreakdown.reduce((s, r) => s + r.value, 0),
    [revenueBreakdown],
  )

  const sortedExpenses = useMemo(
    () => [...DUMMY_EXPENSES].sort((a, b) => b.amount - a.amount),
    [],
  )

  const totalExpenses = useMemo(
    () => sortedExpenses.reduce((s, r) => s + r.amount, 0),
    [sortedExpenses],
  )

  const accumulatedProfit = totalRevenue - totalExpenses
  const profitMargin =
    totalRevenue > 0 ? Math.round((accumulatedProfit / totalRevenue) * 100) : 0

  const pnlTrend = useMemo(
    () =>
      DUMMY_PNL_TREND.map((p) => ({
        ...p,
        profit: p.revenue - p.expenses,
      })),
    [],
  )

  /* ---------------------------------------------- balance sheet */

  const assetsList = useMemo(
    () => [
      { name: "Loans outstanding", value: DUMMY_ASSETS.loans_outstanding, icon: "loans" },
      { name: "Bank balances", value: DUMMY_ASSETS.bank_balances, icon: "bank" },
      { name: "Investments", value: DUMMY_ASSETS.investments, icon: "investments" },
      { name: "Capital expenses", value: DUMMY_ASSETS.capital_expenses, icon: "capex" },
      { name: "Mobile money", value: DUMMY_ASSETS.mobile_money, icon: "mm" },
      { name: "Cash on hand", value: DUMMY_ASSETS.cash, icon: "cash" },
    ],
    [],
  )
  const totalAssets = useMemo(
    () => assetsList.reduce((s, r) => s + r.value, 0),
    [assetsList],
  )

  const liabilitiesList = useMemo(
    () => [
      { name: "Sacco loans", value: DUMMY_LIABILITIES.sacco_loans },
      { name: "Unclaimed deposits", value: DUMMY_LIABILITIES.unclaimed_deposits },
    ],
    [],
  )
  const totalLiabilities = useMemo(
    () => liabilitiesList.reduce((s, r) => s + r.value, 0),
    [liabilitiesList],
  )

  const equityList = useMemo(
    () => [
      { name: "Members' savings", value: DUMMY_EQUITY.members_savings },
      { name: "Share capital", value: DUMMY_EQUITY.share_capital },
      { name: "Accumulated profits", value: DUMMY_EQUITY.accumulated_profits },
    ],
    [],
  )
  const totalEquity = useMemo(
    () => equityList.reduce((s, r) => s + r.value, 0),
    [equityList],
  )

  const balanceSheetBars = useMemo(
    () => [
      { name: "Assets", assets: totalAssets, liabilities: 0, equity: 0 },
      {
        name: "Liabilities + Equity",
        assets: 0,
        liabilities: totalLiabilities,
        equity: totalEquity,
      },
    ],
    [totalAssets, totalLiabilities, totalEquity],
  )

  const balanceSheetDiff = totalAssets - (totalLiabilities + totalEquity)
  const balanceSheetBalanced = Math.abs(balanceSheetDiff) < 1

  /* ---------------------------------------------- loan portfolio */

  const loanProductsChart = useMemo(
    () =>
      DUMMY_LOAN_PRODUCTS.map((p) => ({
        product: p.product,
        balance: p.balance,
        borrowers: p.borrowers,
      })),
    [],
  )

  const loanProductColumns = useMemo<DataTableColumn<LoanProductRow>[]>(
    () => [
      { key: "product", header: "Product", render: (row) => <span className="font-medium">{row.product}</span> },
      {
        key: "balance",
        header: "Outstanding balance",
        render: (row) => (
          <span className="font-mono font-semibold text-gray-900">{formatUgx(row.balance)}</span>
        ),
      },
      { key: "borrowers", header: "Borrowers", render: (row) => row.borrowers.toLocaleString() },
      {
        key: "active_loans",
        header: "Active loans",
        render: (row) => row.active_loans.toLocaleString(),
      },
      {
        key: "par30_pct",
        header: "PAR 30",
        render: (row) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              row.par30_pct >= 5
                ? "bg-rose-100 text-rose-700 border border-rose-200"
                : row.par30_pct >= 3
                  ? "bg-amber-100 text-amber-700 border border-amber-200"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200"
            }`}
          >
            {row.par30_pct.toFixed(1)}%
          </span>
        ),
      },
    ],
    [],
  )

  /* ---------------------------------------------- membership contributions */

  const membershipChart = useMemo(
    () =>
      DUMMY_MEMBERSHIP_TIERS.map((t) => ({
        tier: t.tier,
        meeting: t.members_meeting,
        short: t.members_short,
        avg_contribution: t.avg_contribution,
        threshold: t.threshold,
        total: t.members_total,
      })),
    [],
  )

  const totalMembers = useMemo(
    () => DUMMY_MEMBERSHIP_TIERS.reduce((s, r) => s + r.members_total, 0),
    [],
  )
  const totalMembersMeeting = useMemo(
    () => DUMMY_MEMBERSHIP_TIERS.reduce((s, r) => s + r.members_meeting, 0),
    [],
  )
  const totalMembersShort = useMemo(
    () => DUMMY_MEMBERSHIP_TIERS.reduce((s, r) => s + r.members_short, 0),
    [],
  )
  const membershipCompliance =
    totalMembers > 0 ? Math.round((totalMembersMeeting / totalMembers) * 100) : 0

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      setSummaryLoading(true)
      try {
        const params = new URLSearchParams()
        if (branchFilter && branchFilter !== "all") params.set("branch", branchFilter)
        const qs = params.toString()
        const res = await fetch(
          `/api/institution/reports/treasury/summary${qs ? `?${qs}` : ""}`,
          { cache: "no-store", signal },
        )
        const body = (await res.json().catch(() => ({}))) as
          | TreasurySummaryResponse
          | { error?: string }
        if (!res.ok) {
          const err = (body as { error?: string }).error || `request_failed_${res.status}`
          throw new Error(err)
        }
        setTreasurySummary(body as TreasurySummaryResponse)
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === "AbortError") return
        const code = String((e as Error)?.message || "")
        const description = SUMMARY_ERROR_MESSAGES[code] || "Failed to load treasury summary."
        toast({
          variant: "destructive",
          title: "Couldn't load treasury summary",
          description,
        })
        setTreasurySummary(null)
      } finally {
        setSummaryLoading(false)
      }
    },
    [branchFilter, toast],
  )

  useEffect(() => {
    const s = getSession()
    const role = String(s?.role || "").trim().toLowerCase()
    setIsSuperAdmin(role === "super_admin")
    const t = setTimeout(() => setLoading(false), 250)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    void loadSummary(ctrl.signal)
    return () => ctrl.abort()
  }, [loadSummary])

  const fakeRefresh = useCallback(() => {
    setLoading(true)
    void loadSummary()
    setTimeout(() => setLoading(false), 350)
  }, [loadSummary])

  const handleReset = () => {
    setBranchFilter("all")
    setDateRange({ start: "", end: "" })
  }

  const notImplemented = (label: string) => {
    toast({
      variant: "warning",
      title: `${label} pending`,
      description: "Treasury report export is not wired to the backend yet.",
    })
  }

  /* ---------------------------------------------- table columns */

  const bankColumns = useMemo<DataTableColumn<BankBalanceRow>[]>(
    () => [
      {
        key: "bank_name",
        header: "Bank",
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">{row.bank_name}</span>
            <span className="text-xs text-gray-400">{row.bank_account_number}</span>
          </div>
        ),
      },
      { key: "branch_name", header: "Branch", render: (row) => row.branch_name },
      {
        key: "total_amount",
        header: "Balance",
        render: (row) => (
          <span className="font-mono font-semibold text-gray-900">
            {formatUgx(row.total_amount)}
          </span>
        ),
      },
      {
        key: "updated_at",
        header: "Updated",
        render: (row) => (
          <span className="text-sm text-muted-foreground">{row.updated_at}</span>
        ),
      },
    ],
    [],
  )

  const grantColumns = useMemo<DataTableColumn<GrantRow>[]>(
    () => [
      {
        key: "client_name",
        header: "Grantor / client",
        render: (row) => <span className="font-medium">{row.client_name}</span>,
      },
      { key: "branch_name", header: "Branch", render: (row) => row.branch_name },
      {
        key: "total_amount",
        header: "Pledged",
        render: (row) => <span className="font-mono">{formatUgx(row.total_amount)}</span>,
      },
      {
        key: "available_balance",
        header: "Received",
        render: (row) => <span className="font-mono">{formatUgx(row.available_balance)}</span>,
      },
      {
        key: "remaining_amount",
        header: "Remaining",
        render: (row) => (
          <span className="font-mono font-medium text-rose-600">
            {formatUgx(row.remaining_amount)}
          </span>
        ),
      },
      {
        key: "percentage_received",
        header: "% received",
        render: (row) => (
          <div className="flex items-center gap-2 min-w-[140px]">
            <div className="h-2 flex-1 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#f08c2b]"
                style={{ width: `${Math.min(100, row.percentage_received)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700">
              {row.percentage_received}%
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${grantStatusPill(
              row.status,
            )}`}
          >
            {row.status}
          </span>
        ),
      },
    ],
    [],
  )

  const unclaimedColumns = useMemo<DataTableColumn<UnclaimedRollupRow>[]>(
    () => [
      {
        key: "branch_name",
        header: "Branch",
        render: (row) => <span className="font-medium">{row.branch_name}</span>,
      },
      {
        key: "open_count",
        header: "Open",
        render: (row) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
            {row.open_count}
          </span>
        ),
      },
      {
        key: "open_amount",
        header: "Open amount",
        render: (row) => (
          <span className="font-mono font-medium text-amber-700">
            {formatUgx(row.open_amount)}
          </span>
        ),
      },
      {
        key: "claimed_count",
        header: "Claimed (lifetime)",
        render: (row) => row.claimed_count,
      },
      {
        key: "last_claim_date",
        header: "Last claim",
        render: (row) => (
          <span className="text-sm text-muted-foreground">{row.last_claim_date || "—"}</span>
        ),
      },
    ],
    [],
  )

  /* ---------------------------------------------- render */

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Treasury Reports</h1>
          <p className="text-muted-foreground">
            Branch-level liquidity, declared daily balances, grant utilisation, and unclaimed
            deposits — at a glance.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Showing sample data — backend wiring pending
        </div>
      </div>

      {/* Always-visible financial position KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total assets
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {summaryLoading && treasurySummary ? (
                <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
              ) : null}
              <Wallet className="h-4 w-4 text-sky-600" />
            </div>
          </CardHeader>
          <CardContent>
            {summaryLoading && !treasurySummary ? (
              <div className="h-7 w-32 animate-pulse rounded bg-muted" />
            ) : treasurySummary ? (
              <div className="text-xl font-bold text-sky-700">
                {formatUgx(treasurySummary.totalAssets)}
              </div>
            ) : (
              <div className="text-xl font-bold text-muted-foreground">—</div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {treasurySummary?.asOf?.dailyFinanceDate
                ? `Loans + day-end balance + investments + capex · as of ${treasurySummary.asOf.dailyFinanceDate}`
                : "Loans + day-end balance + investments + capex"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total liabilities
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {summaryLoading && treasurySummary ? (
                <Loader2 className="h-3 w-3 animate-spin text-orange-600" />
              ) : null}
              <Scale className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            {summaryLoading && !treasurySummary ? (
              <div className="h-7 w-32 animate-pulse rounded bg-muted" />
            ) : treasurySummary ? (
              <div className="text-xl font-bold text-orange-700">
                {formatUgx(treasurySummary.totalLiabilities)}
              </div>
            ) : (
              <div className="text-xl font-bold text-muted-foreground">—</div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Sacco loans + unclaimed deposits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Members&apos; equity
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-violet-700">{formatUgx(totalEquity)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Savings + share capital + retained
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Accumulated profit
            </CardTitle>
            {accumulatedProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl font-bold ${
                accumulatedProfit >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatUgx(accumulatedProfit)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Margin {profitMargin}% · Rev {compactUgx(totalRevenue)} · Exp{" "}
              {compactUgx(totalExpenses)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & exports — shared across tabs */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters &amp; export
          </CardTitle>
          <CardDescription>
            Refine the treasury views, then export the daily balance ledger and snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-end gap-2">
            {isSuperAdmin && (
              <div className="space-y-2 w-auto min-w-[300px]">
                <Label>Branch</Label>
                <StyledSelect
                  value={branchFilter}
                  onChange={setBranchFilter}
                  placeholder="All branches"
                  options={branchSelectOptions}
                  searchable
                />
              </div>
            )}
            <div className="space-y-2 w-auto min-w-[300px]">
              <Label>Report date range</Label>
              <RangeDatePicker
                value={dateRange}
                onChange={setDateRange}
                placeholder="Filter by report date"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TooltipButton
              tooltip="Apply filters"
              onClick={fakeRefresh}
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
              onClick={fakeRefresh}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </TooltipButton>
            <TooltipButton
              tooltip="Export XLS (coming soon)"
              onClick={() => notImplemented("Excel export")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 bg-background text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
            >
              <RiFileExcel2Line className="h-4 w-4" />
            </TooltipButton>
            <TooltipButton
              tooltip="Export PDF (coming soon)"
              onClick={() => notImplemented("PDF export")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <BsFileEarmarkPdf className="h-4 w-4" />
            </TooltipButton>
            <TooltipButton
              tooltip="Summary PDF (coming soon)"
              onClick={() => notImplemented("Summary PDF")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <BsFiletypePdf className="h-4 w-4" />
            </TooltipButton>
          </div>
        </CardContent>
      </Card>

      {/* Tab navigation */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <TreasuryTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >

      {/* ===================== Branches tab ===================== */}
      {activeTab === "branches" && (
      <>
      {/* KPI strip */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Declared total
            </CardTitle>
            <Sigma className="h-4 w-4 text-[#f08c2b]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatUgx(summary.declared_total)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Avg / day {formatUgx(summary.avg_daily_total)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Channel mix
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <Landmark className="h-3 w-3" /> Bank
                </span>
                <span className="font-mono font-semibold">{summary.bank_share}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <Smartphone className="h-3 w-3" /> Mobile money
                </span>
                <span className="font-mono font-semibold">{summary.mobile_money_share}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <Banknote className="h-3 w-3" /> Cash
                </span>
                <span className="font-mono font-semibold">{summary.cash_share}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Branches reporting today
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.branches_reporting_today}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {branches.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">As of {todayIso()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open obligations
            </CardTitle>
            <Inbox className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700">Unclaimed</span>
                <span className="font-mono font-semibold text-amber-700">
                  {formatUgx(summary.unclaimed_open_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700">Grants remaining</span>
                <span className="font-mono font-semibold text-rose-600">
                  {formatUgx(summary.grants_remaining)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch contribution - full width */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#f08c2b]" />
            Branch contribution
          </CardTitle>
          <CardDescription>
            Declared totals by branch, ranked highest to lowest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {branchContribData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No branch contribution to chart.
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={branchContribData}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickFormatter={(v: number) => compactUgx(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    width={140}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number) => [formatUgx(value), "Declared total"]}
                  />
                  <Bar dataKey="value" fill={CHART_COLORS.bank} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investments + Sacco loans by branch */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-sky-600" />
              Investments by branch
            </CardTitle>
            <CardDescription>
              Total invested capital per branch · {formatUgx(branchInvestmentsTotal)} overall.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredBranchInvestments.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No investments to chart for the current filters.
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredBranchInvestments}
                    layout="vertical"
                    margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      stroke={CHART_COLORS.grid}
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_COLORS.grid }}
                      tickFormatter={(v: number) => compactUgx(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="branch_name"
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_COLORS.grid }}
                      width={140}
                    />
                    <RechartsTooltip
                      contentStyle={tooltipContentStyle}
                      formatter={(value: number, key: string) => [
                        key === "amount" ? formatUgx(value) : `${value} positions`,
                        key === "amount" ? "Invested" : "Positions",
                      ]}
                    />
                    <Bar
                      dataKey="amount"
                      fill={CHART_COLORS.asset}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-orange-600" />
              Sacco loans by branch
            </CardTitle>
            <CardDescription>
              Outstanding sacco borrowings per branch ·{" "}
              {formatUgx(branchSaccoLoansTotal)} overall.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredBranchSaccoLoans.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No sacco loans to chart for the current filters.
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredBranchSaccoLoans}
                    layout="vertical"
                    margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      stroke={CHART_COLORS.grid}
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_COLORS.grid }}
                      tickFormatter={(v: number) => compactUgx(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="branch_name"
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_COLORS.grid }}
                      width={140}
                    />
                    <RechartsTooltip
                      contentStyle={tooltipContentStyle}
                      formatter={(value: number, key: string) => [
                        key === "outstanding_amount"
                          ? formatUgx(value)
                          : `${value} loans`,
                        key === "outstanding_amount" ? "Outstanding" : "Loans",
                      ]}
                    />
                    <Bar
                      dataKey="outstanding_amount"
                      fill={CHART_COLORS.liability}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {/* ===================== Income statement ===================== */}
      {activeTab === "income" && (
      <>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Receipt className="h-4 w-4 text-[#f08c2b]" />
        Income statement
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-700">{formatUgx(totalRevenue)}</div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Loan interest</span>
                <span className="font-mono">{compactUgx(DUMMY_REVENUE.loan_interest)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Investment interest</span>
                <span className="font-mono">{compactUgx(DUMMY_REVENUE.investment_interest)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Membership fees</span>
                <span className="font-mono">{compactUgx(DUMMY_REVENUE.membership_fees)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fines</span>
                <span className="font-mono">{compactUgx(DUMMY_REVENUE.fines)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total expenses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-rose-700">{formatUgx(totalExpenses)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {sortedExpenses.length} expense categories · top: {sortedExpenses[0]?.type}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Accumulated profit
            </CardTitle>
            <Sigma className="h-4 w-4 text-[#f08c2b]" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl font-bold ${
                accumulatedProfit >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatUgx(accumulatedProfit)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, profitMargin))}%`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700">{profitMargin}%</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Margin (profit ÷ revenue)</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs expenses trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChartIcon className="h-5 w-5 text-[#f08c2b]" />
            Revenue vs expenses
          </CardTitle>
          <CardDescription>
            Monthly revenue and expenditure with the resulting profit line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={pnlTrend}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickFormatter={(v: number) => compactUgx(v)}
                  width={56}
                />
                <RechartsTooltip
                  contentStyle={tooltipContentStyle}
                  formatter={(value: number, key: string) => [
                    formatUgx(value),
                    key === "revenue"
                      ? "Revenue"
                      : key === "expenses"
                        ? "Expenses"
                        : "Profit",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) =>
                    value === "revenue"
                      ? "Revenue"
                      : value === "expenses"
                        ? "Expenses"
                        : "Profit"
                  }
                />
                <Bar dataKey="revenue" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke={CHART_COLORS.profit}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Revenue + Expense breakdown side by side */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-600" />
              Revenue breakdown
            </CardTitle>
            <CardDescription>Share of income across all revenue streams.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={96}
                    paddingAngle={2}
                    stroke="white"
                    strokeWidth={2}
                  >
                    {revenueBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number, name: string) => [formatUgx(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-rose-600" />
              Expenditure by type
            </CardTitle>
            <CardDescription>
              Operating expenses grouped by category, largest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedExpenses}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickFormatter={(v: number) => compactUgx(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    width={140}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number) => [formatUgx(value), "Amount"]}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS.expense} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      </>
      )}

      {/* ===================== Balance sheet ===================== */}
      {activeTab === "balance" && (
      <>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Scale className="h-4 w-4 text-[#f08c2b]" />
        Balance sheet
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#f08c2b]" />
                Assets vs Liabilities + Equity
              </CardTitle>
              <CardDescription>
                Both bars should rise to the same height.
              </CardDescription>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-semibold ${
                balanceSheetBalanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {balanceSheetBalanced
                ? "Balanced"
                : `Imbalance · ${formatUgx(Math.abs(balanceSheetDiff))}`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={balanceSheetBars}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                barCategoryGap="40%"
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#0f172a", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickFormatter={(v: number) => compactUgx(v)}
                  width={56}
                />
                <RechartsTooltip
                  contentStyle={tooltipContentStyle}
                  formatter={(value: number, key: string) => {
                    if (Number(value) === 0) return ["", ""]
                    const label =
                      key === "assets"
                        ? "Assets"
                        : key === "liabilities"
                          ? "Liabilities"
                          : "Members' equity"
                    return [formatUgx(value), label]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  formatter={(value: string) =>
                    value === "assets"
                      ? "Assets"
                      : value === "liabilities"
                        ? "Liabilities"
                        : "Members' equity"
                  }
                />
                <Bar dataKey="assets" fill={CHART_COLORS.asset} radius={[6, 6, 0, 0]} />
                <Bar
                  dataKey="liabilities"
                  stackId="le"
                  fill={CHART_COLORS.liability}
                />
                <Bar
                  dataKey="equity"
                  stackId="le"
                  fill={CHART_COLORS.equity}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Assets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-sky-600" />
              Assets
            </CardTitle>
            <CardDescription>{formatUgx(totalAssets)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assetsList.map((a, i) => {
                const pct = totalAssets > 0 ? (a.value / totalAssets) * 100 : 0
                return (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{a.name}</span>
                      <span className="font-mono font-semibold text-gray-900">
                        {compactUgx(a.value)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct.toFixed(1)}%`,
                          backgroundColor: ASSET_PALETTE[i % ASSET_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Liabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-orange-600" />
              Liabilities
            </CardTitle>
            <CardDescription>{formatUgx(totalLiabilities)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {liabilitiesList.map((l, i) => {
                const pct = totalLiabilities > 0 ? (l.value / totalLiabilities) * 100 : 0
                return (
                  <div key={l.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{l.name}</span>
                      <span className="font-mono font-semibold text-gray-900">
                        {compactUgx(l.value)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct.toFixed(1)}%`,
                          backgroundColor: LIABILITY_PALETTE[i % LIABILITY_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span className="font-medium text-gray-700">Debt-to-asset ratio</span>
                <span className="font-mono font-semibold text-orange-700">
                  {totalAssets > 0
                    ? `${Math.round((totalLiabilities / totalAssets) * 100)}%`
                    : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members' equity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-violet-600" />
              Members&apos; equity
            </CardTitle>
            <CardDescription>{formatUgx(totalEquity)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {equityList.map((e, i) => {
                const pct = totalEquity > 0 ? (e.value / totalEquity) * 100 : 0
                return (
                  <div key={e.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{e.name}</span>
                      <span className="font-mono font-semibold text-gray-900">
                        {compactUgx(e.value)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct.toFixed(1)}%`,
                          backgroundColor: EQUITY_PALETTE[i % EQUITY_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span className="font-medium text-gray-700">Equity-to-asset ratio</span>
                <span className="font-mono font-semibold text-violet-700">
                  {totalAssets > 0
                    ? `${Math.round((totalEquity / totalAssets) * 100)}%`
                    : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      </>
      )}

      {/* ===================== Loan portfolio ===================== */}
      {activeTab === "loans" && (
      <>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <CreditCard className="h-4 w-4 text-[#f08c2b]" />
        Loan portfolio
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Outstanding balance
            </CardTitle>
            <Briefcase className="h-4 w-4 text-[#f08c2b]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatUgx(DUMMY_LOAN_PORTFOLIO.total_balance)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Avg loan {compactUgx(DUMMY_LOAN_PORTFOLIO.average_loan)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active borrowers
            </CardTitle>
            <Users className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {DUMMY_LOAN_PORTFOLIO.active_borrowers.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Unique members with active loans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active loans
            </CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {DUMMY_LOAN_PORTFOLIO.active_loans.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Across all products</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Portfolio at risk (30)
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-rose-700">
              {DUMMY_LOAN_PORTFOLIO.par30_pct.toFixed(1)}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {compactUgx(DUMMY_LOAN_PORTFOLIO.par30_amount)} overdue &gt; 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#f08c2b]" />
              Outstanding balance by product
            </CardTitle>
            <CardDescription>Loan book composition by product line.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={loanProductsChart}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickFormatter={(v: number) => compactUgx(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="product"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    width={110}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number, key: string) => [
                      key === "balance" ? formatUgx(value) : value.toLocaleString(),
                      key === "balance" ? "Outstanding" : "Borrowers",
                    ]}
                  />
                  <Bar dataKey="balance" fill={CHART_COLORS.bank} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#f08c2b]" />
              Loan products
            </CardTitle>
            <CardDescription>Detailed product-level book.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <DataTable
              columns={loanProductColumns}
              rows={DUMMY_LOAN_PRODUCTS}
              loading={loading}
              emptyMessage="No loan products."
            />
          </CardContent>
        </Card>
      </div>

      </>
      )}

      {/* ===================== Membership contributions ===================== */}
      {activeTab === "membership" && (
      <>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="h-4 w-4 text-[#f08c2b]" />
        Membership contributions
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMembers.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">Across all tiers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Meeting threshold
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {totalMembersMeeting.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {membershipCompliance}% compliance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Below threshold
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">
              {totalMembersShort.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalMembers > 0
                ? `${100 - membershipCompliance}% gap to close`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total members&apos; savings
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-violet-700">
              {formatUgx(DUMMY_EQUITY.members_savings)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">From all tiers</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#f08c2b]" />
              Members vs threshold by tier
            </CardTitle>
            <CardDescription>
              How many members meet their tier&apos;s minimum contribution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={membershipChart}
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="tier"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    width={40}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number, key: string) => [
                      value.toLocaleString(),
                      key === "meeting" ? "Meeting threshold" : "Below threshold",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) =>
                      value === "meeting" ? "Meeting threshold" : "Below threshold"
                    }
                  />
                  <Bar
                    dataKey="meeting"
                    stackId="m"
                    fill={CHART_COLORS.met}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="short"
                    stackId="m"
                    fill={CHART_COLORS.short}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[#f08c2b]" />
              Average contribution per tier
            </CardTitle>
            <CardDescription>
              Average member contribution vs the tier threshold (dashed line).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={membershipChart}
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="tier"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickFormatter={(v: number) => compactUgx(v)}
                    width={56}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number, key: string) => [
                      formatUgx(value),
                      key === "avg_contribution" ? "Avg contribution" : "Threshold",
                    ]}
                  />
                  <ReferenceLine y={0} stroke={CHART_COLORS.grid} />
                  <Bar
                    dataKey="avg_contribution"
                    fill={CHART_COLORS.equity}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="threshold"
                    stroke={CHART_COLORS.bank}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      </>
      )}

      {/* ===================== Grants ===================== */}
      {activeTab === "grants" && (
      <>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <HandCoins className="h-4 w-4 text-[#f08c2b]" />
        Grants
      </div>

      {/* Grants pledged vs received */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-[#f08c2b]" />
            Grants — received vs remaining
          </CardTitle>
          <CardDescription>
            Stacked view of each grant&apos;s drawn-down balance against the outstanding pledge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grantsCompareData.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              No grants to chart for the current filters.
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={grantsCompareData}
                  margin={{ top: 10, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickFormatter={(v: number) => compactUgx(v)}
                    width={56}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: number, key: string) => [
                      formatUgx(value),
                      key === "received" ? "Received" : "Remaining",
                    ]}
                    labelFormatter={(_label: string, payload) => {
                      const full = (payload?.[0]?.payload as { full_name?: string } | undefined)
                        ?.full_name
                      return full || _label
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) =>
                      value === "received" ? "Received" : "Remaining"
                    }
                  />
                  <Bar
                    dataKey="received"
                    stackId="grant"
                    fill={CHART_COLORS.bank}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="remaining"
                    stackId="grant"
                    fill={CHART_COLORS.remaining}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      </>
      )}

      {/* Branches tab — bank + unclaimed rollup */}
      {activeTab === "branches" && (
      <>
      {/* Bank balances snapshot + Unclaimed rollup side by side on lg */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-[#f08c2b]" />
              Bank account snapshot
            </CardTitle>
            <CardDescription>
              Latest known balance for every registered bank account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <DataTable
              columns={bankColumns}
              rows={filteredBankBalances}
              loading={loading}
              emptyMessage="No bank accounts match the current filters."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-amber-600" />
              Unclaimed deposits roll-up
            </CardTitle>
            <CardDescription>
              Open vs claimed deposits grouped by branch.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <DataTable
              columns={unclaimedColumns}
              rows={filteredUnclaimed}
              loading={loading}
              emptyMessage="No unclaimed deposit activity for the current filters."
            />
          </CardContent>
        </Card>
      </div>

      </>
      )}

      {/* Grants tab — utilisation table */}
      {activeTab === "grants" && (
      <>
      {/* Grants performance */}
      <Card className="mb-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-[#f08c2b]" />
            Grant utilisation
          </CardTitle>
          <CardDescription>
            How much of each pledge has been received, and how much remains outstanding.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <DataTable
            columns={grantColumns}
            rows={filteredGrants}
            loading={loading}
            emptyMessage="No grants match the current filters."
          />
        </CardContent>
      </Card>
      </>
      )}

        </motion.div>
      </AnimatePresence>
    </>
  )
}
