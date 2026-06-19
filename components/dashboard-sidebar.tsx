"use client"

import { useState, useEffect } from "react"
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

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const { session } = useStaffSession()
  const pathname = usePathname()
  const router = useRouter()

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

  const getSections = (): NavSection[] => {
    const config = session?.institution?.config || {}
    const modules = config.modules || {}
    const clientTerm = config.clientTerminology || "Member"

    const clientLabel = session?.institution
      ? clientTerm === "Member" ? "Members" : "Borrowers"
      : "Users"

    // Finance section
    const financeItems: NavItem[] = [
      {
        name: "Loans",
        href: "/loans",
        icon: CreditCard,
        submenu: [
          { name: "Member Loans", href: "/loans" },
          { name: "Sacco Loans", href: "/sacco-loans" },
          { name: "Loan Products", href: "/loan-products" },
        ],
      },
    ]
    if (!session?.institution || modules.savings) {
      financeItems.push({ name: "Savings", href: "/savings", icon: PiggyBank })
    }
    financeItems.push(
      { 
        name: "Investments", 
        href: "/investments", 
        icon: TrendingUp,
        submenu: [
          { name: "All Investments", href: "/investments" },
          { name: "Investment Reports", href: "/investment-reports" },
        ], 
      },
      { name: "Transactions", href: "/transactions", icon: ArrowUpDown },
      { name: "Invoices", href: "/invoices", icon: Receipt },
    )

    // Reports submenu
    const reportsSubmenu = [{ name: "Loan Reports", href: "/reports/loans" }]
    if (!session?.institution || modules.savings) {
      reportsSubmenu.push({ name: "Savings Reports", href: "/reports/savings" })
    }
    if (!session?.institution || modules.shares) {
      reportsSubmenu.push({ name: "Share Reports", href: "/reports/shares" })
    }
    reportsSubmenu.push(
      { name: "Statements", href: "/reports/statements" },
      { name: "Sacco Loan Reports", href: "/reports/sacco-loans" },
      { name: "Invoice Reports", href: "/reports/invoices" },
      { name: "Staff Audit Reports", href: "/reports/staff-audit" },
      { name: "Financial Reports", href: "/reports/financial" },
      { name: "Treasury Reports", href: "/reports/treasury" },
    )

    return [
      {
        label: null,
        items: [{ name: "Dashboard", href: "/dashboard", icon: BarChart3 }],
      },
      {
        label: "People",
        items: [
          { name: "Staff", href: "/staff", icon: UserCog },
          { name: clientLabel, href: "/members", icon: Users },
          { name: "Third Party Agents", href: "/clients", icon: Building2 },
        ],
      },
      {
        label: "Finance",
        items: financeItems,
      },
      {
        label: "Treasury",
        items: [
          { name: "Finances", href: "/finances", icon: Landmark },
          { name: "Expenses", href: "/expenses", icon: ReceiptText },
        ],
      },
      {
        label: "Insights",
        items: [
          { name: "Reports", href: "/reports", icon: FileText, submenu: reportsSubmenu },
        ],
      },
      {
        label: null,
        items: [{ name: "Settings", href: "/settings", icon: Settings }],
      },
    ]
  }

  const sections = getSections()
  const institutionName = session?.institution?.name || "Sente Loan"

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    if (href === "/users") return pathname.startsWith("/users") || pathname.startsWith("/members")
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
        "flex h-full flex-col transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
      style={{ background: "#0f0f12" }}
    >
      {/* ── Brand header ── */}
      <div className="border-b border-white/6">
        {collapsed ? (
          /* ── Collapsed: toggle on top, logo below ── */
          <div className="flex flex-col items-center gap-3 px-3 py-4">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition-colors hover:bg-white/4 hover:text-white/50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <Link href="/dashboard">
              <InstitutionLogo
                name={institutionName}
                logo={session?.institution?.logo}
                className="h-11 w-11 rounded-2xl border border-[#f08c2b]/15 shadow-[0_4px_12px_rgba(240,140,43,0.08)]"
                initialsClassName="text-sm"
              />
            </Link>
          </div>
        ) : (
          /* ── Expanded: toggle top-right, stacked logo + name ── */
          <div className="relative px-4 pb-5 pt-6">
            <button
              onClick={() => setCollapsed(true)}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition-colors hover:bg-white/4 hover:text-white/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <Link href="/dashboard" className="flex flex-col items-center">
              <InstitutionLogo
                name={institutionName}
                logo={session?.institution?.logo}
                className="h-14 w-14 rounded-2xl border border-[#f08c2b]/15 shadow-[0_4px_16px_rgba(240,140,43,0.1)]"
                initialsClassName="text-base"
              />
              <div className="mt-4 w-full text-center">
                <div className="text-wrap text-[15px] font-bold tracking-tight text-white">
                  {institutionName}
                </div>
                {session?.institution?.type && (
                  <div className="mt-1.5 inline-flex items-center rounded-full border border-[#f08c2b]/15 bg-[#f08c2b]/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f08c2b]/80">
                    {session.institution.type}
                  </div>
                )}
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {sections.map((section, sectionIdx) => (
          <div key={section.label ?? `section-${sectionIdx}`} className={cn(sectionIdx > 0 && "mt-5")}>
            {/* Section label */}
            {section.label && !collapsed && (
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/25">
                {section.label}
              </div>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-white/8" />
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
                        className={cn(
                          "group relative flex w-full items-center rounded-xl transition-all duration-150",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-[#f08c2b]/10 text-white"
                            : "text-white/45 hover:bg-white/5 hover:text-white/80",
                        )}
                      >
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                          active ? "bg-[#f08c2b]/20 text-[#f08c2b]" : "text-inherit",
                        )}>
                          <Icon className="h-[18px] w-[18px]" />
                        </div>

                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left text-[13px] font-medium">{item.name}</span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-white/25 transition-transform duration-200",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center rounded-xl transition-all duration-150",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-[#f08c2b]/10 text-white"
                            : "text-white/45 hover:bg-white/5 hover:text-white/80",
                        )}
                      >
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                          active ? "bg-[#f08c2b]/20 text-[#f08c2b]" : "text-inherit",
                        )}>
                          <Icon className="h-[18px] w-[18px]" />
                        </div>

                        {!collapsed && (
                          <span className="text-[13px] font-medium">{item.name}</span>
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
                          <div className="ml-[22px] mt-1 space-y-0.5 border-l border-white/6 pl-5 pb-1">
                            {item.submenu!.map((subItem, subIdx) => {
                              const subActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                              return (
                                <Link
                                  key={subItem.name}
                                  href={subItem.href}
                                  className={cn(
                                    "relative block rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-200",
                                    subActive
                                      ? "text-[#f08c2b] bg-[#f08c2b]/8"
                                      : "text-white/35 hover:bg-white/4 hover:text-white/65",
                                  )}
                                  style={{
                                    transitionDelay: isExpanded ? `${subIdx * 40}ms` : "0ms",
                                    transform: isExpanded ? "translateX(0)" : "translateX(-8px)",
                                    opacity: isExpanded ? 1 : 0,
                                  }}
                                >
                                  {subActive && (
                                    <span className="absolute -left-[23px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#f08c2b]" />
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
      <div className="border-t border-white/6 px-3 py-3">
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center rounded-xl text-white/35 transition-all duration-150 hover:bg-white/5 hover:text-white/65",
            collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <LogOut className="h-[18px] w-[18px]" />
          </div>
          {!collapsed && <span className="text-[13px] font-medium">Log out</span>}
        </button>
      </div>
    </div>
  )
}
