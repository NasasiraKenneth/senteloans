"use client"

import type { ComponentType, ReactNode } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/notification-bell"
import { ChatMessagesButton } from "@/components/chat-messages-button"
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

const PORTAL_THEME = "client-portal-theme"

const portalTriggerClass =
  "text-muted-foreground hover:bg-primary/5 hover:text-foreground data-[state=open]:bg-primary/5 data-[state=open]:text-foreground"

const portalMenuItemClass =
  "group gap-3 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-primary/5 hover:text-foreground focus:bg-primary/5 focus:text-foreground"

const portalMenuIconClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary group-focus:bg-primary/10 group-focus:text-primary"

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
    <DropdownMenuItem asChild className={portalMenuItemClass}>
      <Link href={href} className="cursor-pointer">
        <span className={portalMenuIconClass}>
          <Icon className="h-4 w-4" />
        </span>
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
    {
      name: "Apply for loan",
      href: "/client-portal/apply-loan",
      icon: Plus,
    },
    ...(modules?.savings
      ? [{ name: "Savings", href: "/client-portal/savings", icon: PiggyBank }]
      : []),
    ...(modules?.shares
      ? [{ name: "Shares", href: "/client-portal/shares", icon: PieChart }]
      : []),
    { name: "Invoices", href: "/client-portal/invoices", icon: FileText },
  ]

  return (
    <header
      className={cn(
        PORTAL_THEME,
        "sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {pageTitle}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{institution.name}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ChatMessagesButton
            href="/client-portal/messages"
            triggerClassName={portalTriggerClass}
          />
          <NotificationBell
            apiEndpoint="/api/client/notifications"
            contentClassName={PORTAL_THEME}
          />

          <div className="mx-0.5 hidden h-6 w-px bg-border sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("h-9 gap-2 px-2.5", portalTriggerClass)}>
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden text-sm font-medium sm:inline">More</span>
                <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(PORTAL_THEME, "w-56 p-1.5")}>
              <DropdownMenuLabel className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors sm:px-2 sm:py-1.5",
                  portalTriggerClass,
                )}
              >
                <Avatar className="h-8 w-8 ring-2 ring-primary/10">
                  {client.avatarUrl ? (
                    <AvatarImage src={client.avatarUrl} alt={client.fullName} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {clientInitials(client.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 text-left md:block">
                  <p className="truncate text-sm font-medium leading-tight">{client.fullName}</p>
                  <p className="truncate text-[11px] leading-tight opacity-70">{client.clientNumber}</p>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(PORTAL_THEME, "w-60 p-1.5")}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 px-1 py-1">
                  <Avatar className="h-10 w-10">
                    {client.avatarUrl ? (
                      <AvatarImage src={client.avatarUrl} alt={client.fullName} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                      {clientInitials(client.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{client.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{client.clientNumber}</p>
                  </div>
                  <Badge
                    variant={client.status === "Active" ? "default" : "outline"}
                    className={cn("shrink-0 text-[10px]", client.status === "Active" && "bg-primary")}
                  >
                    {client.status}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <PortalMenuLink href="/client-portal/profile" icon={User}>
                My profile
              </PortalMenuLink>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onLogout}
                className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <LogOut className="h-4 w-4" />
                </span>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
