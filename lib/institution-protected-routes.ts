/** Institution portal paths that require a staff session (sidebar + proxy). */
export const INSTITUTION_PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/users", // legacy alias; members UI lives under /members
  "/members",
  "/staff",
  "/clients",
  "/loans",
  "/loan-products",
  "/sacco-loans",
  "/savings",
  "/investments",
  "/investment-reports",
  "/transactions",
  "/invoices",
  "/reports",
  "/finances",
  "/expenses",
] as const

export function isInstitutionProtectedPath(pathname: string): boolean {
  return INSTITUTION_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isAllowedInstitutionRedirect(path: string): boolean {
  return INSTITUTION_PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}
