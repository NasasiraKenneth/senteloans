import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { isInstitutionProtectedPath } from "@/lib/institution-protected-routes"

const ADMIN_PREFIX = "/admin"
const ADMIN_LOGIN = "/admin-login"
const INSTITUTION_LOGIN = "/login"
const CLIENT_PREFIX = "/client-portal"
const CLIENT_LOGIN = "/client-login"

function isAdminRoute(pathname: string) {
  if (!pathname.startsWith(ADMIN_PREFIX)) return false
  if (pathname === ADMIN_LOGIN || pathname.startsWith(`${ADMIN_LOGIN}/`)) return false
  return true
}

function isInstitutionProtectedRoute(pathname: string) {
  if (pathname === INSTITUTION_LOGIN || pathname.startsWith(`${INSTITUTION_LOGIN}/`)) return false
  return isInstitutionProtectedPath(pathname)
}

function isClientProtectedRoute(pathname: string) {
  return pathname === CLIENT_PREFIX || pathname.startsWith(`${CLIENT_PREFIX}/`)
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  const isAdmin = isAdminRoute(pathname)
  const isInstitution = isInstitutionProtectedRoute(pathname)
  const isClientProtected = isClientProtectedRoute(pathname)
  const isClientLogin = pathname === CLIENT_LOGIN || pathname.startsWith(`${CLIENT_LOGIN}/`)
  if (!isAdmin && !isInstitution && !isClientProtected && !isClientLogin) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })
  const role = token?.role ?? null
  const hasSession = !!token

  if (!hasSession) {
    if (isClientLogin) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = isAdmin ? ADMIN_LOGIN : isClientProtected ? CLIENT_LOGIN : INSTITUTION_LOGIN
    url.search = `?redirect=${encodeURIComponent(`${pathname}${search || ""}`)}`
    return NextResponse.redirect(url)
  }

  if (isInstitution) {
    if (role === "client") {
      const url = req.nextUrl.clone()
      url.pathname = CLIENT_PREFIX
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  if (isClientProtected) {
    if (role !== "client") {
      const url = req.nextUrl.clone()
      url.pathname = "/dashboard"
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  // Client login: only bounce users who are already signed in as a client.
  // Staff may open /client-login in another tab (e.g. to test or share the link).
  if (isClientLogin) {
    if (role === "client") {
      const url = req.nextUrl.clone()
      url.pathname = CLIENT_PREFIX
      url.search = ""
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
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
  ],
}
