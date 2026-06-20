"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { getSession, type SessionData } from "@/lib/session"
import { hydrateStaffSession } from "@/lib/staff-session-hydration"

type StaffSessionContextValue = {
  session: SessionData | null
  refresh: () => Promise<SessionData | null>
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null)

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  // Always null on first render (server + client) so SSR HTML matches hydration.
  const [session, setSession] = useState<SessionData | null>(null)

  const refresh = useCallback(async () => {
    const local = getSession()
    if (local) setSession(local)

    const merged = await hydrateStaffSession()
    if (merged) setSession(merged)
    return merged
  }, [])

  // Sync localStorage before paint to minimize "Sente Loan" flash after hydration.
  useLayoutEffect(() => {
    const local = getSession()
    if (local) setSession(local)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ session, refresh }), [session, refresh])

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>
}

export function useStaffSession() {
  const ctx = useContext(StaffSessionContext)
  if (!ctx) {
    throw new Error("useStaffSession must be used within <StaffSessionProvider>")
  }
  return ctx
}
