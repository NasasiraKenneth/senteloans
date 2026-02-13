"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NotificationBell } from "@/components/notification-bell"
import Link from "next/link"
import { User, CreditCard, PiggyBank, LogOut, Menu, X, Home, PieChart, History } from "lucide-react"

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  type InstitutionUI = { id: string; name: string; type: string; status: string; config: any }
  type ClientUI = { id: string; fullName: string; status: string }
  const [session, setSession] = useState<{ institution: InstitutionUI } | null>(null)
  const [currentClient, setCurrentClient] = useState<ClientUI | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/client/me", { cache: "no-store" })
        if (!res.ok) {
          router.push(`/client-login?redirect=${encodeURIComponent(pathname || "/client-portal")}`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSession({ institution: data.institution as InstitutionUI })
        setCurrentClient({ id: data.client.id, fullName: data.client.fullName, status: data.client.status } as ClientUI)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router, pathname])

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/client-login" })
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    )
  }

  if (!session || !currentClient) {
    return null
  }

  const institution = session.institution
  const clientTerminology = institution?.config?.clientTerminology || "Member"
  const hasSavings = institution?.config?.modules?.savings
  const hasShares = institution?.config?.modules?.shares

  const navigationItems = [
    {
      name: "Overview",
      href: "/client-portal",
      icon: Home,
      active: pathname === "/client-portal",
    },
    {
      name: "Loans",
      href: "/client-portal/loans",
      icon: CreditCard,
      active:
        pathname.startsWith("/client-portal/loans") ||
        pathname.startsWith("/client-portal/apply-loan") ||
        pathname.startsWith("/client-portal/loan-details"),
    },
    {
      name: "Transactions",
      href: "/client-portal/transactions",
      icon: History,
      active: pathname.startsWith("/client-portal/transactions"),
    },
    ...(hasSavings
      ? [
          {
            name: "Savings",
            href: "/client-portal/savings",
            icon: PiggyBank,
            active: pathname.startsWith("/client-portal/savings"),
          },
        ]
      : []),
    ...(hasShares
      ? [
          {
            name: "Shares",
            href: "/client-portal/shares",
            icon: PieChart,
            active: pathname.startsWith("/client-portal/shares"),
          },
        ]
      : []),
    {
      name: "Profile",
      href: "/client-portal/profile",
      icon: User,
      active: pathname.startsWith("/client-portal/profile"),
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden mobile-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-primary-foreground"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div>
              <h1 className="text-base font-semibold text-primary-foreground">{currentClient?.fullName}</h1>
              <p className="text-xs text-primary-foreground/80">{institution?.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-primary-foreground">
              <NotificationBell apiEndpoint="/api/client/notifications" />
            </div>
            <Button size="sm" variant="ghost" onClick={handleLogout} className="text-primary-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
          <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
            <div className="flex flex-col px-6 py-6 border-b border-gray-200">
              <div className="flex items-center mb-4">
                <Avatar className="h-10 w-10 mr-3">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {currentClient?.fullName
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{currentClient?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{institution?.name}</p>
                  <Badge variant={currentClient.status === "Active" ? "default" : "secondary"} className="mt-1">
                    {currentClient.status}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <NotificationBell apiEndpoint="/api/client/notifications" />
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      item.active
                        ? "bg-primary text-primary-foreground"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            <div className="px-4 py-4 border-t border-gray-200">
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start text-gray-700 hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => setSidebarOpen(false)} />
            <div className="relative flex flex-col w-64 bg-white border-r border-gray-200">
              <div className="flex items-center px-6 py-6 border-b border-gray-200">
                <Avatar className="h-10 w-10 mr-3">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {currentClient?.fullName
                      .split(" ")
                      .map((n: string | undefined) => n?.[0] ?? '')
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{currentClient?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{institution?.name}</p>
                  <Badge variant={currentClient.status === "Active" ? "default" : "secondary"} className="mt-1">
                    {currentClient.status}
                  </Badge>
                </div>
              </div>

              <nav className="flex-1 px-4 py-6 space-y-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        item.active
                          ? "bg-primary text-primary-foreground"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>

              <div className="px-4 py-4 border-t border-gray-200">
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start text-gray-700 hover:bg-gray-100"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 lg:ml-64">
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
