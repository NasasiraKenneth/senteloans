"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Building2, Users, Settings, BarChart3, Shield, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navigation = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: BarChart3,
  },
  {
    name: "Institutions",
    href: "/admin/institutions",
    icon: Building2,
  },
  {
    name: "System Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "System Settings",
    href: "/admin/settings",
    icon: Settings,
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    try {
      setLoggingOut(true)
      // Invalidate Supabase session cookies server-side
      await fetch("/api/logout", { method: "POST" })
    } catch {
      // ignore
    } finally {
      setLoggingOut(false)
      // Send user to admin login page
      router.push("/admin-login")
    }
  }

  return (
    <div className="flex h-full w-64 flex-col bg-[#0f0f12] text-white border-r border-white/10">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-white/10">
        <Link href="/admin" className="flex items-center space-x-2 no-underline">
          <Shield className="h-8 w-8 text-brand" />
          <div className="text-white">
            <div className="text-lg font-bold">Nyuki</div>
            <div className="text-xs text-zinc-400">System Admin</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer no-underline",
                isActive
                  ? "bg-brand text-brand-foreground font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-white hover:bg-white/10",
              )}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="border-t border-white/10 p-4">
        <div className="text-sm text-zinc-400">Logged in as</div>
        <div className="text-sm font-medium text-white mb-3">System Administrator</div>

        <Button
          onClick={handleLogout}
          variant="ghost"
          size="sm"
          disabled={loggingOut}
          className="w-full justify-start text-zinc-400 hover:text-white hover:bg-white/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {loggingOut ? "Logging out..." : "Logout"}
        </Button>
      </div>
    </div>
  )
}
