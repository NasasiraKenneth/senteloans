"use client"

import React, { Suspense, useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Coins,
  ShieldCheck,
  Briefcase,
  Users,
  ArrowRight,
  Loader2,
  LogOut,
  Sparkles,
  ChevronRight,
  Building2,
  TrendingUp,
  ReceiptText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { seedStaffSessionFromAuthUser } from "@/lib/staff-session-hydration"
import { showPostLoginGreetingToast } from "@/lib/greeting"
import { LOGIN_SUCCESS_MESSAGES } from "@/lib/auth-login-messages"

export default function LoginSelectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#F08C2B]" />
            <p className="text-xs text-zinc-400 font-mono">Loading workspaces...</p>
          </div>
        </div>
      }
    >
      <LoginSelectContent />
    </Suspense>
  )
}

function LoginSelectContent() {
  const { data: session, status, update } = useSession()
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const availableRoles = session?.user?.availableRoles || []
  const activeRole = session?.user?.activeRole || session?.user?.type || "staff"

  // If single-role user, route immediately to their intended portal
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return

    if (availableRoles.length === 1) {
      const single = availableRoles[0]
      if (single === "system_admin") {
        router.replace("/admin")
      } else if (single === "client") {
        router.replace("/client-portal")
      } else {
        router.replace("/dashboard")
      }
    }
  }, [status, session, availableRoles, router])

  // If not authenticated and done loading, redirect to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login")
    }
  }, [status, router])

  if (status === "loading" || (availableRoles.length === 1 && status === "authenticated")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#F08C2B]" />
          <p className="text-xs text-zinc-400 font-mono">Redirecting to your workspace...</p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const handleSelectWorkspace = async (targetRole: "staff" | "client" | "system_admin") => {
    if (isNavigating) return
    setSelectedRole(targetRole)
    setIsNavigating(true)

    try {
      await update({ activeRole: targetRole })

      if (targetRole === "system_admin") {
        toast({
          variant: "success",
          title: "System Admin Workspace",
          description: LOGIN_SUCCESS_MESSAGES.admin,
        })
        showPostLoginGreetingToast(toast, session.user.name)
        await new Promise((r) => setTimeout(r, 350))
        router.push("/admin")
        router.refresh()
      } else if (targetRole === "client") {
        toast({
          variant: "success",
          title: "Member Portal",
          description: LOGIN_SUCCESS_MESSAGES.client,
        })
        showPostLoginGreetingToast(toast, session.user.name)
        await new Promise((r) => setTimeout(r, 350))
        router.push("/client-portal")
        router.refresh()
      } else {
        seedStaffSessionFromAuthUser(session.user)
        toast({
          variant: "success",
          title: "SACCO Operations Dashboard",
          description: LOGIN_SUCCESS_MESSAGES.institution,
        })
        showPostLoginGreetingToast(toast, session.user.name)
        await new Promise((r) => setTimeout(r, 350))
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Workspace Error",
        description: "Could not switch to selected workspace. Please try again.",
      })
      setIsNavigating(false)
      setSelectedRole(null)
    }
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" })
  }

  const workspaceOptions = [
    {
      role: "system_admin" as const,
      title: "System Admin Portal",
      subtitle: "Global Governance & Infrastructure",
      badge: "Platform Admin",
      badgeClass: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400",
      description:
        "Manage financial institutions, oversee tenant onboarding, configure platform modules, and review global system logs.",
      icon: ShieldCheck,
      iconBg: "bg-purple-900/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
      borderHover: "hover:border-purple-500 hover:shadow-purple-500/10",
      destination: "/admin",
      features: ["Multi-Tenant Onboarding", "Institution Directory", "System User Management", "Global Auditing"],
    },
    {
      role: "staff" as const,
      title: "SACCO Staff Dashboard",
      subtitle: "Branch & Core Banking Operations",
      badge: "Staff Operations",
      badgeClass: "bg-[#F08C2B]/10 text-[#F08C2B] border-[#F08C2B]/20",
      description:
        "Process loan applications, review member KYC, handle daily transactions, reconcile cashflow, and supervise SACCO operations.",
      icon: Briefcase,
      iconBg: "bg-[#F08C2B]/10 text-[#F08C2B] dark:bg-[#F08C2B]/20 dark:text-[#F08C2B]",
      borderHover: "hover:border-[#F08C2B] hover:shadow-[#F08C2B]/10",
      destination: "/dashboard",
      features: ["Loan Approval Pipelines", "KYC Verification", "Branch Cashflow & Expenses", "Portfolio Analytics"],
    },
    {
      role: "client" as const,
      title: "SACCO Member Portal",
      subtitle: "Personal Finance & Self-Service",
      badge: "Member Portal",
      badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
      description:
        "View your savings accounts, track loan balances & repayment schedules, access share certificates, and request new loans.",
      icon: Users,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
      borderHover: "hover:border-emerald-500 hover:shadow-emerald-500/10",
      destination: "/client-portal",
      features: ["Savings Balances", "Self-Service Loan Requests", "Share Ledger & Dividends", "Account Statements"],
    },
  ]

  const activeWorkspaces = workspaceOptions.filter((w) => availableRoles.includes(w.role))

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex flex-col justify-between selection:bg-[#F08C2B] selection:text-black">
      {/* Background Glow Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#F08C2B]/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 lg:px-12 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[#F08C2B] flex items-center justify-center shadow-lg shadow-[#F08C2B]/20 group-hover:scale-105 transition-transform">
              <Coins className="h-5 w-5 text-black" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-white flex items-center">
                NYUKI<span className="text-[#F08C2B] ml-0.5">.</span>
              </span>
              <span className="text-[10px] tracking-widest text-zinc-400 uppercase font-mono -mt-1">
                SACCO Management System
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-zinc-200">{session.user.name}</span>
              <span className="text-[11px] text-zinc-500">{session.user.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl text-xs gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 flex flex-col justify-center">
        {/* Title & Introduction */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#F08C2B]/10 border border-[#F08C2B]/30 text-xs font-semibold text-[#F08C2B] shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Hybrid Account Detected ({availableRoles.length} Available Roles)
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Choose Your Workspace
          </h1>

          <p className="text-zinc-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Your account possesses multiple privileges across the platform. Select the portal you wish to open for this session.
          </p>
        </div>

        {/* Workspace Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeWorkspaces.map((ws) => {
            const Icon = ws.icon
            const isCurrentActive = activeRole === ws.role
            const isThisLoading = isNavigating && selectedRole === ws.role

            return (
              <motion.div
                key={ws.role}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`relative group bg-zinc-900/80 backdrop-blur-md rounded-2xl border-2 transition-all p-6 flex flex-col justify-between shadow-xl cursor-pointer ${
                  isCurrentActive ? "border-[#F08C2B]/60 bg-zinc-900" : "border-zinc-800 " + ws.borderHover
                }`}
                onClick={() => handleSelectWorkspace(ws.role)}
              >
                {/* Active Workspace Tag */}
                {isCurrentActive && (
                  <div className="absolute -top-3 right-6 px-2.5 py-0.5 rounded-full bg-[#F08C2B] text-black font-extrabold text-[10px] uppercase tracking-wider shadow-md">
                    Current Active
                  </div>
                )}

                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${ws.iconBg}`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <Badge variant="outline" className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${ws.badgeClass}`}>
                      {ws.badge}
                    </Badge>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-[#F08C2B] transition-colors flex items-center gap-1.5">
                      {ws.title}
                    </h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">{ws.subtitle}</p>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-400 leading-relaxed">{ws.description}</p>

                  {/* Feature Highlights */}
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Key Capabilities:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ws.features.map((feat, i) => (
                        <div key={i} className="text-[11px] text-zinc-300 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F08C2B]/80" />
                          <span className="truncate">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button */}
                <div className="pt-6 mt-6 border-t border-zinc-800/60">
                  <Button
                    type="button"
                    disabled={isNavigating}
                    className={`w-full rounded-xl font-bold text-xs py-5 transition-all flex items-center justify-center gap-2 ${
                      isCurrentActive
                        ? "bg-[#F08C2B] hover:bg-[#d97b1e] text-black shadow-lg shadow-[#F08C2B]/20"
                        : "bg-zinc-800 hover:bg-zinc-700 text-white"
                    }`}
                  >
                    {isThisLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Opening Workspace...</span>
                      </>
                    ) : (
                      <>
                        <span>Enter {ws.title}</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Footer info note */}
        <div className="text-center mt-12 text-xs text-zinc-500">
          <p>
            You can seamlessly switch between these workspaces at any time using the <strong>role switcher</strong> in the top header.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-zinc-900/80 py-4 px-6 text-center text-[11px] text-zinc-600 font-mono">
        SenteLoans Core Banking Engine • Multi-Tenant Enterprise Edition
      </footer>
    </div>
  )
}
