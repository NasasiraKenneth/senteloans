"use client"

import { LogOut, Settings, ChevronDown, ChevronRight, Home } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { NotificationBell } from "@/components/notification-bell"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { getSession, clearSession, setSession as persistSession } from "@/lib/session"
import { useEffect, useState } from "react"

function getInitials(name: string): string {
  if (!name) return "U"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export function DashboardHeader() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    setSession(getSession())
  }, [])

  useEffect(() => {
    const s = getSession()
    if (s?.institution?.name && s?.institution?.type) return
    ;(async () => {
      try {
        const res = await fetch("/api/institution/organization", { cache: "no-store" })
        if (!res.ok) return
        const org = await res.json()
        const updated = {
          ...(s || {}),
          institutionId: s?.institutionId || org?.id || s?.institution?.id,
          institution: {
            id: s?.institution?.id || org?.id || s?.institutionId || "",
            name: org?.name || s?.institution?.name || "",
            type: org?.type || s?.institution?.type || "",
            config: s?.institution?.config,
          },
        }
        persistSession(updated as any)
        setSession((prev: any) => ({ ...prev, ...updated }))
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    const s = getSession()
    if (s && s?.name && s?.email) return
    ;(async () => {
      try {
        const res = await fetch("/api/institution/profile", { cache: "no-store" })
        if (!res.ok) return
        const prof = await res.json()
        const updated = {
          ...(s || {}),
          userId: s?.userId || "",
          email: prof.email || s?.email || "",
          name: prof.name || s?.name || "",
          role: s?.role || prof.role || "",
          institutionId: s?.institutionId,
          institution: s?.institution,
        }
        persistSession(updated as any)
        setSession(updated as any)
      } catch {
        // ignore
      }
    })()
  }, [])

  const handleLogout = async () => {
    try {
      clearSession()
      await signOut({ callbackUrl: "/login" })
    } catch {
      // ignore
    } finally {
      router.push("/login")
      router.refresh()
    }
  }

  const pathname = usePathname()
  const firstName = session?.name?.split(" ")[0] || ""
  const initials = getInitials(session?.name || "")
  const roleName = session?.role
    ? session.role.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : ""

  // Build breadcrumbs from pathname
  const breadcrumbs = (() => {
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return []

    const labels: Record<string, string> = {
      dashboard: "Dashboard",
      users: "Members",
      staff: "Staff",
      loans: "Loans",
      savings: "Savings",
      investments: "Investments",
      transactions: "Transactions",
      reports: "Reports",
      settings: "Settings",
      new: "New",
      edit: "Edit",
    }

    // Override "users" label based on institution config
    const clientTerm = session?.institution?.config?.clientTerminology
    if (clientTerm === "Client") labels.users = "Clients"
    else if (clientTerm === "Borrower") labels.users = "Borrowers"

    return segments.map((segment, idx) => {
      const href = "/" + segments.slice(0, idx + 1).join("/")
      const label = labels[segment] || (
        // UUID-like IDs get shortened
        /^[0-9a-f-]{8,}$/i.test(segment) ? "Details" :
        // Capitalize other segments
        segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      )
      const isLast = idx === segments.length - 1
      return { label, href, isLast }
    })
  })()

  return (
    <header className="border-b border-border/60 bg-background">
      <div className="flex h-14 items-center justify-between px-6">
        {/* Left — Logo + Institution + Breadcrumbs */}
        <nav className="flex items-center gap-1.5 min-w-0">
          {/* Logo + Institution Name */}
          <div className="flex items-center gap-2 shrink-0 mr-1">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#f08c2b]/15"
              style={{
                background: "linear-gradient(135deg, rgba(240,140,43,0.12) 0%, rgba(240,140,43,0.04) 100%)",
              }}
            >
              <Image
                src="https://res.cloudinary.com/hatari/image/upload/v1756391632/sente-loans/logos/sente-loans-symbol-logo_jyteeu.png"
                alt="Logo"
                width={16}
                height={16}
                className="h-4 w-4"
              />
            </div>
            <span className="hidden text-[13px] font-semibold text-foreground md:block">
              {session?.institution?.name || "Sente Loan"}
            </span>
          </div>

          {/* Separator */}
          <div className="mx-1 h-5 w-px bg-border/60 shrink-0" />

          {/* Home icon */}
          <Link
            href="/dashboard"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Home className="h-4 w-4" />
          </Link>

          {/* Breadcrumbs */}
          {breadcrumbs.map((crumb) => (
            <div key={crumb.href} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
              {crumb.isLast ? (
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate rounded-md px-1.5 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Right — Actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Notifications */}
          <NotificationBell apiEndpoint="/api/institution/notifications" />

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-border/60" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 outline-none">
                {/* Avatar */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #f08c2b 0%, #d97b1e 100%)",
                  }}
                >
                  {initials}
                </div>

                {/* Name + role (desktop) */}
                <div className="hidden text-left md:block">
                  <div className="text-[13px] font-medium leading-tight text-foreground">
                    {session?.name || "User"}
                  </div>
                  {roleName && (
                    <div className="text-[11px] leading-tight text-muted-foreground">
                      {roleName}
                    </div>
                  )}
                </div>

                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground/50 md:block" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #f08c2b 0%, #d97b1e 100%)",
                    }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">{session?.name || "User"}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{session?.email || ""}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
