"use client"

import { useEffect } from "react"
import { getSession, updateInstitutionConfig } from "@/lib/session"

/**
 * SessionBootstrap ensures institution config is present in localStorage session.
 * - If a session exists but lacks institution.config, it fetches /api/institution/settings
 *   and updates the session with a normalized config.
 * - If there is no session, this component does not create one (to avoid partial user data).
 *   Pages that need config should still hydrate themselves as a fallback.
 */
export function SessionBootstrap() {
  useEffect(() => {
    const session = getSession()
    if (!session || session?.institution?.config) return

    ;(async () => {
      try {
        const res = await fetch("/api/institution/settings", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (data?.config) {
          updateInstitutionConfig(data.config)
        }
      } catch {
        // ignore bootstrap errors
      }
    })()
  }, [])

  return null
}
