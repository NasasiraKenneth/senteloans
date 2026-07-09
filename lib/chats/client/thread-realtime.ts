import { io, type Socket } from "socket.io-client"
import type { ThreadEvent } from "@/lib/chats/redis/pubsub"

let sharedSocket: Socket | null = null

function getSocket(): Socket | null {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL
  if (!url) return null

  if (!sharedSocket) {
    sharedSocket = io(url, {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: true,
    })
  }

  return sharedSocket
}

export function subscribeThreadUpdates(
  conversationId: string,
  onEvent: (event: ThreadEvent) => void,
): () => void {
  const socket = getSocket()
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
