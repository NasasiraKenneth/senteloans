import { clearSession } from "@/lib/session"
import { isInstitutionProtectedPath } from "@/lib/institution-protected-routes"

const PUBLIC_AUTH_PATHS = ["/login", "/admin-login", "/client-login"] as const

let redirectInFlight = false

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function loginPathFor(pathname: string): string {
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/admin-login")) {
    return "/admin-login"
  }
  if (
    pathname === "/client-portal" ||
    pathname.startsWith("/client-portal/") ||
    pathname.startsWith("/client-login")
  ) {
    return "/client-login"
  }
  return "/login"
}

export function pathRequiresAuth(pathname: string): boolean {
  if (isPublicAuthPath(pathname)) return false
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true
  if (pathname === "/client-portal" || pathname.startsWith("/client-portal/")) return true
  return isInstitutionProtectedPath(pathname)
}

/**
 * True when `/api/auth/session` is missing, returns HTML (Next.js 404 page),
 * or otherwise cannot be read as a NextAuth JSON session — the CLIENT_FETCH_ERROR case.
 */
export async function isAuthSessionUnusable(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) return true
    if (!res.ok) return true

    const data = await res.json().catch(() => null)
    if (data === null || typeof data !== "object") return true
    return !data.user
  } catch {
    return true
  }
}

/** Clear local staff cache and hard-navigate to the matching login page. */
export async function redirectToLogin(pathname: string, signOutFn?: () => Promise<unknown>): Promise<void> {
  if (typeof window === "undefined" || redirectInFlight) return
  if (isPublicAuthPath(pathname)) return

  redirectInFlight = true
  clearSession()

  if (signOutFn) {
    try {
      await signOutFn()
    } catch {
      // Session endpoint may already be dead (HTML 404).
    }
  }

  const login = loginPathFor(pathname)
  const redirect = encodeURIComponent(pathname || "/")
  window.location.replace(`${login}?redirect=${redirect}`)
}
