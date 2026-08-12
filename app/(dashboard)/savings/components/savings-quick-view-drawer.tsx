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
    if (t.includes("volunt")) return "border-blue-200 text-blue-700 bg-blue-50/50"
    if (t.includes("fix") || t.includes("deposit")) return "border-purple-200 text-purple-700 bg-purple-50/50"
    if (t.includes("share")) return "border-orange-200 text-orange-700 bg-orange-50/50"
    if (t.includes("group")) return "border-emerald-200 text-emerald-700 bg-emerald-50/50"
    if (t.includes("current")) return "border-cyan-200 text-cyan-700 bg-cyan-50/50"
    return "border-slate-200 text-slate-700 bg-slate-50"
  }

  const statusStyles: Record<string, { border: string; text: string; dot: string }> = {
    Active: { border: "border-emerald-200 text-emerald-700 bg-emerald-50/50", text: "Active", dot: "bg-emerald-500" },
    Inactive: { border: "border-slate-200 text-slate-600 bg-slate-50", text: "Inactive", dot: "bg-slate-400" },
    Suspended: { border: "border-rose-200 text-rose-700 bg-rose-50/50", text: "Suspended", dot: "bg-rose-500" },
    Closed: { border: "border-slate-200 text-slate-600 bg-slate-50", text: "Closed", dot: "bg-slate-400" },
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
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
          />

          {/* Slide-over Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white border-2 border-[#F08C2B] text-[#F08C2B] font-black flex items-center justify-center text-sm shadow-2xs">
                  {getInitials(account.client_name)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">
                    {account.client_name}
                  </h3>
                  <div className="text-xs font-mono font-medium text-slate-500 mt-0.5">
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
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40">
              {/* Financial Balance Summary Card */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-[#F08C2B]" /> Balance Breakdown
                </h4>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Available Balance</span>
                    <div className="text-base font-bold text-slate-900 mt-0.5">
                      {formatMoney(Number(account.available_balance || 0))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Balance</span>
                    <div className="text-base font-bold text-slate-900 mt-0.5">
                      {formatMoney(Number(account.total_balance || 0))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Deposit Details Card (If Fixed Account) */}
              {isFixed && (
                <div className="bg-white rounded-2xl p-4 border border-purple-200/80 bg-purple-50/20 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-purple-600" /> Fixed Deposit Terms & Maturity
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-purple-100/60">
                      <span className="text-slate-500">Lock-in Period</span>
                      <span className="font-semibold text-slate-900">{tenureMonths} Months</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-purple-100/60">
                      <span className="text-slate-500">Annual Interest Rate</span>
                      <span className="font-semibold text-purple-700">{interestRate}% p.a.</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-purple-100/60">
                      <span className="text-slate-500">Maturity Date</span>
                      <span className="font-bold text-slate-900">{formatDate(maturityDateObj.toISOString())}</span>
                    </div>

                    <div className="flex justify-between py-1 pt-1 font-semibold text-slate-900">
                      <span className="text-slate-600">Expected Total Payout</span>
                      <span className="font-bold text-emerald-600">{formatMoney(totalMaturityPayout)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Metadata Audit */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-2 text-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-[#F08C2B]" /> Account Registry Audit
                </h4>

                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Opened Date</span>
                  <span className="font-semibold text-slate-800">{formatDate(account.open_date)}</span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Account Type</span>
                  <span className="font-semibold text-slate-800">{account.account_type}</span>
                </div>
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
              <Link href={`/savings/${account.id}`} className="flex-1">
                <Button className="w-full bg-[#F08C2B] hover:bg-[#d9771e] text-white font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer text-xs">
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
                  className="group relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-[#F08C2B] border border-slate-200 hover:border-[#F08C2B]/40 hover:scale-105 transition-all duration-200 focus:outline-none shadow-2xs cursor-pointer"
                >
                  <ArrowUpDown className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
                </TooltipButton>
              ) : (
                <TooltipButton
                  tooltip="Process Transaction (No permission)"
                  disabled
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed"
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
