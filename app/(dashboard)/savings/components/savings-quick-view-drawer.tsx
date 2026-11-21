"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  PiggyBank,
  User,
  Calendar,
  CreditCard,
  ArrowUpDown,
  Lock,
  Clock,
  TrendingUp,
  FileText,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import TooltipButton from "@/components/newUI/tooltip_button"

export type DrawerSavingsAccount = {
  id: string
  member_id: string
  account_number: string
  account_type: string
  available_balance: number
  total_balance: number
  status: string
  open_date: string
  client_name: string
}

interface SavingsQuickViewDrawerProps {
  account: DrawerSavingsAccount | null
  formatMoney: (amount: number) => string
  isOpen: boolean
  onClose: () => void
  onAddTransaction: (account: DrawerSavingsAccount) => void
  canAddTransaction: boolean
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function SavingsQuickViewDrawer({
  account,
  formatMoney,
  isOpen,
  onClose,
  onAddTransaction,
  canAddTransaction,
}: SavingsQuickViewDrawerProps) {
  if (!account) return null

  const isFixed = account.account_type === "Fixed"
  const isShares = account.account_type === "Shares"
  const getTypePill = (type: string) => {
    const t = String(type || "").toLowerCase()
    if (t.includes("volunt")) return "border-blue-200 text-blue-700 bg-blue-50/50 dark:border-blue-500/30 dark:text-blue-300 dark:bg-blue-500/15"
    if (t.includes("fix") || t.includes("deposit")) return "border-purple-200 text-purple-700 bg-purple-50/50 dark:border-purple-500/30 dark:text-purple-300 dark:bg-purple-500/15"
    if (t.includes("share")) return "border-brand/30 text-brand bg-brand/10"
    if (t.includes("group")) return "border-emerald-200 text-emerald-700 bg-emerald-50/50 dark:border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-500/15"
    if (t.includes("current")) return "border-cyan-200 text-cyan-700 bg-cyan-50/50 dark:border-cyan-500/30 dark:text-cyan-300 dark:bg-cyan-500/15"
    return "border-border text-muted-foreground bg-muted"
  }

  const statusStyles: Record<string, { border: string; text: string; dot: string }> = {
    Active: { border: "border-emerald-200 text-emerald-700 bg-emerald-50/50 dark:border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-500/15", text: "Active", dot: "bg-emerald-500" },
    Inactive: { border: "border-border text-muted-foreground bg-muted", text: "Inactive", dot: "bg-muted-foreground" },
    Suspended: { border: "border-rose-200 text-rose-700 bg-rose-50/50 dark:border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/15", text: "Suspended", dot: "bg-rose-500" },
    Closed: { border: "border-border text-muted-foreground bg-muted", text: "Closed", dot: "bg-muted-foreground" },
  }

  const statusObj = statusStyles[account.status] || statusStyles["Inactive"]

  // Mock Maturity for Fixed Accounts
  const tenureMonths = 12
  const interestRate = 12.0
  const openDateObj = account.open_date ? new Date(account.open_date) : new Date()
  const maturityDateObj = new Date(openDateObj)
  maturityDateObj.setMonth(maturityDateObj.getMonth() + tenureMonths)
  const projectedInterest = Math.round((account.total_balance || 0) * (interestRate / 100))
  const totalMaturityPayout = (account.total_balance || 0) + projectedInterest

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Slide-over Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card text-foreground shadow-2xl flex flex-col border-l border-border"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-border flex items-start justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 border-2 border-brand text-brand font-black flex items-center justify-center text-sm shadow-2xs">
                  {getInitials(account.client_name)}
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-lg leading-tight">
                    {account.client_name}
                  </h3>
                  <div className="text-xs font-mono font-medium text-muted-foreground mt-0.5">
                    Acc No: {account.account_number}
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusObj.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusObj.dot}`} />
                      {statusObj.text}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getTypePill(
                        account.account_type,
                      )}`}
                    >
                      {account.account_type} Account
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/20">
              {/* Financial Balance Summary Card */}
              <div className="bg-card rounded-2xl p-4 border border-border shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-brand" /> Balance Breakdown
                </h4>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase">Available Balance</span>
                    <div className="text-base font-bold text-foreground mt-0.5">
                      {formatMoney(Number(account.available_balance || 0))}
                    </div>
                  </div>

                  <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase">Total Balance</span>
                    <div className="text-base font-bold text-foreground mt-0.5">
                      {formatMoney(Number(account.total_balance || 0))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Deposit Details Card (If Fixed Account) */}
              {isFixed && (
                <div className="bg-purple-500/5 rounded-2xl p-4 border border-purple-500/25 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" /> Fixed Deposit Terms & Maturity
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-purple-500/15">
                      <span className="text-muted-foreground">Lock-in Period</span>
                      <span className="font-semibold text-foreground">{tenureMonths} Months</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-purple-500/15">
                      <span className="text-muted-foreground">Annual Interest Rate</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">{interestRate}% p.a.</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-purple-500/15">
                      <span className="text-muted-foreground">Maturity Date</span>
                      <span className="font-bold text-foreground">{formatDate(maturityDateObj.toISOString())}</span>
                    </div>

                    <div className="flex justify-between py-1 pt-1 font-semibold text-foreground">
                      <span className="text-muted-foreground">Expected Total Payout</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(totalMaturityPayout)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Metadata Audit */}
              <div className="bg-card rounded-2xl p-4 border border-border shadow-2xs space-y-2 text-xs">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-brand" /> Account Registry Audit
                </h4>

                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Opened Date</span>
                  <span className="font-semibold text-foreground">{formatDate(account.open_date)}</span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Account Type</span>
                  <span className="font-semibold text-foreground">{account.account_type}</span>
                </div>
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 bg-card border-t border-border flex items-center gap-3">
              <Link href={`/savings/${account.id}`} className="flex-1">
                <Button className="w-full bg-brand hover:bg-brand-700 text-brand-foreground font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer text-xs">
                  Full Account Details
                </Button>
              </Link>

              {/* Add Transaction Button with Tooltip */}
              {canAddTransaction ? (
                <TooltipButton
                  tooltip="Process deposit or withdrawal transaction"
                  onClick={() => {
                    onClose()
                    onAddTransaction(account)
                  }}
                  className="group relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-muted hover:bg-brand/10 text-foreground hover:text-brand border border-border hover:border-brand/40 hover:scale-105 transition-all duration-200 focus:outline-none shadow-2xs cursor-pointer"
                >
                  <ArrowUpDown className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
                </TooltipButton>
              ) : (
                <TooltipButton
                  tooltip="Process Transaction (No permission)"
                  disabled
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                >
                  <ArrowUpDown className="h-4.5 w-4.5" />
                </TooltipButton>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
