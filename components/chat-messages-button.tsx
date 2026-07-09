"use client"

import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ChatMessagesButtonProps = {
  href: string
  triggerClassName?: string
  unreadCount?: number
}

export function ChatMessagesButton({
  href,
  triggerClassName,
  unreadCount = 0,
}: ChatMessagesButtonProps) {
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
