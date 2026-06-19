"use client"

import { InstitutionLogo } from "@/components/institution-logo"
import { cn } from "@/lib/utils"

type ClientPortalLoadingProps = {
  institutionName?: string
  institutionLogo?: string | null
  message?: string
  className?: string
}

export function ClientPortalLoading({
  institutionName,
  institutionLogo,
  message = "Loading your account",
  className,
}: ClientPortalLoadingProps) {
  return (
    <div className={cn("client-portal-theme flex min-h-screen items-center justify-center bg-background p-6", className)}>
      <div className="w-full max-w-xs text-center">
        {institutionName ? (
          <InstitutionLogo
            name={institutionName}
            logo={institutionLogo}
            className="mx-auto mb-5 h-14 w-14 rounded-xl border border-border"
            initialsClassName="text-sm"
          />
        ) : (
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-xl bg-muted" />
        )}
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  )
}
