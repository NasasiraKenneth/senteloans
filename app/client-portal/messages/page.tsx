"use client"

import { useEffect, useRef } from "react"
import { ChatsShell } from "@/components/chat/ChatsShell"
import { useToast } from "@/components/ui/toast"
import { useClientModuleGuard } from "@/hooks/use-client-module-guard"
import { CHATS_DISABLED_MESSAGE } from "@/lib/chats/chats-disabled"

export default function ClientPortalMessagesPage() {
  const { toast } = useToast()
  const { enabled, isLoading } = useClientModuleGuard("chats")
  const toastedRef = useRef(false)

  useEffect(() => {
    if (isLoading || enabled || toastedRef.current) return
    toastedRef.current = true
    toast({
      title: "Chats disabled",
      description: CHATS_DISABLED_MESSAGE,
    })
  }, [enabled, isLoading, toast])

  if (isLoading || !enabled) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center text-sm text-muted-foreground">
        {isLoading ? "Loading…" : "Chat messaging is not available for this branch."}
      </div>
    )
  }

  return (
    <ChatsShell
      apiBase="/api/client/chats"
      className="-m-4 h-[calc(100vh-5rem)] sm:-m-6"
      enableMemberLinks={false}
      allowCreateGroup={false}
    />
  )
}
