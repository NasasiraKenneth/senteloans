"use client"

import type { ComponentType, ReactNode } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { NotificationBell } from "@/components/notification-bell"
import { ChatMessagesButton } from "@/components/chat-messages-button"
import { WorkspaceRoleSwitcher } from "@/components/workspace-role-switcher"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChevronDown,
  CreditCard,
  LayoutGrid,
  LogOut,
  PieChart,
  PiggyBank,
  Plus,
  User,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClientPortalClient, ClientPortalInstitution } from "@/lib/client-session-types"
import { readInstitutionConfigModuleEnabled } from "@/lib/institution-branch-config"

const PORTAL_THEME = "client-portal-theme"

type ClientPortalHeaderProps = {
  client: ClientPortalClient
  institution: ClientPortalInstitution
  pageTitle: string
  onLogout: () => void
  className?: string
}

function clientInitials(fullName: string): string {
  return fullName
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function PortalMenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {children}
      </Link>
    </DropdownMenuItem>
  )
}

export function ClientPortalHeader({
  client,
  institution,
  pageTitle,
  onLogout,
  className,
}: ClientPortalHeaderProps) {
  const modules = institution.config?.modules
  const moreItems = [
    { name: "Apply for loan", href: "/client-portal/apply-loan", icon: Plus },
    ...(modules?.savings ? [{ name: "Savings", href: "/client-portal/savings", icon: PiggyBank }] : []),
    ...(modules?.shares ? [{ name: "Shares", href: "/client-portal/shares", icon: PieChart }] : []),
    { name: "Invoices", href: "/client-portal/invoices", icon: FileText },
  ]

  return (
    <header
      className={cn(
        PORTAL_THEME,
        "sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Left — Page title */}
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
            {pageTitle}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{institution.name}</p>
        </div>

        {/* Right — Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <WorkspaceRoleSwitcher />

          {readInstitutionConfigModuleEnabled(institution.config, "chats") ? (
            <ChatMessagesButton
              href="/client-portal/messages"
              unreadApiEndpoint="/api/client/chats/unread"
              triggerClassName="rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            />
          ) : null}

          <NotificationBell
            apiEndpoint="/api/client/notifications"
            contentClassName={PORTAL_THEME}
            triggerClassName="rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          />

          {/* More dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden text-xs font-medium sm:inline">More</span>
                <ChevronDown className="hidden h-3 w-3 opacity-50 sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={cn(PORTAL_THEME, "w-52 p-1")}
            >
              <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quick links
              </DropdownMenuLabel>
              {moreItems.map((item) => (
                <PortalMenuLink key={item.href} href={item.href} icon={item.icon}>
                  {item.name}
                </PortalMenuLink>
              ))}
              <DropdownMenuSeparator />
              <PortalMenuLink href="/client-portal/loans" icon={CreditCard}>
                All loans
              </PortalMenuLink>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted focus:outline-none"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-7 w-7">
                    {client.avatarUrl ? (
                      <AvatarImage src={client.avatarUrl} alt={client.fullName} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-foreground text-[10px] font-semibold text-background">
                      {clientInitials(client.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  {client.status === "Active" && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
                  )}
                </div>
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-xs font-medium text-foreground">{client.fullName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{client.clientNumber}</p>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/60 md:block" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className={cn(PORTAL_THEME, "w-56 p-1")}
            >
              {/* User info header */}
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar className="h-9 w-9 shrink-0">
                  {client.avatarUrl ? (
                    <AvatarImage src={client.avatarUrl} alt={client.fullName} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
                    {clientInitials(client.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{client.fullName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{client.clientNumber}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[9px] font-semibold",
                    client.status === "Active"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-[#f08c2b]/30 bg-[#f08c2b]/10 text-[#f08c2b]",
                  )}
                >
                  {client.status}
                </Badge>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link
                  href="/client-portal/profile"
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <User className="h-3.5 w-3.5" />
                  My profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={onLogout}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-destructive focus:bg-destructive/5 focus:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
