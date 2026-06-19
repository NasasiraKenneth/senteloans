"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ClientPortalPageHeaderProps = {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  action?: ReactNode
  className?: string
}

export function ClientPortalPageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  action,
  className,
}: ClientPortalPageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {backHref ? (
          <Link href={backHref}>
            <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
