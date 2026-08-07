"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Building2,
  Users,
  Settings,
  BarChart3,
  Coins,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (email && email.trim().length > 0) {
    return email.substring(0, 2).toUpperCase();
  }
  return "SA";
}

export function AdminHeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "System Admin";
  const userEmail = session?.user?.email || "admin@senteloans.com";
  const userInitials = getInitials(session?.user?.name, session?.user?.email);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch("/api/logout", { method: "POST" });
      await signOut({ callbackUrl: "/admin-login" });
    } catch {
      router.push("/admin-login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 shadow-xs">
      <div className="w-full px-6 lg:px-10 h-16 flex items-center justify-between">
        {/* Left: Logo + Inline Navigation Links */}
        <div className="flex items-center space-x-6">
          {/* Brand Logo */}
          <Link
            href="/admin"
            className="flex items-center space-x-3 group transition-opacity hover:opacity-90"
          >
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20"
            >
              <Coins className="h-5 w-5 text-black" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-black flex items-center">
                NYUKI<span className="text-orange-500 ml-0.5">.</span>
              </span>
              <span className="text-[10px] tracking-widest text-zinc-400 uppercase font-mono -mt-1">
                SACCO Management System
              </span>
            </div>
          </Link>

          {/* Divider */}
          <div className="hidden md:block h-6 w-[1px] bg-slate-200" />

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center px-3.5 py-2 text-sm font-medium rounded-lg transition-colors relative",
                    isActive
                      ? "text-orange-600 font-semibold bg-orange-50/70 border-b-2 border-orange-500 rounded-b-none"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70",
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-2 h-4 w-4",
                      isActive ? "text-orange-500" : "text-slate-400",
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Live Status + User Dropdown */}
        <div className="hidden md:flex items-center space-x-4">
          {/* Live System Indicator */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live</span>
          </div>

          {/* User Profile Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center space-x-3 p-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-xs uppercase">
                {userInitials}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-semibold text-slate-900 max-w-[140px] truncate">
                  {userName}
                </div>
                <div className="text-[11px] text-slate-500 max-w-[140px] truncate">
                  {userEmail}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform duration-200",
                  userDropdownOpen && "rotate-180",
                )}
              />
            </button>

            {/* Dropdown Menu */}
            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50 animate-in fade-in-50 zoom-in-95">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {userName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {userEmail}
                  </p>
                </div>

                <div className="px-1 py-1">
                  <Link
                    href="/admin/settings"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Settings className="mr-2.5 h-4 w-4 text-slate-400" />
                    System Settings
                  </Link>
                  <Link
                    href="/admin/institutions"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Building2 className="mr-2.5 h-4 w-4 text-slate-400" />
                    Manage Institutions
                  </Link>
                </div>

                <div className="border-t border-slate-100 px-1 pt-1">
                  <Button
                    onClick={handleLogout}
                    variant="ghost"
                    size="sm"
                    disabled={loggingOut}
                    className="w-full justify-start text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="mr-2.5 h-4 w-4" />
                    {loggingOut ? "Logging out..." : "Log out"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-orange-600" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-6 pt-3 pb-6 space-y-3 shadow-md animate-in slide-in-from-top-4 duration-200">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-orange-50 text-orange-600 font-semibold border-l-4 border-orange-500"
                      : "text-[#64748b] hover:text-slate-900 hover:bg-slate-100",
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5 text-orange-500" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center px-4 space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-xs uppercase">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {userName}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {userEmail}
                </div>
              </div>
            </div>

            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              disabled={loggingOut}
              className="w-full justify-center bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:text-rose-700 rounded-lg cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {loggingOut ? "Logging out..." : "Log out"}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
