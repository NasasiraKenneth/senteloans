/**
 * Standalone Socket.IO server for chat realtime.
 *
 * Usage:
 *   SOCKET_PORT=3010 npm run socket
 *
 * Env:
 *   REDIS_URL          — pub/sub + optional Socket.IO redis adapter later
 *   SOCKET_PORT        — default 3010
 *   NEXTAUTH_SECRET    — verify session token on handshake (optional v1: identity id param)
 *
 * Inbox subscriptions:
 *   Client emits `inbox:subscribe` with { chatIdentityId }
 *   Server joins room `inbox:{chatIdentityId}`
 *   On Redis `chat:inbox:events:{id}` → emits `inbox:updated` to room
 *
 * Thread subscriptions:
 *   Client emits `thread:subscribe` with { conversationId }
 *   Server joins room `thread:{conversationId}`
 *   On Redis `chat:thread:events:{id}` → emits `thread:event` to room
 */

import http from "node:http"
import { Server } from "socket.io"
import IORedis from "ioredis"
import { REDIS_URL } from "../lib/queue/redis"
import { inboxChannel } from "../lib/chats/redis/keys"

const PORT = Number(process.env.SOCKET_PORT || 3010)

const httpServer = http.createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
  },
  path: "/socket.io",
})

const redisSub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

io.on("connection", (socket) => {
  socket.on("inbox:subscribe", (payload: { chatIdentityId?: string }) => {
    const chatIdentityId = payload?.chatIdentityId?.trim()
    if (!chatIdentityId) return
    socket.join(`inbox:${chatIdentityId}`)
  })

  socket.on("inbox:unsubscribe", (payload: { chatIdentityId?: string }) => {
    const chatIdentityId = payload?.chatIdentityId?.trim()
    if (!chatIdentityId) return
    socket.leave(`inbox:${chatIdentityId}`)
  })

  socket.on("thread:subscribe", (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId?.trim()
    if (!conversationId) return
    socket.join(`thread:${conversationId}`)
  })

  socket.on("thread:unsubscribe", (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId?.trim()
    if (!conversationId) return
    socket.leave(`thread:${conversationId}`)
  })
})

redisSub.on("pmessage", (_pattern, channel, message) => {
  const inboxMatch = channel.match(/^chat:inbox:events:(.+)$/)
  if (inboxMatch) {
    const chatIdentityId = inboxMatch[1]
    io.to(`inbox:${chatIdentityId}`).emit("inbox:updated", {
      chatIdentityId,
      raw: message,
      at: new Date().toISOString(),
    })
    return
  }

  const threadMatch = channel.match(/^chat:thread:events:(.+)$/)
  if (threadMatch) {
    const conversationId = threadMatch[1]
    let payload: unknown = message
    try {
      payload = JSON.parse(message)
    } catch {
      payload = { type: "thread:raw", conversationId, raw: message }
    }

    io.to(`thread:${conversationId}`).emit("thread:event", payload)
  }
})

Promise.all([
  redisSub.psubscribe("chat:inbox:events:*"),
  redisSub.psubscribe("chat:thread:events:*"),
]).catch((error) => {
  console.error("[socket] failed to subscribe to chat events:", error)
})

httpServer.listen(PORT, () => {
  console.log(`[socket] listening on :${PORT} (redis=${REDIS_URL})`)
})

process.on("SIGINT", () => {
  redisSub.disconnect()
  httpServer.close()
  process.exit(0)
})

process.on("SIGTERM", () => {
  redisSub.disconnect()
  httpServer.close()
  process.exit(0)
})
