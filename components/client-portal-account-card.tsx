"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Wifi } from "lucide-react"
import { cn } from "@/lib/utils"

const SAVINGS_THEMES = [
  {
    gradient: "from-[#f08c2b] via-[#ffa750] to-[#e07b1b]",
    chip: "bg-amber-300/90",
    glow: "shadow-orange-500/20",
  },
  {
    gradient: "from-[#1f1f24] via-[#0f0f12] to-[#050507]",
    chip: "bg-amber-300/90",
    glow: "shadow-black/30",
  },
  {
    gradient: "from-[#b45309] via-[#d97706] to-[#78350f]",
    chip: "bg-amber-300/90",
    glow: "shadow-amber-500/20",
  },
  {
    gradient: "from-[#2e231b] via-[#1a1410] to-[#0c0c0e]",
    chip: "bg-amber-300/90",
    glow: "shadow-orange-500/10",
  },
] as const

const HIDDEN_ACCOUNT_NUMBER = "•••• •••• •••• ••••"

function formatAccountNumber(value: string): string {
  const clean = value.replace(/\s/g, "")
  if (!clean) return value
  return clean.replace(/(.{4})/g, "$1 ").trim()
}

function formatOpenDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

export type SavingsAccountCardProps = {
  accountType: string
  accountNumber: string
  availableBalance: string
  totalBalance: string
  status: string
  openDate?: string
  cardholderName: string
  institutionName?: string
  balanceHidden?: boolean
  hiddenBalanceText?: string
  href: string
  themeIndex?: number
  className?: string
  index?: number
}

export function SavingsAccountCard({
  accountType,
  accountNumber,
  availableBalance,
  totalBalance,
  status,
  openDate,
  cardholderName,
  institutionName,
  balanceHidden = false,
  hiddenBalanceText = "••••••",
  href,
  themeIndex = 0,
  className,
  index = 0,
}: SavingsAccountCardProps) {
  const theme = SAVINGS_THEMES[themeIndex % SAVINGS_THEMES.length]
  const displayNumber = balanceHidden ? HIDDEN_ACCOUNT_NUMBER : formatAccountNumber(accountNumber)
  const isActive = String(status).toLowerCase() === "active"

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02 }}
      className={cn(
        "relative aspect-[1.586/1] w-full shrink-0 overflow-hidden rounded-2xl p-5 text-white shadow-xl transition-shadow duration-300",
        `bg-gradient-to-br ${theme.gradient} ${theme.glow}`,
        "cursor-pointer hover:shadow-2xl",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, #fff 0, #fff 1px, transparent 1px, transparent 12px)",
        }}
      />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              Savings account
            </p>
            <p className="mt-0.5 truncate text-base font-semibold leading-tight text-white">{accountType}</p>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed tracking-[0.06em] text-white/75 sm:text-xs">
              {displayNumber}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  isActive ? "bg-emerald-500 text-white" : "bg-white/20 text-white/80",
                )}
              >
                {status}
              </span>
              <Wifi className="h-4 w-4 rotate-90 text-white/40" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/45">Available</p>
              <p className="text-xl font-bold tabular-nums leading-tight sm:text-2xl">
                {balanceHidden ? hiddenBalanceText : availableBalance}
              </p>
            </div>
          </div>
        </div>

        <div className={cn("h-8 w-11 rounded-md", theme.chip)} aria-hidden />

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/10 pt-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wider text-white/50">
              {cardholderName}
            </p>
            {institutionName ? (
              <p className="truncate text-[11px] text-white/40">{institutionName}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Total</p>
            <p className="text-base font-bold tabular-nums">
              {balanceHidden ? hiddenBalanceText : totalBalance}
            </p>
            {openDate ? (
              <p className="mt-0.5 text-[10px] text-white/40">Since {formatOpenDate(openDate)}</p>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )

  return (
    <Link
      href={href}
      className="block w-full shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  )
}

export function SavingsAccountCardSkeleton() {
  return (
    <div className="aspect-[1.586/1] w-full max-w-[340px] shrink-0 animate-pulse rounded-2xl bg-muted lg:ml-auto" />
  )
}
