"use client"

import { useEffect, useState } from "react"
import {
  DollarSign,
  PieChart,
  PiggyBank,
  ClipboardList,
  Info,
  Settings as SettingsIcon,
} from "lucide-react"
import Link from "next/link"
import { useStaffSession } from "@/components/staff-session-provider"

type RequirementsConfig = {
  currency: string
  membershipFee: number
  modules: { shares: boolean; savings: boolean }
  minimumShares: number
  maximumShares?: number | null
  shareValue: number
}

type RequirementRow = {
  key: string
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  title: string
  value: string
  hint: string
}

/**
 * Compact info strip showing the membership requirements pulled from branch
 * config. Designed to sit above the registration form without competing
 * visually with it — single card, header strip + 3-column divided grid, no
 * nested mini-cards or hover effects on non-interactive elements.
 */
export function MemberRequirementsCard() {
  const { session } = useStaffSession()
  const [config, setConfig] = useState<RequirementsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clientTerminology =
    (typeof session?.institution?.config?.clientTerminology === "string" &&
      session.institution.config.clientTerminology.trim()) ||
    "Member"

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (!res.ok) {
          if (active) setError("Failed to load membership requirements")
          return
        }
        const data = await res.json()
        if (!active) return
        const cfg = data?.config || {}
        setConfig({
          currency: cfg.currency || "UGX",
          membershipFee: Number(cfg.membershipFee || 0),
          modules: {
            shares: !!cfg.modules?.shares,
            savings: !!cfg.modules?.savings,
          },
          minimumShares: Number(cfg.minimumShares || 0),
          maximumShares:
            cfg.maximumShares === null || cfg.maximumShares === undefined
              ? null
              : Number(cfg.maximumShares),
          shareValue: Number(cfg.shareValue || 0),
        })
      } catch {
        if (active) setError("Failed to load membership requirements")
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <RequirementsHeader clientTerminology={clientTerminology} />
        <div className="grid sm:grid-cols-3 sm:divide-x divide-y sm:divide-y-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 shadow-sm flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        {error || "Membership configuration is unavailable."}
      </div>
    )
  }

  const fmt = (n: number) => `${config.currency} ${Number(n || 0).toLocaleString()}`
  const rows: RequirementRow[] = []

  if (config.membershipFee > 0) {
    rows.push({
      key: "fee",
      icon: DollarSign,
      iconBg: "bg-orange-100 dark:bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
      title: "Membership fee",
      value: fmt(config.membershipFee),
      hint: "One-time. Can be paid in installments after registration.",
    })
  }

  if (config.modules.shares && config.minimumShares > 0 && config.shareValue > 0) {
    const minTotal = config.minimumShares * config.shareValue
    const maxNote =
      typeof config.maximumShares === "number" && config.maximumShares > config.minimumShares
        ? ` · max ${config.maximumShares.toLocaleString()}`
        : ""
    rows.push({
      key: "shares",
      icon: PieChart,
      iconBg: "bg-blue-100 dark:bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "Minimum shares",
      value: fmt(minTotal),
      hint: `${config.minimumShares.toLocaleString()} shares × ${fmt(config.shareValue)}${maxNote}`,
    })
  }

  if (config.modules.savings) {
    rows.push({
      key: "savings",
      icon: PiggyBank,
      iconBg: "bg-emerald-100 dark:bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      title: "Monthly savings",
      value: "Agreed at registration",
      hint: "Voluntary or Fixed — pick per member during signup.",
    })
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      <RequirementsHeader clientTerminology={clientTerminology} />
      <div className="grid sm:grid-cols-3 sm:divide-x divide-y sm:divide-y-0">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div key={row.key} className="flex items-start gap-3 p-4">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${row.iconBg}`}
              >
                <Icon className={`h-4 w-4 ${row.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                  {row.title}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground leading-tight truncate">
                  {row.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-2">
                  {row.hint}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RequirementsHeader({ clientTerminology }: { clientTerminology: string }) {
  return (
    <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {clientTerminology} requirements
      </h3>
      <Link
        href="/settings"
        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <SettingsIcon className="h-3 w-3" />
        <span className="hidden sm:inline">Configure</span>
      </Link>
    </div>
  )
}
