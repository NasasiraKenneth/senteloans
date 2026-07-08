"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Pencil, type LucideIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { ProfileTab } from "@/lib/client-portal-kyc"

export type ProfileTabConfig = {
  id: ProfileTab
  label: string
  icon: LucideIcon
}

function ProfileEditIconButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div className="group/edit relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shadow-sm"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-9 right-0 z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover/edit:opacity-100"
      >
        {label}
      </span>
    </div>
  )
}

export function ProfileLoadingSkeleton() {
  return (
    <div className="w-full animate-in fade-in space-y-6 duration-300">
      <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
      <div className="flex gap-6 border-b border-border pb-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 w-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
      </div>
    </div>
  )
}

type ProfileHeaderProps = {
  fullName: string
  phone: string
  avatarUrl?: string | null
  initials: string
  kycStatus: string
  clientTerminology: string
  joinDate: string
  kycPercent: number
  kycComplete: boolean
  onKycClick?: () => void
  backHref?: string
}

export function ProfileHeader({
  fullName,
  phone,
  avatarUrl,
  initials,
  kycStatus,
  clientTerminology,
  joinDate,
  kycPercent,
  kycComplete,
  onKycClick,
  backHref = "/client-portal",
}: ProfileHeaderProps) {
  const verified = kycStatus === "Verified"

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardContent className="p-6">
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Avatar className="h-20 w-20 ring-1 ring-border">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} className="object-cover" /> : null}
              <AvatarFallback className="bg-muted text-lg font-medium text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{phone}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className={cn(verified && "font-medium text-emerald-600")}>
                  {verified ? "Verified" : kycStatus}
                </span>
                <span className="mx-1.5">·</span>
                {clientTerminology} since {joinDate}
              </p>
            </div>
          </div>

          {!kycComplete ? (
            <button
              type="button"
              onClick={onKycClick}
              className="w-full max-w-sm text-left transition-opacity hover:opacity-80 lg:shrink-0"
            >
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Complete verification</span>
                <span className="tabular-nums font-medium">{kycPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${kycPercent}%` }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </div>
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

type ProfileTabNavProps = {
  tabs: ProfileTabConfig[]
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
}

export function ProfileTabNav({ tabs, activeTab, onTabChange }: ProfileTabNavProps) {
  return (
    <nav className="flex gap-6 overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 pb-3 text-sm font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tab.label}
            {isActive ? (
              <motion.div
                layoutId="profile-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

type ProfileTabPanelProps = {
  tabKey: string
  children: ReactNode
  className?: string
}

export function ProfileTabPanel({ tabKey, children, className }: ProfileTabPanelProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={cn("space-y-6 pt-2", className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

type ProfileCardProps = {
  title: string
  description?: string
  children: ReactNode
  className?: string
  editable?: boolean
  editing?: boolean
  saving?: boolean
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  editLabel?: string
}

export function ProfileCard({
  title,
  description,
  children,
  className,
  editable = false,
  editing = false,
  saving = false,
  onEdit,
  onSave,
  onCancel,
  editLabel = "Edit",
}: ProfileCardProps) {
  return (
    <Card className={cn("group/card border-border/80 shadow-sm", className)}>
      <CardHeader className="border-b border-border/60">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {editable ? (
          <CardAction>
            {editing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : (
              <div className="opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 max-sm:opacity-100">
                <ProfileEditIconButton label={editLabel} onClick={onEdit!} />
              </div>
            )}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

type ProfileRowProps = {
  label: string
  value: string
}

export function ProfileRow({ label, value }: ProfileRowProps) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground sm:text-right">{value}</span>
    </div>
  )
}

type ProfileFieldProps = {
  label: string
  children: ReactNode
  className?: string
}

export function ProfileField({ label, children, className }: ProfileFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

type ProfileToggleRowProps = {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ProfileToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: ProfileToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function profileInputClass(editing: boolean) {
  return editing
    ? undefined
    : "border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 disabled:cursor-default disabled:opacity-100"
}

// Legacy alias
export const ProfileSection = ProfileCard
