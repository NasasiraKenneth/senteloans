"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useClientSession } from "@/components/client-session-provider"

type ClientModule = "savings" | "shares"

/** Redirect to overview when the branch has a module disabled. */
export function useClientModuleGuard(module: ClientModule) {
  const { data, isLoading } = useClientSession()
  const router = useRouter()

  const enabled = !!data?.institution?.config?.modules?.[module]

  useEffect(() => {
    if (isLoading || !data) return
    if (!enabled) router.replace("/client-portal")
  }, [isLoading, data, enabled, module, router])

  return { enabled, isLoading }
}
