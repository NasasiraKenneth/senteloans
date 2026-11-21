"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { InstitutionLogo } from "@/components/institution-logo"
import {
  BarChart3,
  Users,
  UserCog,
  CreditCard,
  PiggyBank,
  TrendingUp,
  FileText,
  Receipt,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Building2,
  LogOut,
  Landmark,
  ReceiptText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { clearSession } from "@/lib/session"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useStaffSession } from "@/components/staff-session-provider"
import { readClientTerminology, readInstitutionConfigModuleEnabled } from "@/lib/institution-branch-config"

interface NavItem {
  name: string
  href: string
  icon: any
  submenu?: { name: string; href: string }[]
}

interface NavSection {
  label: string | null
  items: NavItem[]
}

type NavPermissions = {
  viewStaff: boolean
  viewMembers: boolean
  viewThirdPartyAgents: boolean
  viewLoans: boolean
  viewSaccoLoans: boolean
  viewLoanProducts: boolean
  viewSavings: boolean
  viewInvestments: boolean
  viewInvestmentReports: boolean
  viewTransactions: boolean
  viewInvoices: boolean
  viewFinances: boolean
  viewExpenses: boolean
  viewReports: boolean
  viewSettings: boolean
}

const DEFAULT_NAV_PERMISSIONS: NavPermissions = {
  viewStaff: false,
  viewMembers: false,
  viewThirdPartyAgents: false,
  viewLoans: false,
  viewSaccoLoans: false,
  viewLoanProducts: false,
  viewSavings: false,
  viewInvestments: false,
  viewInvestmentReports: false,
  viewTransactions: false,
  viewInvoices: false,
  viewFinances: false,
  viewExpenses: false,
  viewReports: false,
  viewSettings: false,
}

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [navPermissions, setNavPermissions] = useState<NavPermissions>(DEFAULT_NAV_PERMISSIONS)
  const { session } = useStaffSession()
  const pathname = usePathname()
  const router = useRouter()
  const [isNavScrolling, setIsNavScrolling] = useState(false)
  const navScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleNavScroll = () => {
    setIsNavScrolling(true)
    if (navScrollTimeoutRef.current) {
      clearTimeout(navScrollTimeoutRef.current)
    }
    navScrollTimeoutRef.current = setTimeout(() => {
      setIsNavScrolling(false)
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (navScrollTimeoutRef.current) {
        clearTimeout(navScrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pathname.startsWith("/reports")) {
      setExpandedMenus((prev) => (prev.includes("Reports") ? prev : [...prev, "Reports"]))
    }
    if (pathname.startsWith("/loans") || pathname.startsWith("/loan-products") || pathname.startsWith("/sacco-loans")) {
      setExpandedMenus((prev) => (prev.includes("Loans") ? prev : [...prev, "Loans"]))
    }
    if (pathname.startsWith("/investments") || pathname.startsWith("/investment-reports")) {
      setExpandedMenus((prev) => (prev.includes("Investments") ? prev : [...prev, "Investments"]))
    }
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    fetch("/api/institution/navigation/permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.permissions) return
        setNavPermissions({
          viewStaff: !!body.permissions.viewStaff,
          viewMembers: !!body.permissions.viewMembers,
          viewThirdPartyAgents: !!body.permissions.viewThirdPartyAgents,
          viewLoans: !!body.permissions.viewLoans,
          viewSaccoLoans: !!body.permissions.viewSaccoLoans,
          viewLoanProducts: !!body.permissions.viewLoanProducts,
          viewSavings: !!body.permissions.viewSavings,
          viewInvestments: !!body.permissions.viewInvestments,
          viewInvestmentReports: !!body.permissions.viewInvestmentReports,
          viewTransactions: !!body.permissions.viewTransactions,
          viewInvoices: !!body.permissions.viewInvoices,
          viewFinances: !!body.permissions.viewFinances,
          viewExpenses: !!body.permissions.viewExpenses,
          viewReports: !!body.permissions.viewReports,
          viewSettings: !!body.permissions.viewSettings,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const getSections = (): NavSection[] => {
    const config = session?.institution?.config
    const clientTerm = readClientTerminology(config)
    const savingsEnabled = readInstitutionConfigModuleEnabled(config, "savings")
    const sharesEnabled = readInstitutionConfigModuleEnabled(config, "shares")

    const clientLabel = session?.institution
      ? clientTerm === "Member" ? "Members" : clientTerm === "Client" ? "Clients" : "Borrowers"
      : "Users"

    const loanSubmenu = [
      navPermissions.viewLoans ? { name: "Member Loans", href: "/loans" } : null,
      navPermissions.viewSaccoLoans ? { name: "External Loans", href: "/sacco-loans" } : null,
      navPermissions.viewLoanProducts ? { name: "Loan Products", href: "/loan-products" } : null,
    ].filter(Boolean) as { name: string; href: string }[]

    const financeItems: NavItem[] = []
    if (loanSubmenu.length > 0) {
      financeItems.push({
        name: "Loans",
        href: loanSubmenu[0].href,
        icon: CreditCard,
        submenu: loanSubmenu,
      })
    }
    if ((!session?.institution || savingsEnabled) && navPermissions.viewSavings) {
      financeItems.push({ name: "Savings", href: "/savings", icon: PiggyBank })
    }
    if (navPermissions.viewInvestments) {
      financeItems.push({ name: "Investments", href: "/investments", icon: TrendingUp })
    }
    if (navPermissions.viewTransactions) {
      financeItems.push({ name: "Transactions", href: "/transactions", icon: ArrowUpDown })
    }
    if (navPermissions.viewInvoices) {
      financeItems.push({ name: "Invoices", href: "/invoices", icon: Receipt })
    }

    const reportsSubmenu = [
      navPermissions.viewLoans ? { name: "Loan Reports", href: "/reports/loans" } : null,
      (!session?.institution || savingsEnabled) && navPermissions.viewSavings
        ? { name: "Savings Reports", href: "/reports/savings" }
        : null,
      (!session?.institution || sharesEnabled) && navPermissions.viewReports
        ? { name: "Share Reports", href: "/reports/shares" }
        : null,
      navPermissions.viewReports ? { name: "Statements", href: "/reports/statements" } : null,
      navPermissions.viewSaccoLoans ? { name: "Sacco Loan Reports", href: "/reports/sacco-loans" } : null,
      navPermissions.viewInvoices ? { name: "Invoice Reports", href: "/reports/invoices" } : null,
      navPermissions.viewStaff ? { name: "Staff Audit Reports", href: "/reports/staff-audit" } : null,
      navPermissions.viewFinances ? { name: "Financial Reports", href: "/reports/financial" } : null,
      navPermissions.viewFinances ? { name: "Treasury Reports", href: "/reports/treasury" } : null,
    ].filter(Boolean) as { name: string; href: string }[]

    const peopleItems = [
      navPermissions.viewStaff ? { name: "Staff", href: "/staff", icon: UserCog } : null,
      navPermissions.viewMembers ? { name: clientLabel, href: "/members", icon: Users } : null,
      navPermissions.viewThirdPartyAgents ? { name: "Third Party Agents", href: "/third-party-agents", icon: Building2 } : null,
    ].filter(Boolean) as NavItem[]

    const treasuryItems = [
      navPermissions.viewFinances ? { name: "Finances", href: "/finances", icon: Landmark } : null,
      navPermissions.viewExpenses ? { name: "Expenses", href: "/expenses", icon: ReceiptText } : null,
    ].filter(Boolean) as NavItem[]

    const sections: NavSection[] = [
      {
        label: null,
        items: [{ name: "Dashboard", href: "/dashboard", icon: BarChart3 }],
      },
    ]

    if (peopleItems.length > 0) {
      sections.push({ label: "People", items: peopleItems })
    }
    if (financeItems.length > 0) {
      sections.push({ label: "Finance", items: financeItems })
    }
    if (treasuryItems.length > 0) {
      sections.push({ label: "Treasury", items: treasuryItems })
    }
    if (navPermissions.viewReports && reportsSubmenu.length > 0) {
      sections.push({
        label: "Insights",
        items: [{ name: "Reports", href: "/reports", icon: FileText, submenu: reportsSubmenu }],
      })
    }
    if (navPermissions.viewSettings) {
      sections.push({
        label: null,
        items: [{ name: "Settings", href: "/settings", icon: Settings }],
      })
    }

    return sections
  }

  const sections = getSections()
  const institutionName = session?.institution?.name || "Sente Loan"

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    if (href === "/members") return pathname.startsWith("/members")
    if (href === "/staff") return pathname.startsWith("/staff")
    if (href === "/loans")
      return (
        pathname.startsWith("/loans") ||
        pathname.startsWith("/loan-products") ||
        pathname.startsWith("/sacco-loans")
      )
    if (href === "/investments") return pathname.startsWith("/investments") || pathname.startsWith("/investment-reports")
    if (href === "/invoices") return pathname.startsWith("/invoices")
    if (href === "/reports/statements") return pathname.startsWith("/reports/statements")
    
    return pathname.startsWith(href)
  }

  const toggleSubmenu = (menuName: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuName) ? prev.filter((name) => name !== menuName) : [...prev, menuName],
    )
  }

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

  return (
    <div
      className={cn(
        "relative flex h-full flex-col transition-all duration-300 ease-in-out shrink-0 border-r border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f12] overflow-hidden select-none",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
    >
      {/* Subtle ambient brand tint at the top */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-48 rounded-full blur-3xl opacity-20 dark:opacity-25 transition-all duration-500"
        style={{
          background: "radial-gradient(circle, rgba(var(--ui-p-rgb, 240, 140, 43), 0.35) 0%, transparent 70%)"
        }}
      />

      {/* ── Brand header ── */}
      <div className="relative z-10 border-b border-gray-200 dark:border-white/10">
        {collapsed ? (
          /* ── Collapsed: toggle on top, logo below ── */
          <div className="flex flex-col items-center gap-3 px-3 py-4">
            <button
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-[#a1a1aa] dark:hover:bg-white/10 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <Link href="/dashboard" title={institutionName} className="no-underline hover:no-underline">
              <InstitutionLogo
                name={institutionName}
                logo={session?.institution?.logo}
                className="h-11 w-11 rounded-2xl border border-brand/25 shadow-[0_4px_16px_rgba(var(--ui-p-rgb,240,140,43),0.12)] dark:shadow-[0_4px_16px_rgba(var(--ui-p-rgb,240,140,43),0.15)] hover:scale-105 transition-all"
                initialsClassName="text-sm font-bold text-brand"
              />
            </Link>
          </div>
        ) : (
          /* ── Expanded: toggle top-right, stacked logo + name ── */
          <div className="relative px-4 pb-5 pt-6">
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-[#a1a1aa] dark:hover:bg-white/10 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <Link href="/dashboard" className="flex flex-col items-center group no-underline hover:no-underline">
              <InstitutionLogo
                name={institutionName}
                logo={session?.institution?.logo}
                className="h-14 w-14 rounded-2xl border border-brand/25 shadow-[0_4px_20px_rgba(var(--ui-p-rgb,240,140,43),0.14)] dark:shadow-[0_4px_20px_rgba(var(--ui-p-rgb,240,140,43),0.2)] group-hover:scale-105 transition-all"
                initialsClassName="text-base font-bold text-brand"
              />
              <div className="mt-4 w-full text-center">
                <div className="text-wrap text-[15px] font-bold tracking-tight text-gray-900 dark:text-white transition-colors">
                  {institutionName}
                </div>
                {session?.institution?.type && (
                  <div className="mt-1.5 inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand shadow-xs shadow-brand/15">
                    {session.institution.type}
                  </div>
                )}
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav
        className={cn(
          "relative z-10 flex-1 overflow-y-auto px-3 py-3 scrollbar-autohide",
          isNavScrolling && "is-scrolling"
        )}
        onScroll={handleNavScroll}
      >
        {sections.map((section, sectionIdx) => (
          <div key={section.label ?? `section-${sectionIdx}`} className={cn(sectionIdx > 0 && "mt-5")}>
            {/* Section label */}
            {section.label && !collapsed && (
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-[#71717a]">
                {section.label}
              </div>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-gray-200 dark:bg-white/10" />
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                const hasSubmenu = item.submenu && item.submenu.length > 0
                const isExpanded = expandedMenus.includes(item.name)

                return (
                  <div key={item.name}>
                    {hasSubmenu ? (
                      <button
                        onClick={() => !collapsed && toggleSubmenu(item.name)}
                        title={collapsed ? item.name : undefined}
                        className={cn(
                          "group relative flex w-full items-center rounded-xl transition-all duration-150 border cursor-pointer",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand border-brand/25 dark:border-brand/35 shadow-xs"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 dark:text-[#d4d4d8] dark:hover:bg-white/[0.06] dark:hover:text-white border-transparent",
                        )}
                      >
                        {/* Active accent pill */}
                        {active && !collapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-brand shadow-[0_0_8px_rgba(var(--ui-p-rgb,240,140,43),0.7)]" />
                        )}

                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                          active
                            ? "bg-brand/15 dark:bg-brand/25 text-brand shadow-[0_0_12px_rgba(var(--ui-p-rgb,240,140,43),0.2)]"
                            : "text-gray-400 group-hover:text-gray-700 dark:text-[#a1a1aa] dark:group-hover:text-white group-hover:scale-105",
                        )}>
                          <Icon className="h-[18px] w-[18px]" />
                        </div>

                        {!collapsed && (
                          <>
                            <span className={cn("flex-1 text-left text-[13px]", active ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-600 dark:text-[#d4d4d8] group-hover:text-gray-900 dark:group-hover:text-white")}>
                              {item.name}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                active ? "text-brand" : "text-gray-400 group-hover:text-gray-600 dark:text-[#a1a1aa] dark:group-hover:text-white",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        title={collapsed ? item.name : undefined}
                        className={cn(
                          "group relative flex items-center rounded-xl transition-all duration-150 border no-underline hover:no-underline",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand border-brand/25 dark:border-brand/35 shadow-xs"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 dark:text-[#d4d4d8] dark:hover:bg-white/[0.06] dark:hover:text-white border-transparent",
                        )}
                      >
                        {/* Active accent pill */}
                        {active && !collapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-brand shadow-[0_0_8px_rgba(var(--ui-p-rgb,240,140,43),0.7)]" />
                        )}

                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                          active
                            ? "bg-brand/15 dark:bg-brand/25 text-brand shadow-[0_0_12px_rgba(var(--ui-p-rgb,240,140,43),0.2)]"
                            : "text-gray-400 group-hover:text-gray-700 dark:text-[#a1a1aa] dark:group-hover:text-white group-hover:scale-105",
                        )}>
                          <Icon className="h-[18px] w-[18px]" />
                        </div>

                        {!collapsed && (
                          <span className={cn("text-[13px]", active ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-600 dark:text-[#d4d4d8] group-hover:text-gray-900 dark:group-hover:text-white")}>
                            {item.name}
                          </span>
                        )}
                      </Link>
                    )}

                    {/* Submenu */}
                    {hasSubmenu && !collapsed && (
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
                        style={{
                          gridTemplateRows: isExpanded ? "1fr" : "0fr",
                          opacity: isExpanded ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <div className="ml-[22px] mt-1 space-y-0.5 border-l border-gray-200 dark:border-white/10 pl-5 pb-1">
                            {item.submenu!.map((subItem, subIdx) => {
                              const subActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                              return (
                                <Link
                                  key={subItem.name}
                                  href={subItem.href}
                                  className={cn(
                                    "relative block rounded-lg px-3 py-2 text-[12px] transition-all duration-200 border no-underline hover:no-underline",
                                    subActive
                                      ? "text-brand bg-brand/10 dark:bg-brand/15 border-brand/25 dark:border-brand/35 font-semibold shadow-xs"
                                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100/60 dark:text-[#a1a1aa] dark:hover:bg-white/[0.06] dark:hover:text-white border-transparent font-medium",
                                  )}
                                  style={{
                                    transitionDelay: isExpanded ? `${subIdx * 40}ms` : "0ms",
                                    transform: isExpanded ? "translateX(0)" : "translateX(-8px)",
                                    opacity: isExpanded ? 1 : 0,
                                  }}
                                >
                                  {subActive && (
                                    <span className="absolute -left-[23px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--ui-p-rgb,240,140,43),0.8)]" />
                                  )}
                                  {subItem.name}
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div className="relative z-10 border-t border-gray-200 dark:border-white/10 px-3 py-3">
        <button
          onClick={handleLogout}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "flex w-full items-center rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-[#a1a1aa] dark:hover:bg-red-500/10 dark:hover:text-red-400 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 group transition-all duration-150 cursor-pointer",
            collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-inherit group-hover:scale-105 transition-transform">
            <LogOut className="h-[18px] w-[18px]" />
          </div>
          {!collapsed && <span className="text-[13px] font-medium text-gray-600 dark:text-[#a1a1aa] group-hover:text-red-600 dark:group-hover:text-red-400">Log out</span>}
        </button>
      </div>
    </div>
  )
}
