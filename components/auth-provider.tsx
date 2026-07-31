"use client"

import { useEffect, useRef } from "react"
import { SessionProvider, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import {
  getAppSubpath,
  isAuthSessionUnusable,
  isPublicAuthPath,
  pathRequiresAuth,
  redirectToLogin,
} from "@/lib/auth-session-guard"

/**
 * When NextAuth cannot load `/api/auth/session` (404 HTML → CLIENT_FETCH_ERROR)
 * or the session has no user on a protected route, clear local state and land on login.
 */
function AuthSessionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const checkedPath = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || isPublicAuthPath(pathname) || !pathRequiresAuth(pathname)) return
    if (checkedPath.current === pathname) return
    checkedPath.current = pathname

    let cancelled = false

    void (async () => {
      const unusable = await isAuthSessionUnusable()
      if (cancelled || !unusable) return
      await redirectToLogin(pathname, () => signOut({ redirect: false }))
    })()

    return () => {
      cancelled = true
    }
  }, [pathname])

  return <>{children}</>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const subpath = getAppSubpath()
  const basePath = `${subpath}/api/auth`

  return (
    <SessionProvider basePath={basePath} refetchOnWindowFocus={false}>
      <AuthSessionGuard>{children}</AuthSessionGuard>
    </SessionProvider>
  )
}
