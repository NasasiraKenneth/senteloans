/**
 * Standalone Socket.IO server for chat realtime.
 *
 * Usage:
 *   SOCKET_PORT=3010 npm run socket
 *
 * Loads `.env` then `.env.local` (same as workers) so DATABASE_URL / NEXTAUTH_SECRET
 * are available when started via `npm run socket`.
 */

import * as path from "path"
import { config } from "dotenv"

config({ path: path.join(__dirname, "..", ".env") })
config({ path: path.join(__dirname, "..", ".env.local") })

import http from "node:http"
import { Server, type Socket } from "socket.io"
import IORedis from "ioredis"
import { getToken, decode } from "next-auth/jwt"
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

function maskUrl(url: string): string {
  return url.replace(/(redis(?:s)?:\/\/[^@/]*:)([^@]+)(@)/i, "$1***$3")
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

if (!NEXTAUTH_SECRET) {
  console.error("[socket] NEXTAUTH_SECRET is missing — connections will be rejected")
}
if (!DATABASE_URL) {
  console.error("[socket] DATABASE_URL is missing — subscribe checks will fail")
} else {
  console.log("[socket] database pool ready")
}

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

  const participantRes = await pool.query(
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
  if ((participantRes.rowCount ?? 0) > 0) return true

  if (auth.type !== "staff" || !auth.userId) return false

  const supportRes = await pool.query(
    `SELECT 1
       FROM conversations c
       INNER JOIN chat_identities ci
         ON ci.user_id = $2
        AND ci.is_active = TRUE
        AND ci.institution_id = c.institution_id
       INNER JOIN users u ON u.id = ci.user_id AND u.status = 'Active'
       INNER JOIN roles r ON r.id = u.role_id
      WHERE c.id = $1
        AND c.type = 'SUPPORT'
        AND (
          r.name = 'Super Admin'
          OR EXISTS (
            SELECT 1
              FROM role_permissions rp
              JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = u.role_id
               AND rp.branch_id = u.branch_id
               AND p.name = 'manage_support_chat_participants'
          )
        )
        AND (
          c.branch_id IS NULL
          OR ci.branch_id IS NULL
          OR c.branch_id = ci.branch_id
        )
      LIMIT 1`,
    [conversationId, auth.userId],
  )

  return (supportRes.rowCount ?? 0) > 0
}

async function resolveTypingActor(
  auth: SocketAuth,
  conversationId: string,
): Promise<{ chatIdentityId: string; displayName: string } | null> {
  if (!pool) return null

  const res = await pool.query<{
    chat_identity_id: string
    display_name: string | null
    is_staff: boolean
    conversation_type: string
  }>(
    `SELECT
       ci.id AS chat_identity_id,
       COALESCE(NULLIF(TRIM(m.full_name), ''), NULLIF(TRIM(u.full_name), ''), 'Someone') AS display_name,
       (ci.user_id IS NOT NULL) AS is_staff,
       c.type::text AS conversation_type
     FROM conversations c
     INNER JOIN chat_identities ci
       ON ci.institution_id = c.institution_id
      AND ci.is_active = TRUE
      AND (
        ($2::uuid IS NOT NULL AND ci.user_id = $2)
        OR ($3::uuid IS NOT NULL AND ci.member_id = $3)
      )
     LEFT JOIN members m ON m.id = ci.member_id
     LEFT JOIN users u ON u.id = ci.user_id
    WHERE c.id = $1
    ORDER BY
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM conversation_participants cp
           WHERE cp.conversation_id = c.id
             AND cp.chat_identity_id = ci.id
             AND cp.left_at IS NULL
        ) THEN 0
        ELSE 1
      END
    LIMIT 1`,
    [conversationId, auth.userId ?? null, auth.memberId ?? null],
  )

  const row = res.rows[0]
  if (!row) return null

  const displayName =
    row.conversation_type === "SUPPORT" && row.is_staff
      ? "Support"
      : row.display_name || "Someone"

  return {
    chatIdentityId: row.chat_identity_id,
    displayName,
  }
}

async function listPeerInboxIdentityIds(
  conversationId: string,
  excludeChatIdentityId: string,
): Promise<string[]> {
  if (!pool) return []

  const res = await pool.query<{ chat_identity_id: string }>(
    `SELECT cp.chat_identity_id
       FROM conversation_participants cp
      WHERE cp.conversation_id = $1
        AND cp.left_at IS NULL
        AND cp.chat_identity_id <> $2`,
    [conversationId, excludeChatIdentityId],
  )

  const ids = res.rows.map((row) => row.chat_identity_id)

  const supportRes = await pool.query<{ id: string }>(
    `SELECT ci.id
       FROM conversations c
       INNER JOIN chat_identities ci
         ON ci.institution_id = c.institution_id
        AND ci.is_active = TRUE
        AND ci.user_id IS NOT NULL
       INNER JOIN users u ON u.id = ci.user_id AND u.status = 'Active'
       INNER JOIN roles r ON r.id = u.role_id
      WHERE c.id = $1
        AND c.type = 'SUPPORT'
        AND ci.id <> $2
        AND (
          r.name = 'Super Admin'
          OR EXISTS (
            SELECT 1
              FROM role_permissions rp
              JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = u.role_id
               AND rp.branch_id = u.branch_id
               AND p.name = 'manage_support_chat_participants'
          )
        )
        AND (
          c.branch_id IS NULL
          OR ci.branch_id IS NULL
          OR c.branch_id = ci.branch_id
        )`,
    [conversationId, excludeChatIdentityId],
  )

  return [...new Set([...ids, ...supportRes.rows.map((row) => row.id)])]
}

async function resolveSocketAuth(socket: Socket): Promise<SocketAuth | null> {
  if (!NEXTAUTH_SECRET) return null

  const handshakeToken =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token.trim()
      : typeof socket.handshake.query?.token === "string"
        ? String(socket.handshake.query.token).trim()
        : ""

  if (handshakeToken) {
    const decoded = await decode({
      token: handshakeToken,
      secret: NEXTAUTH_SECRET,
    })
    if (decoded?.authUserId) {
      return {
        authUserId: String(decoded.authUserId),
        type: String(decoded.type || ""),
        userId: decoded.userId ? String(decoded.userId) : null,
        memberId: (decoded.memberId || decoded.clientId)
          ? String(decoded.memberId || decoded.clientId)
          : null,
      }
    }
  }

  const cookieHeader = socket.request.headers.cookie
  if (!cookieHeader) return null

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } } as Parameters<typeof getToken>[0]["req"],
    secret: NEXTAUTH_SECRET,
  })

  if (!token?.authUserId) return null

  return {
    authUserId: String(token.authUserId),
    type: String(token.type || ""),
    userId: token.userId ? String(token.userId) : null,
    memberId: (token.memberId || token.clientId)
      ? String(token.memberId || token.clientId)
      : null,
  }
}

io.use(async (socket, next) => {
  try {
    const auth = await resolveSocketAuth(socket)
    if (!auth) {
      console.warn("[socket] auth rejected", {
        hasCookie: Boolean(socket.request.headers.cookie),
        hasHandshakeToken: Boolean(socket.handshake.auth?.token || socket.handshake.query?.token),
      })
      return next(new Error("unauthorized"))
    }

    socket.data.auth = auth
    console.log("[socket] connected", {
      authUserId: auth.authUserId,
      type: auth.type,
      sid: socket.id,
    })
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
      console.warn("[socket] forbidden_inbox_subscribe", {
        authUserId: auth.authUserId,
        chatIdentityId,
      })
      socket.emit("socket:error", { error: "forbidden_inbox_subscribe" })
      return
    }

    socket.join(`inbox:${chatIdentityId}`)
    console.log("[socket] inbox subscribed", { chatIdentityId, sid: socket.id })
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
      console.warn("[socket] forbidden_thread_subscribe", {
        authUserId: auth.authUserId,
        conversationId,
      })
      socket.emit("socket:error", { error: "forbidden_thread_subscribe" })
      return
    }

    socket.join(`thread:${conversationId}`)
    console.log("[socket] thread subscribed", { conversationId, sid: socket.id })
  })

  socket.on("thread:unsubscribe", (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId?.trim()
    if (!conversationId) return
    socket.leave(`thread:${conversationId}`)
  })

  const emitTyping = async (conversationId: string, isTyping: boolean) => {
    const auth = socket.data.auth as SocketAuth | undefined
    if (!auth || !conversationId) return

    const allowed = await verifyThreadAccess(auth, conversationId)
    if (!allowed) return

    socket.join(`thread:${conversationId}`)

    const actor = await resolveTypingActor(auth, conversationId)
    if (!actor) return

    const payload = {
      conversationId,
      chatIdentityId: actor.chatIdentityId,
      displayName: actor.displayName,
      isTyping,
    }

    socket.to(`thread:${conversationId}`).emit("typing:update", payload)

    const peerInboxIds = await listPeerInboxIdentityIds(conversationId, actor.chatIdentityId)
    for (const inboxId of peerInboxIds) {
      io.to(`inbox:${inboxId}`).emit("inbox:typing", payload)
    }
  }

  socket.on("typing:start", async (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId?.trim()
    if (!conversationId) return
    await emitTyping(conversationId, true)
  })

  socket.on("typing:stop", async (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId?.trim()
    if (!conversationId) return
    await emitTyping(conversationId, false)
  })

  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected", { sid: socket.id, reason })
  })
})

redisSub.on("pmessage", (_pattern, channel, message) => {
  const inboxMatch = channel.match(/^chat:inbox:events:(.+)$/)
  if (inboxMatch) {
    const chatIdentityId = inboxMatch[1]
    const room = `inbox:${chatIdentityId}`
    const size = io.sockets.adapter.rooms.get(room)?.size ?? 0
    console.log("[socket] fanout inbox:updated", { chatIdentityId, listeners: size })
    io.to(room).emit("inbox:updated", {
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

    const room = `thread:${conversationId}`
    const size = io.sockets.adapter.rooms.get(room)?.size ?? 0
    console.log("[socket] fanout thread:event", {
      conversationId,
      type: (payload as { type?: string })?.type,
      listeners: size,
    })
    io.to(room).emit("thread:event", payload)
  }
})

Promise.all([
  redisSub.psubscribe("chat:inbox:events:*"),
  redisSub.psubscribe("chat:thread:events:*"),
]).then(() => {
  console.log("[socket] redis psubscribe ready")
}).catch((error) => {
  console.error("[socket] failed to subscribe to chat events:", error)
})

httpServer.listen(PORT, () => {
  console.log(
    `[socket] listening on :${PORT} (redis=${maskUrl(REDIS_URL)}, db=${DATABASE_URL ? "yes" : "NO"}, secret=${NEXTAUTH_SECRET ? "yes" : "NO"})`,
  )
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
