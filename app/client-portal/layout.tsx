"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { ClientSessionProvider, useClientSession } from "@/components/client-session-provider"
import { ClientPortalSidebar } from "@/components/client-portal-sidebar"
import { ClientPortalHeader } from "@/components/client-portal-header"
import { ClientPortalMobileNav } from "@/components/client-portal-mobile-nav"
import { ClientPortalLoading } from "@/components/client-portal-loading"
import {
  buildClientPortalNavSections,
  flattenClientPortalNavItems,
  getActiveClientPortalNavItem,
} from "@/lib/client-portal-nav"

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClientSessionProvider>
      <ClientPortalShell>{children}</ClientPortalShell>
    </ClientSessionProvider>
  )
}

function ClientPortalShell({ children }: { children: React.ReactNode }) {
  const { data, isLoading, authFailed, clientTerminology } = useClientSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.replace("/client-login")
    router.refresh()
  }

  useEffect(() => {
    if (!data) return
    const modules = data.institution.config?.modules
    if (pathname.startsWith("/client-portal/savings") && !modules?.savings) {
      router.replace("/client-portal")
    }
    if (pathname.startsWith("/client-portal/shares") && !modules?.shares) {
      router.replace("/client-portal")
    }
    if (pathname.startsWith("/client-portal/messages") && !modules?.chats) {
      router.replace("/client-portal")
    }
  }, [pathname, data, router])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKey)
    }
  }, [sidebarOpen])

  if (isLoading) {
    return (
      <ClientPortalLoading
        institutionName={data?.institution?.name}
        institutionLogo={data?.institution?.logo}
      />
    )
  }

  if (!data) {
    return (
      <ClientPortalLoading
        message={authFailed ? "Redirecting to sign in..." : "Loading your account"}
      />
    )
  }

  const { client: currentClient, institution } = data
  const navigationSections = buildClientPortalNavSections({
    pathname,
    hasSavings: institution.config?.modules?.savings,
    hasShares: institution.config?.modules?.shares,
  })
  const navigationItems = flattenClientPortalNavItems(navigationSections)
  const activePage = getActiveClientPortalNavItem(navigationSections)

  return (
    <div className="client-portal-theme min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-border lg:block">
        <ClientPortalSidebar
          institution={institution}
          clientTerminology={clientTerminology}
          navigationSections={navigationSections}
        />
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card shadow-xl">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-2 z-10 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
            <ClientPortalSidebar
              institution={institution}
              clientTerminology={clientTerminology}
              navigationSections={navigationSections}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        <ClientPortalHeader
          client={currentClient}
          institution={institution}
          pageTitle={activePage?.name ?? "Portal"}
          onLogout={handleLogout}
        />

        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-8">
          <div className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>

        <ClientPortalMobileNav items={navigationItems} onOpenMenu={() => setSidebarOpen(true)} />
      </div>
    </div>
  )
}
