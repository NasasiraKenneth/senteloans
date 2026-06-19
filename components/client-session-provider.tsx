"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { signOut } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { formatCurrency } from "@/lib/format-currency"
import {
  clientTerminologyForInstitutionType,
  isMoneyLenderInstitutionType,
} from "@/lib/institution-branch-config"
import type { ClientSessionData } from "@/lib/client-session-types"

type ClientSessionContextValue = {
  data: ClientSessionData | null
  isLoading: boolean
  authFailed: boolean
  refresh: () => Promise<ClientSessionData | null>
  clientTerminology: string
  isMoneyLender: boolean
  formatMoney: (amount: number | null | undefined) => string
}

const ClientSessionContext = createContext<ClientSessionContextValue | null>(null)

async function fetchClientSession(): Promise<ClientSessionData> {
  const res = await fetch("/api/client/me", { cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `client_session_${res.status}`)
  }
  return res.json() as Promise<ClientSessionData>
}

export function ClientSessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ClientSessionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authFailed, setAuthFailed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const redirectToLogin = useCallback(async () => {
    setAuthFailed(true)
    await signOut({ redirect: false })
    router.replace(
      `/client-login?redirect=${encodeURIComponent(pathnameRef.current || "/client-portal")}`,
    )
  }, [router])

  const refresh = useCallback(async () => {
    try {
      const next = await fetchClientSession()
      if (!next?.client?.id || !next?.institution?.id) {
        await redirectToLogin()
        return null
      }
      setData(next)
      setAuthFailed(false)
      return next
    } catch {
      await redirectToLogin()
      return null
    }
  }, [redirectToLogin])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const next = await fetchClientSession()
        if (cancelled) return
        if (!next?.client?.id || !next?.institution?.id) {
          await redirectToLogin()
          return
        }
        setData(next)
        setAuthFailed(false)
      } catch {
        if (!cancelled) await redirectToLogin()
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // Session loads once per portal mount; pathname changes must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const institutionType = data?.institution?.type || ""
  const clientTerminology =
    data?.institution?.config?.clientTerminology || clientTerminologyForInstitutionType(institutionType)
  const currency = data?.institution?.config?.currency || "UGX"

  const formatMoney = useCallback(
    (amount: number | null | undefined) => formatCurrency(amount, currency),
    [currency],
  )

  const value = useMemo(
    () => ({
      data,
      isLoading,
      authFailed,
      refresh,
      clientTerminology,
      isMoneyLender: isMoneyLenderInstitutionType(institutionType),
      formatMoney,
    }),
    [data, isLoading, authFailed, refresh, clientTerminology, institutionType, formatMoney],
  )

  return <ClientSessionContext.Provider value={value}>{children}</ClientSessionContext.Provider>
}

export function useClientSession() {
  const ctx = useContext(ClientSessionContext)
  if (!ctx) {
    throw new Error("useClientSession must be used within <ClientSessionProvider>")
  }
  return ctx
}
