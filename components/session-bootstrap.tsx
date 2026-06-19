"use client"

import { useEffect } from "react"
import { hydrateStaffSession } from "@/lib/staff-session-hydration"

/**
 * Hydrates the client-side staff session cache on app load.
 * Dashboard UI reads live state via `StaffSessionProvider`; this keeps
 * localStorage in sync for legacy `getSession()` callers on any route.
 */
export function SessionBootstrap() {
  useEffect(() => {
    void hydrateStaffSession()
  }, [])

  return null
}
