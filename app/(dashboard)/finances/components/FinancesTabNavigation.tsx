"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Activity, Building2, HandCoins, Inbox } from "lucide-react"
import type { FinanceSection, FinanceTabCounts } from "../types"

type TabConfig = {
  id: FinanceSection
  label: string
  description: string
  icon: LucideIcon
  count: number
}

const ACTIVE_TAB_BG = "border border-[#f08c2b]/15 bg-[#000000]/90"
const ACTIVE_TAB_BADGE =
  "border border-[#f08c2b]/15 bg-[#f08c2b]/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f08c2b]/80"

type FinancesTabNavigationProps = {
  activeTab: FinanceSection
  onTabChange: (tab: FinanceSection) => void
  counts: FinanceTabCounts
}

export default function FinancesTabNavigation({
  activeTab,
  onTabChange,
  counts,
}: FinancesTabNavigationProps) {
  const tabs: TabConfig[] = [
    {
      id: "bank",
      label: "Bank accounts",
      description: "Treasury bank registers",
      icon: Building2,
      count: counts.bank,
    },
    {
      id: "unclaimed",
      label: "Unclaimed deposits",
      description: "Pending assignment",
      icon: Inbox,
      count: counts.unclaimed,
    },
    {
      id: "grants",
      label: "Grants",
      description: "Third-party agent grant balances",
      icon: HandCoins,
      count: counts.grants,
    },
  ]

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col gap-2 p-1 bg-gray-100 rounded-2xl sm:flex-row sm:space-x-2 sm:space-y-0">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <motion.button
              key={tab.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex-1 flex min-w-0 items-center justify-center rounded-xl px-4 py-4 transition-all duration-300 group ${
                isActive
                  ? "text-[#f08c2b]"
                  : "text-gray-600 hover:bg-white/80 hover:text-gray-900"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="financesActiveTab"
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
                      isActive ? "text-[#f08c2b]" : "text-gray-500 group-hover:text-gray-700"
                    }`}
                  />
                </div>

                <div className="flex min-w-0 flex-col items-center text-center">
                  <span
                    className={`truncate text-sm font-semibold transition-all duration-300 ${
                      isActive ? "text-[#f08c2b]" : "text-gray-700 group-hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                  </span>
                  <span
                    className={`hidden truncate text-xs transition-all duration-300 sm:block ${
                      isActive ? "text-[#f08c2b]/80" : "text-gray-500 group-hover:text-gray-600"
                    }`}
                  >
                    {tab.description}
                  </span>
                </div>

                <div
                  className={`shrink-0 rounded-full transition-all duration-300 ${
                    isActive
                      ? ACTIVE_TAB_BADGE
                      : "bg-gray-200 px-2 py-1 text-xs font-medium text-gray-600 group-hover:bg-gray-300"
                  }`}
                >
                  {tab.count}
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
