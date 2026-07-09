import type { ChatMessage, MessageType } from "./types"

/** Fixed locale so SSR and client render identical time strings. */
const CHAT_LOCALE = "en-US"

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(CHAT_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatMessageTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  if (isSameCalendarDay(date, now)) {
    return formatClockTime(date)
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(date, yesterday)) return "Yesterday"

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) {
    return date.toLocaleDateString(CHAT_LOCALE, { weekday: "short" })
  }

  return date.toLocaleDateString(CHAT_LOCALE, { day: "numeric", month: "short" })
}

/** Clock time shown inside a message bubble — time only, no date. */
export function formatBubbleTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  return formatClockTime(date)
}

export function formatMessageDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  if (isSameCalendarDay(date, now)) return "Today"

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(date, yesterday)) return "Yesterday"

  return date.toLocaleDateString(CHAT_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function previewMessage(body: string, type: MessageType): string {
  if (type === "SYSTEM") return body
  if (type === "IMAGE") return "Photo"
  if (type === "FILE") return "Attachment"
  if (type === "AUDIO") return "Voice message"
  if (type === "VIDEO") return "Video"
  return body
}

export function getMessagePreviewText(
  message: Pick<ChatMessage, "body" | "type" | "forwardedFrom" | "attachmentName">,
): string {
  if (message.forwardedFrom) {
    const inner = previewMessage(
      message.forwardedFrom.attachmentName ?? message.forwardedFrom.body,
      message.forwardedFrom.type,
    )
    return message.body.trim() ? message.body : `Forwarded: ${inner}`
  }

  return previewMessage(message.attachmentName ?? message.body, message.type)
}
