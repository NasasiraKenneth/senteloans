"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { subscribeInboxUpdates } from "@/lib/chats/client/inbox-realtime"

type ChatMessagesButtonProps = {
  href: string
  unreadApiEndpoint: string
  triggerClassName?: string
}

export function ChatMessagesButton({
  href,
  unreadApiEndpoint,
  triggerClassName,
}: ChatMessagesButtonProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatIdentityId, setChatIdentityId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchUnreadCount() {
      try {
        const res = await fetch(unreadApiEndpoint, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          totalUnread?: number
          allowed?: boolean
          currentIdentityId?: string
        }
        if (cancelled) return
        if (data.allowed === false) {
          setUnreadCount(0)
          return
        }
        setUnreadCount(data.totalUnread ?? 0)
        if (data.currentIdentityId) setChatIdentityId(data.currentIdentityId)
      } catch {
        // best-effort badge
      }
    }

    void fetchUnreadCount()
    const interval = window.setInterval(() => void fetchUnreadCount(), 30000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [unreadApiEndpoint])

  useEffect(() => {
    if (!chatIdentityId) return
    return subscribeInboxUpdates(chatIdentityId, () => {
      void fetch(unreadApiEndpoint, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { totalUnread?: number } | null) => {
          if (data && typeof data.totalUnread === "number") {
            setUnreadCount(data.totalUnread)
          }
        })
        .catch(() => undefined)
    })
  }, [chatIdentityId, unreadApiEndpoint])

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative text-muted-foreground hover:bg-primary/5 hover:text-foreground",
        triggerClassName,
      )}
      asChild
    >
      <Link href={href} aria-label="Messages">
        <MessageCircle className="h-5 w-5" />
        {unreadCount > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        ) : null}
      </Link>
    </Button>
  )
}
