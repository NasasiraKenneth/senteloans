import type { ThreadEvent } from "@/lib/chats/redis/pubsub"
import { getChatSocket } from "./socket"

export type TypingUpdate = {
  conversationId: string
  chatIdentityId: string
  displayName: string
  isTyping: boolean
}

export function subscribeThreadUpdates(
  conversationId: string,
  onEvent: (event: ThreadEvent) => void,
): () => void {
  const socket = getChatSocket()
  if (!socket || !conversationId) return () => undefined

  const handleConnect = () => {
    socket.emit("thread:subscribe", { conversationId })
  }

  const handleEvent = (payload: ThreadEvent) => {
    if (payload?.conversationId === conversationId) onEvent(payload)
  }

  socket.on("connect", handleConnect)
  socket.on("thread:event", handleEvent)
  if (socket.connected) handleConnect()

  return () => {
    socket.emit("thread:unsubscribe", { conversationId })
    socket.off("connect", handleConnect)
    socket.off("thread:event", handleEvent)
  }
}

export function emitTypingStart(conversationId: string): void {
  const socket = getChatSocket()
  if (!socket || !conversationId) return
  if (!socket.connected) {
    socket.once("connect", () => {
      socket.emit("typing:start", { conversationId })
    })
    return
  }
  socket.emit("typing:start", { conversationId })
}

export function emitTypingStop(conversationId: string): void {
  const socket = getChatSocket()
  if (!socket || !conversationId || !socket.connected) return
  socket.emit("typing:stop", { conversationId })
}

/**
 * Subscribe to typing updates for an open thread.
 * Ignores the current user's own typing events.
 */
export function subscribeTypingUpdates(
  conversationId: string,
  currentIdentityId: string,
  onChange: (typers: { chatIdentityId: string; displayName: string }[]) => void,
): () => void {
  const socket = getChatSocket()
  if (!socket || !conversationId) return () => undefined

  const typers = new Map<string, { displayName: string; timer: ReturnType<typeof setTimeout> }>()

  const publish = () => {
    onChange(
      Array.from(typers.entries()).map(([id, value]) => ({
        chatIdentityId: id,
        displayName: value.displayName,
      })),
    )
  }

  const clearTyper = (id: string) => {
    const existing = typers.get(id)
    if (!existing) return
    clearTimeout(existing.timer)
    typers.delete(id)
    publish()
  }

  const handleUpdate = (payload: TypingUpdate) => {
    if (payload?.conversationId !== conversationId) return
    if (!payload.chatIdentityId || payload.chatIdentityId === currentIdentityId) return

    if (!payload.isTyping) {
      clearTyper(payload.chatIdentityId)
      return
    }

    const existing = typers.get(payload.chatIdentityId)
    if (existing) clearTimeout(existing.timer)

    const timer = setTimeout(() => clearTyper(payload.chatIdentityId), 3500)
    typers.set(payload.chatIdentityId, {
      displayName: payload.displayName || "Someone",
      timer,
    })
    publish()
  }

  const handleConnect = () => {
    socket.emit("thread:subscribe", { conversationId })
  }

  socket.on("connect", handleConnect)
  socket.on("typing:update", handleUpdate)
  if (socket.connected) handleConnect()

  return () => {
    for (const { timer } of typers.values()) clearTimeout(timer)
    typers.clear()
    socket.off("connect", handleConnect)
    socket.off("typing:update", handleUpdate)
  }
}

export function formatTypingLabel(
  typers: { chatIdentityId: string; displayName: string }[],
): string | null {
  if (typers.length === 0) return null
  if (typers.length === 1) return `${typers[0].displayName} is typing…`
  if (typers.length === 2) {
    return `${typers[0].displayName} and ${typers[1].displayName} are typing…`
  }
  return "Several people are typing…"
}

/**
 * Inbox-level typing previews (conversation list).
 */
export function subscribeInboxTyping(
  chatIdentityId: string,
  onUpdate: (payload: TypingUpdate) => void,
): () => void {
  const socket = getChatSocket()
  if (!socket || !chatIdentityId) return () => undefined

  const handleConnect = () => {
    socket.emit("inbox:subscribe", { chatIdentityId })
  }

  const handleTyping = (payload: TypingUpdate) => {
    if (!payload?.conversationId) return
    if (payload.chatIdentityId === chatIdentityId) return
    onUpdate(payload)
  }

  socket.on("connect", handleConnect)
  socket.on("inbox:typing", handleTyping)
  if (socket.connected) handleConnect()

  return () => {
    socket.off("connect", handleConnect)
    socket.off("inbox:typing", handleTyping)
  }
}
