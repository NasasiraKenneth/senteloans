"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChatsShell } from "@/components/chat/ChatsShell"
import { useStaffSession } from "@/components/staff-session-provider"
import { useToast } from "@/components/ui/toast"
import { readInstitutionConfigModuleEnabled } from "@/lib/institution-branch-config"
import { CHATS_DISABLED_MESSAGE } from "@/lib/chats/chats-disabled"

export default function ChatsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { session } = useStaffSession()
  const chatsEnabled = readInstitutionConfigModuleEnabled(session?.institution?.config, "chats")

  useEffect(() => {
    if (session && !chatsEnabled) {
      toast({
        title: "Chats disabled",
        description: CHATS_DISABLED_MESSAGE,
      })
      router.replace("/dashboard")
    }
  }, [chatsEnabled, router, session, toast])

  if (!session || !chatsEnabled) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground">
        Chat messaging is not available for this branch.
      </div>
    )
  }

  return <ChatsShell apiBase="/api/institution/chats" />
}
