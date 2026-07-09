"use client"

import { useState, useEffect } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationPanel } from "@/components/notification-panel"
import { cn } from "@/lib/utils"

interface NotificationBellProps {
  apiEndpoint: string // '/api/client/notifications' or '/api/institution/notifications'
  contentClassName?: string
  triggerClassName?: string
}

export function NotificationBell({ apiEndpoint, contentClassName, triggerClassName }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  // Fetch unread count
  useEffect(() => {
    async function fetchUnreadCount() {
      try {
        const res = await fetch(`${apiEndpoint}?unread_only=true`, { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        setUnreadCount(data.unreadCount || 0)
      } catch (e) {
        console.error("Error fetching unread count:", e)
      }
    }

    fetchUnreadCount()

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [apiEndpoint])

  // Update count when panel opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      // Refetch count when closing (user may have marked some as read)
      setTimeout(async () => {
        try {
          const res = await fetch(`${apiEndpoint}?unread_only=true`, { cache: "no-store" })
          if (!res.ok) return
          const data = await res.json()
          setUnreadCount(data.unreadCount || 0)
        } catch (e) {
          console.error("Error fetching unread count:", e)
        }
      }, 100)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative text-muted-foreground hover:bg-primary/5 hover:text-foreground",
            triggerClassName,
          )}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("w-96 max-h-[min(520px,85vh)] overflow-hidden p-0", contentClassName)}
      >
        <NotificationPanel apiEndpoint={apiEndpoint} onCountChange={setUnreadCount} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
