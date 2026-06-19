"use client"

import Link from "next/link"
import { LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClientPortalNavItem } from "@/lib/client-portal-nav"

type ClientPortalMobileNavProps = {
  items: ClientPortalNavItem[]
  onOpenMenu: () => void
  className?: string
}

export function ClientPortalMobileNav({ items, onOpenMenu, className }: ClientPortalMobileNavProps) {
  const primaryItems = items.filter((item) => item.mobilePrimary)

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm lg:hidden",
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {primaryItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-1.5 text-[11px] font-medium",
                item.active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.name}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          <LayoutGrid className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </div>
  )
}
