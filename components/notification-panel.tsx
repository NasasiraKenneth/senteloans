"use client"

import { useState, useEffect } from "react"
import { Clock, CheckCircle, AlertCircle, FileText, DollarSign, Shield, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import type { Notification } from "@/lib/notifications/notification-types"

interface NotificationPanelProps {
  apiEndpoint: string
  onCountChange?: (count: number) => void
}

export function NotificationPanel({ apiEndpoint, onCountChange }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNotifications()
  }, [apiEndpoint])

  async function fetchNotifications() {
    try {
      setLoading(true)
      const res = await fetch(`${apiEndpoint}?limit=50`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      if (onCountChange) onCountChange(data.unreadCount || 0)
    } catch (e) {
      console.error("Error fetching notifications:", e)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      const res = await fetch(`${apiEndpoint}/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      })
      if (!res.ok) return
      
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n))
      )
      
      // Update unread count
      const unreadCount = notifications.filter((n) => !n.read && n.id !== notificationId).length
      if (onCountChange) onCountChange(unreadCount)
    } catch (e) {
      console.error("Error marking notification as read:", e)
    }
  }

  function getIcon(type: string) {
    if (type.includes("loan")) return <DollarSign className="h-4 w-4" />
    if (type.includes("kyc")) return <Shield className="h-4 w-4" />
    if (type.includes("payment")) return <DollarSign className="h-4 w-4" />
    if (type.includes("pending")) return <Clock className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  function getVariant(type: string): "default" | "destructive" | "outline" | "secondary" {
    if (type.includes("approved") || type.includes("received") || type.includes("disbursed")) return "default"
    if (type.includes("rejected") || type.includes("overdue")) return "destructive"
    if (type.includes("pending")) return "outline"
    return "secondary"
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Loading notifications...
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">All caught up!</p>
        <p className="text-xs text-muted-foreground mt-1">You have no notifications</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col max-h-[500px]">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 hover:bg-muted/50 transition-colors ${!notification.read ? "bg-muted/30" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 ${!notification.read ? "text-primary" : "text-muted-foreground"}`}>
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium leading-tight">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
                    </div>
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => markAsRead(notification.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(notification.created_at)}</span>
                    {notification.action_url && (
                      <Link href={notification.action_url} onClick={() => markAsRead(notification.id)}>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                          View →
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      {notifications.some((n) => !n.read) && (
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={async () => {
              const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
              for (const id of unreadIds) {
                await markAsRead(id)
              }
            }}
          >
            Mark all as read
          </Button>
        </div>
      )}
    </div>
  )
}
