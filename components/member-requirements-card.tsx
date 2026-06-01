"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, PieChart, PiggyBank, ClipboardList, Info } from "lucide-react"

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
  description: string
}

export function MemberRequirementsCard() {
  const [config, setConfig] = useState<RequirementsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Membership Requirements
          </CardTitle>
          <CardDescription>Loading requirements from your branch configuration…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Membership Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error || "Configuration unavailable."}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const fmt = (n: number) => `${config.currency} ${Number(n || 0).toLocaleString()}`
  const rows: RequirementRow[] = []

  if (config.membershipFee > 0) {
    rows.push({
      key: "fee",
      icon: DollarSign,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      title: "Membership Fee",
      value: fmt(config.membershipFee),
      description:
        "One-time fee paid at registration. Can be paid in full or in partial installments from the member's profile.",
    })
  }

  if (config.modules.shares && config.minimumShares > 0 && config.shareValue > 0) {
    const minTotal = config.minimumShares * config.shareValue
    const maxNote =
      typeof config.maximumShares === "number" && config.maximumShares > config.minimumShares
        ? ` (max ${config.maximumShares.toLocaleString()} shares)`
        : ""
    rows.push({
      key: "shares",
      icon: PieChart,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      title: "Shares",
      value: `${fmt(minTotal)} minimum`,
      description: `${config.minimumShares.toLocaleString()} shares × ${fmt(config.shareValue)} per share${maxNote}.`,
    })
  }

  if (config.modules.savings) {
    rows.push({
      key: "savings",
      icon: PiggyBank,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      title: "Monthly Savings",
      value: "Agreed at registration",
      description:
        "Each member commits to a monthly savings contribution. Account opens as Voluntary by default and can be switched to Fixed from the member's profile.",
    })
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Membership Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              No additional requirements are configured for this branch. New members can be registered without
              a membership fee, shares, or monthly savings contribution.
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          Membership Requirements
        </CardTitle>
        <CardDescription>
          Pulled from your branch configuration. Update them in{" "}
          <span className="font-medium">Settings → Policies</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {rows.map((row) => {
            const Icon = row.icon
            return (
              <div
                key={row.key}
                className="flex flex-col gap-2 rounded-lg border bg-card/50 p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${row.iconBg}`}>
                    <Icon className={`h-4 w-4 ${row.iconColor}`} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{row.value}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">{row.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
