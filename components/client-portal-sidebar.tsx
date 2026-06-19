"use client"

import Link from "next/link"
import { InstitutionLogo } from "@/components/institution-logo"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClientPortalNavSection } from "@/lib/client-portal-nav"
import { clientPortalSectionLabel } from "@/lib/client-portal-nav"
import type { ClientPortalInstitution } from "@/lib/client-session-types"

type ClientPortalSidebarProps = {
  institution: ClientPortalInstitution
  clientTerminology: string
  navigationSections: ClientPortalNavSection[]
  onNavigate?: () => void
  className?: string
}

export function ClientPortalSidebar({
  institution,
  clientTerminology,
  navigationSections,
  onNavigate,
  className,
}: ClientPortalSidebarProps) {
  return (
    <div className={cn("flex h-full flex-col bg-card", className)}>
      <div className="border-b border-border bg-gradient-to-b from-primary/[0.06] to-transparent px-5 pb-6 pt-5">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/70">
          {clientPortalSectionLabel(clientTerminology)}
        </p>

        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-0.5 rounded-2xl bg-primary/15 blur-[6px]" aria-hidden />
            <div className="relative flex h-[3.25rem] w-[3.25rem] items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-primary/15">
              <InstitutionLogo
                name={institution.name}
                logo={institution.logo}
                tone="theme"
                className="h-full w-full rounded-2xl border-0"
                initialsClassName="text-sm font-bold"
                imageClassName="p-1.5"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-tight text-foreground">
              {institution.name}
            </h2>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {navigationSections.map((section, sectionIndex) => (
          <div key={section.label ?? `section-${sectionIndex}`} className={cn(sectionIndex > 0 && "mt-7")}>
            {section.label ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {section.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      item.active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                    )}
                  >
                    {item.active ? (
                      <span
                        className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        item.active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.active ? <ChevronRight className="h-4 w-4 shrink-0 text-primary/50" /> : null}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}
