import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { isInstitutionProtectedPath } from "@/lib/institution-protected-routes"

const ADMIN_PREFIX = "/admin"
const CLIENT_PREFIX = "/client-portal"

function isAdminRoute(pathname: string) {
  return pathname.startsWith(ADMIN_PREFIX)
}

function isInstitutionProtectedRoute(pathname: string) {
  if (pathname === "/login" || pathname.startsWith("/login/")) return false
  return isInstitutionProtectedPath(pathname)
}

function isClientProtectedRoute(pathname: string) {
  return pathname === CLIENT_PREFIX || pathname.startsWith(`${CLIENT_PREFIX}/`)
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // Redirect legacy /admin-login and /client-login paths to unified /login
  if (pathname === "/admin-login" || pathname === "/admin-login/") {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = "?portal=admin"
    return NextResponse.redirect(url)
  }

  if (pathname === "/client-login" || pathname === "/client-login/") {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = "?portal=client"
    return NextResponse.redirect(url)
  }

  const isAdmin = isAdminRoute(pathname)
  const isInstitution = isInstitutionProtectedRoute(pathname)
  const isClientProtected = isClientProtectedRoute(pathname)

  if (!isAdmin && !isInstitution && !isClientProtected) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })
  const role = token?.role ?? null
  const activeRole = (token?.activeRole as string) ?? (role === "client" ? "client" : role === "system_admin" ? "system_admin" : "staff")
  const hasSession = !!token

  if (!hasSession) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    const portal = isAdmin ? "admin" : isClientProtected ? "client" : "institution"
    url.search = `?portal=${portal}&redirect=${encodeURIComponent(`${pathname}${search || ""}`)}`
    return NextResponse.redirect(url)
  }

  if (isAdmin) {
    const isSysAdmin = activeRole === "system_admin" || role === "system_admin"
    if (!isSysAdmin) {
      if (token?.availableRoles && Array.isArray(token.availableRoles) && token.availableRoles.includes("system_admin")) {
        const url = req.nextUrl.clone()
        url.pathname = "/login-select"
        url.search = "?portal=admin"
        return NextResponse.redirect(url)
      }
      const url = req.nextUrl.clone()
      url.pathname = "/login"
      url.search = `?portal=admin&redirect=${encodeURIComponent(`${pathname}${search || ""}`)}`
      return NextResponse.redirect(url)
    }
  }

  if (isInstitution) {
    if (activeRole === "client") {
      const url = req.nextUrl.clone()
      url.pathname = CLIENT_PREFIX
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  if (isClientProtected) {
    if (activeRole !== "client") {
      const url = req.nextUrl.clone()
      url.pathname = "/dashboard"
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/admin-login",
    "/login",
    "/dashboard",
    "/dashboard/:path*",
    "/settings",
    "/settings/:path*",
    "/users",
    "/users/:path*",
    "/members",
    "/members/:path*",
    "/staff",
    "/staff/:path*",
    "/clients",
    "/clients/:path*",
    "/third-party-agents",
    "/third-party-agents/:path*",
    "/loans",
    "/loans/:path*",
    "/loan-products",
    "/loan-products/:path*",
    "/sacco-loans",
    "/sacco-loans/:path*",
    "/savings",
    "/savings/:path*",
    "/investments",
    "/investments/:path*",
    "/transactions",
    "/transactions/:path*",
    "/invoices",
    "/invoices/:path*",
    "/reports",
    "/reports/:path*",
    "/chats",
    "/chats/:path*",
    "/finances",
    "/finances/:path*",
    "/expenses",
    "/expenses/:path*",
    "/client-login",
    "/client-portal",
    "/client-portal/:path*",
    "/login-select",
  ],
}
