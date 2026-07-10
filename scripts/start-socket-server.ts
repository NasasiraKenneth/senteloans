/**
 * Standalone Socket.IO server for chat realtime.
 *
 * Usage:
 *   SOCKET_PORT=3010 npm run socket
 *
 * Env:
 *   REDIS_URL
 *   SOCKET_PORT (default 3010)
 *   NEXTAUTH_SECRET — required to verify session cookies on handshake
 *   DATABASE_URL — verify identity/participant ownership on subscribe
 *   NEXT_PUBLIC_APP_URL — CORS origin
 */

import http from "node:http"
import { Server, type Socket } from "socket.io"
import IORedis from "ioredis"
import { getToken } from "next-auth/jwt"
import { Pool } from "pg"
import { REDIS_URL } from "../lib/queue/redis"

const PORT = Number(process.env.SOCKET_PORT || 3010)
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
const DATABASE_URL = process.env.DATABASE_URL

type SocketAuth = {
  authUserId: string
  type: "staff" | "client" | string
  userId?: string | null
  memberId?: string | null
}

const httpServer = http.createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
  },
  path: "/socket.io",
})

const redisSub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 })
  : null

async function verifyInboxIdentity(auth: SocketAuth, chatIdentityId: string): Promise<boolean> {
  if (!pool) return false

  if (auth.type === "staff" && auth.userId) {
    const res = await pool.query(
      `SELECT 1 FROM chat_identities
        WHERE id = $1 AND user_id = $2 AND is_active = TRUE
        LIMIT 1`,
      [chatIdentityId, auth.userId],
    )
    return (res.rowCount ?? 0) > 0
  }

  if (auth.type === "client" && auth.memberId) {
    const res = await pool.query(
      `SELECT 1 FROM chat_identities
        WHERE id = $1 AND member_id = $2 AND is_active = TRUE
        LIMIT 1`,
      [chatIdentityId, auth.memberId],
    )
    return (res.rowCount ?? 0) > 0
  }

  return false
}

async function verifyThreadAccess(auth: SocketAuth, conversationId: string): Promise<boolean> {
  if (!pool) return false

  const res = await pool.query(
    `SELECT 1
       FROM conversation_participants cp
       INNER JOIN chat_identities ci ON ci.id = cp.chat_identity_id
      WHERE cp.conversation_id = $1
        AND cp.left_at IS NULL
        AND (
          ($2::uuid IS NOT NULL AND ci.user_id = $2)
          OR ($3::uuid IS NOT NULL AND ci.member_id = $3)
        )
      LIMIT 1`,
    [conversationId, auth.userId ?? null, auth.memberId ?? null],
  )

  return (res.rowCount ?? 0) > 0
}

io.use(async (socket, next) => {
  try {
    if (!NEXTAUTH_SECRET) {
      return next(new Error("socket_auth_misconfigured"))
    }

    const cookieHeader = socket.request.headers.cookie
    if (!cookieHeader) {
      return next(new Error("unauthorized"))
    }

    const token = await getToken({
      req: { headers: { cookie: cookieHeader } } as Parameters<typeof getToken>[0]["req"],
      secret: NEXTAUTH_SECRET,
    })

    if (!token?.authUserId) {
      return next(new Error("unauthorized"))
    }

    socket.data.auth = {
      authUserId: String(token.authUserId),
      type: String(token.type || ""),
      userId: token.userId ? String(token.userId) : null,
      memberId: (token.memberId || token.clientId)
        ? String(token.memberId || token.clientId)
        : null,
    } satisfies SocketAuth

    return next()
  } catch (error) {
    console.error("[socket] auth failed", error)
    return next(new Error("unauthorized"))
  }
})

io.on("connection", (socket: Socket) => {
  socket.on("inbox:subscribe", async (payload: { chatIdentityId?: string }) => {
    const auth = socket.data.auth as SocketAuth | undefined
    const chatIdentityId = payload?.chatIdentityId?.trim()
    if (!auth || !chatIdentityId) return

    const allowed = await verifyInboxIdentity(auth, chatIdentityId)
    if (!allowed) {
      socket.emit("socket:error", { error: "forbidden_inbox_subscribe" })
      return
    }

    socket.join(`inbox:${chatIdentityId}`)
  })

  socket.on("inbox:unsubscribe", (payload: { chatIdentityId?: string }) => {
    const chatIdentityId = payload?.chatIdentityId?.trim()
    if (!chatIdentityId) return
    socket.leave(`inbox:${chatIdentityId}`)
  })

  socket.on("thread:subscribe", async (payload: { conversationId?: string }) => {
    const auth = socket.data.auth as SocketAuth | undefined
    const conversationId = payload?.conversationId?.trim()
    if (!auth || !conversationId) return

    const allowed = await verifyThreadAccess(auth, conversationId)
    if (!allowed) {
      socket.emit("socket:error", { error: "forbidden_thread_subscribe" })
      return
    }

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
  void pool?.end()
  httpServer.close()
  process.exit(0)
})

process.on("SIGTERM", () => {
  redisSub.disconnect()
  void pool?.end()
  httpServer.close()
  process.exit(0)
})
