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
    url.pathname = isAdmin ? ADMIN_LOGIN : INSTITUTION_LOGIN
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

  if (isClientLogin) {
    const url = req.nextUrl.clone()
    url.pathname = role === "client" ? CLIENT_PREFIX : "/dashboard"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin-login",
    "/login",
    "/dashboard",
    "/settings/:path*",
    "/users/:path*",
    "/members/:path*",
    "/staff/:path*",
    "/clients/:path*",
    "/loans/:path*",
    "/loan-products/:path*",
    "/sacco-loans/:path*",
    "/savings/:path*",
    "/investments/:path*",
    "/investment-reports/:path*",
    "/transactions/:path*",
    "/invoices/:path*",
    "/reports/:path*",
    "/finances/:path*",
    "/expenses/:path*",
    "/client-login",
    "/client-portal/:path*",
  ],
}
