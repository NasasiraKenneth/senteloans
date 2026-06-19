import type { LucideIcon } from "lucide-react"
import { User, CreditCard, PiggyBank, Home, PieChart, History } from "lucide-react"

export type ClientPortalNavItem = {
  name: string
  href: string
  icon: LucideIcon
  active: boolean
  /** Shown in the mobile bottom bar when true */
  mobilePrimary?: boolean
}

export type ClientPortalNavSection = {
  label: string | null
  items: ClientPortalNavItem[]
}

export function buildClientPortalNavSections(params: {
  pathname: string
  hasSavings: boolean
  hasShares: boolean
}): ClientPortalNavSection[] {
  const { pathname, hasSavings, hasShares } = params

  const overview: ClientPortalNavItem = {
    name: "Overview",
    href: "/client-portal",
    icon: Home,
    active: pathname === "/client-portal",
    mobilePrimary: true,
  }

  const loans: ClientPortalNavItem = {
    name: "Loans",
    href: "/client-portal/loans",
    icon: CreditCard,
    active:
      pathname.startsWith("/client-portal/loans") ||
      pathname.startsWith("/client-portal/apply-loan") ||
      pathname.startsWith("/client-portal/loan-details"),
    mobilePrimary: true,
  }

  const transactions: ClientPortalNavItem = {
    name: "Transactions",
    href: "/client-portal/transactions",
    icon: History,
    active: pathname.startsWith("/client-portal/transactions"),
    mobilePrimary: true,
  }

  const profile: ClientPortalNavItem = {
    name: "Profile",
    href: "/client-portal/profile",
    icon: User,
    active: pathname.startsWith("/client-portal/profile"),
    mobilePrimary: true,
  }

  const financeItems: ClientPortalNavItem[] = [loans, transactions]
  if (hasSavings) {
    financeItems.push({
      name: "Savings",
      href: "/client-portal/savings",
      icon: PiggyBank,
      active: pathname.startsWith("/client-portal/savings"),
    })
  }
  if (hasShares) {
    financeItems.push({
      name: "Shares",
      href: "/client-portal/shares",
      icon: PieChart,
      active: pathname.startsWith("/client-portal/shares"),
    })
  }

  return [
    { label: null, items: [overview] },
    { label: "Finance", items: financeItems },
    { label: "Account", items: [profile] },
  ]
}

export function flattenClientPortalNavItems(sections: ClientPortalNavSection[]): ClientPortalNavItem[] {
  return sections.flatMap((section) => section.items)
}

export function getActiveClientPortalNavItem(sections: ClientPortalNavSection[]): ClientPortalNavItem | undefined {
  return flattenClientPortalNavItems(sections).find((item) => item.active)
}

export function clientPortalSectionLabel(clientTerminology: string): string {
  return `${clientTerminology} Portal`
}

/** @deprecated Use buildClientPortalNavSections */
export function buildClientPortalNavItems(params: {
  pathname: string
  hasSavings: boolean
  hasShares: boolean
}): ClientPortalNavItem[] {
  return flattenClientPortalNavItems(buildClientPortalNavSections(params))
}
