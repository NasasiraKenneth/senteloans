"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import FinancesKpiSection, { type FinancesKpiStats } from "./components/FinancesKpiSection"
import AddBankAccount from "./components/add/addBankAccount"
import AddDailyReport from "./components/add/addDailyReport"
import AddGrant from "./components/add/addGrant"
import AddUnclaimedDeposit from "./components/add/addUnclaimedDeposit"
import FinancesTabNavigation from "./components/FinancesTabNavigation"
import BankAccountsView from "./components/views/bank_accounts"
import UnclaimedDepositsView from "./components/views/un_claimed_deposits"
import GrantsView from "./components/views/grants"
import type { FinanceSection, FinanceTabCounts } from "./types"
import { formatCurrency } from "./utils"
import { Plus, Building2, HandCoins, Inbox } from "lucide-react"

const EMPTY_KPI: FinancesKpiStats = {
  bankTotal: 0,
  bankAccountCount: 0,
  unclaimedOpenAmount: 0,
  unclaimedOpenCount: 0,
  unclaimedTotalCount: 0,
  grantsAvailable: 0,
  grantsTotalAllocated: 0,
  grantsUnclaimed: 0,
  grantCount: 0,
  float: { cash: 0, mobileMoney: 0, bank: 0, available: 0 },
}

const EMPTY_TAB_COUNTS: FinanceTabCounts = {
  bank: 0,
  unclaimed: 0,
  unclaimedOpen: 0,
  grants: 0,
}

const sectionMeta = {
  bank: {
    title: "Bank accounts",
    description: "Track bank name, account number, and balances per branch.",
    addLabel: "Add bank account",
    icon: Building2,
  },
  unclaimed: {
    title: "Unclaimed deposits",
    description: "Record deposits before they are linked to a member or client.",
    addLabel: "Add unclaimed deposit",
    icon: Inbox,
  },
  grants: {
    title: "Grants",
    description: "Allocate and monitor grant pools per client organization.",
    addLabel: "Add grant",
    icon: HandCoins,
  },
} as const

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<FinanceSection>("bank")
  const [addBankOpen, setAddBankOpen] = useState(false)
  const [addUnclaimedOpen, setAddUnclaimedOpen] = useState(false)
  const [addGrantOpen, setAddGrantOpen] = useState(false)
  const [addDailyReportOpen, setAddDailyReportOpen] = useState(false)
  const [dataRefreshKey, setDataRefreshKey] = useState(0)
  const [kpiStats, setKpiStats] = useState<FinancesKpiStats>(EMPTY_KPI)
  const [tabCounts, setTabCounts] = useState<FinanceTabCounts>(EMPTY_TAB_COUNTS)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await fetch("/api/institution/finances/summary", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setKpiStats(EMPTY_KPI)
        setTabCounts(EMPTY_TAB_COUNTS)
        return
      }
      if (body?.summary) {
        setKpiStats({
          bankTotal: Number(body.summary.bankTotal || 0),
          bankAccountCount: Number(body.summary.bankAccountCount || 0),
          unclaimedOpenAmount: Number(body.summary.unclaimedOpenAmount || 0),
          unclaimedOpenCount: Number(body.summary.unclaimedOpenCount || 0),
          unclaimedTotalCount: Number(body.summary.unclaimedTotalCount || 0),
          grantsAvailable: Number(body.summary.grantsAvailable || 0),
          grantsTotalAllocated: Number(body.summary.grantsTotalAllocated || 0),
          grantsUnclaimed: Number(body.summary.grantsUnclaimed || 0),
          grantCount: Number(body.summary.grantCount || 0),
          float: {
            cash: Number(body.summary.float?.cash || 0),
            mobileMoney: Number(body.summary.float?.mobileMoney || 0),
            bank: Number(body.summary.float?.bank || 0),
            available: Number(body.summary.float?.available || 0),
          },
        })
      }
      if (body?.tabCounts) {
        setTabCounts({
          bank: Number(body.tabCounts.bank || 0),
          unclaimed: Number(body.tabCounts.unclaimed || 0),
          unclaimedOpen: Number(body.tabCounts.unclaimedOpen || 0),
          grants: Number(body.tabCounts.grants || 0),
        })
      }
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary, dataRefreshKey])

  const active = sectionMeta[activeTab]
  const CurrentTabIcon = active.icon

  const openAddModal = () => {
    if (activeTab === "bank") setAddBankOpen(true)
    else if (activeTab === "unclaimed") setAddUnclaimedOpen(true)
    else setAddGrantOpen(true)
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "bank":
        return (
          <BankAccountsView
            refreshKey={dataRefreshKey}
            onRefresh={() => setDataRefreshKey((k) => k + 1)}
          />
        )
      case "unclaimed":
        return (
          <UnclaimedDepositsView
            refreshKey={dataRefreshKey}
            onRefresh={() => setDataRefreshKey((k) => k + 1)}
          />
        )
      case "grants":
        return (
          <GrantsView
            refreshKey={dataRefreshKey}
            onRefresh={() => setDataRefreshKey((k) => k + 1)}
          />
        )
    }
  }

  return (
    <motion.div className="space-y-6">
      <FinancesKpiSection
        stats={kpiStats}
        formatCurrency={formatCurrency}
        onAddDailyReport={() => setAddDailyReportOpen(true)}
      />

      <AddDailyReport
        isOpen={addDailyReportOpen}
        onClose={() => setAddDailyReportOpen(false)}
        onSuccess={() => setDataRefreshKey((k) => k + 1)}
      />

      <motion.div className="rounded-2xl border border-gray-100 bg-white shadow-xl">
        <motion.div className="overflow-visible border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100/50 p-6">
          <FinancesTabNavigation
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab)
              setAddBankOpen(false)
              setAddUnclaimedOpen(false)
              setAddGrantOpen(false)
            }}
            counts={tabCounts}
          />

          <motion.div
            key={`${activeTab}-header`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <motion.div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <motion.div className="flex items-center gap-4">
                <motion.div className="rounded-xl border border-[#f08c2b]/15 bg-gradient-to-br from-[#f08c2b]/15 to-[#f08c2b]/5 p-3 shadow-[0_4px_12px_rgba(240,140,43,0.08)]">
                  <CurrentTabIcon className="h-7 w-7 text-[#f08c2b]" />
                </motion.div>
                <motion.div>
                  <h2 className="mb-1 text-2xl font-bold text-gray-900">{active.title}</h2>
                  <p className="text-gray-600">{active.description}</p>
                </motion.div>
              </motion.div>

              <motion.div className="relative shrink-0 self-start sm:self-center">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openAddModal}
                  className="flex items-center rounded-lg border border-[#f08c2b] bg-gradient-to-br from-[#f08c2b]/15 to-[#f08c2b]/5 px-5 py-2.5 text-sm font-semibold text-[#f08c2b] shadow-md transition-colors hover:border-black hover:text-black"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  {active.addLabel}
                </motion.button>

                <AddBankAccount
                  isOpen={addBankOpen}
                  onClose={() => setAddBankOpen(false)}
                  onSuccess={() => setDataRefreshKey((k) => k + 1)}
                />
                <AddUnclaimedDeposit
                  isOpen={addUnclaimedOpen}
                  onClose={() => setAddUnclaimedOpen(false)}
                  onSuccess={() => setDataRefreshKey((k) => k + 1)}
                />
                <AddGrant
                  isOpen={addGrantOpen}
                  onClose={() => setAddGrantOpen(false)}
                  onSuccess={() => setDataRefreshKey((k) => k + 1)}
                />
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div className="overflow-visible p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {summaryLoading ? (
                <p className="text-sm text-muted-foreground">Loading treasury data…</p>
              ) : (
                renderTabContent()
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
