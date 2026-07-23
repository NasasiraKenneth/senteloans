"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SummaryCardVariant = "savings" | "loans" | "shares" | "default"

const VARIANTS: Record<
  SummaryCardVariant,
  {
    iconBg: string
    iconColor: string
    accent: string
    glow: string
    bar: string
  }
> = {
  savings: {
    iconBg: "bg-accent/10 dark:bg-accent/20",
    iconColor: "text-accent",
    accent: "from-accent/8 via-accent/5 to-transparent",
    glow: "group-hover:shadow-accent/10",
    bar: "bg-accent",
  },
  loans: {
    iconBg: "bg-primary/10 dark:bg-primary/20",
    iconColor: "text-primary dark:text-foreground",
    accent: "from-primary/8 via-primary/5 to-transparent",
    glow: "group-hover:shadow-primary/10",
    bar: "bg-primary dark:bg-foreground",
  },
  shares: {
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    accent: "from-amber-500/8 via-amber-400/5 to-transparent",
    glow: "group-hover:shadow-amber-500/10",
    bar: "bg-amber-500",
  },
  default: {
    iconBg: "bg-zinc-500/10 dark:bg-zinc-500/20",
    iconColor: "text-zinc-600 dark:text-zinc-400",
    accent: "from-zinc-500/8 via-zinc-400/5 to-transparent",
    glow: "group-hover:shadow-zinc-500/10",
    bar: "bg-zinc-500",
  },
}

export type ClientPortalSummaryCardProps = {
  variant: SummaryCardVariant
  label: string
  value: string
  sub?: string
  href?: string
  icon: LucideIcon
  index?: number
  className?: string
}

export function ClientPortalSummaryCard({
  variant,
  label,
  value,
  sub,
  href,
  icon: Icon,
  index = 0,
  className,
}: ClientPortalSummaryCardProps) {
  const theme = VARIANTS[variant] || VARIANTS["default"]

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={href ? { y: -2 } : undefined}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-300",
        href && "cursor-pointer hover:border-primary/20 hover:shadow-md",
        href && theme.glow,
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100 transition-opacity group-hover:opacity-100",
          theme.accent,
        )}
      />
      <div className={cn("absolute inset-x-0 top-0 h-0.5", theme.bar)} />

      <div className="relative flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            theme.iconBg,
            theme.iconColor,
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>

        {href ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
            {value}
          </p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
    </motion.div>
  )

  if (href) {
    return (
      <Link href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-2xl">
        {content}
      </Link>
    )
  }

  return content
}

export function ClientPortalSummaryCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl border border-border/70 bg-card p-4", className)}>
      <div className="flex items-start justify-between">
        <div className="h-11 w-11 rounded-xl bg-muted" />
        <div className="h-7 w-7 rounded-full bg-muted" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-7 w-28 rounded-lg bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
    </div>
  )
}
