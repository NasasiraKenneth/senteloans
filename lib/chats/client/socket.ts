import { io, type Socket } from "socket.io-client"

let sharedSocket: Socket | null = null
let warnedMissingUrl = false
let tokenRefreshPromise: Promise<string | null> | null = null

async function fetchSocketToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/chats/socket-token", { cache: "no-store" })
    if (!res.ok) return null
    const data = (await res.json()) as { token?: string }
    return data.token?.trim() || null
  } catch {
    return null
  }
}

function refreshSocketToken(): Promise<string | null> {
  if (!tokenRefreshPromise) {
    tokenRefreshPromise = fetchSocketToken().finally(() => {
      tokenRefreshPromise = null
    })
  }
  return tokenRefreshPromise
}

/**
 * Shared Socket.IO client for inbox, thread, and typing realtime.
 * Requires NEXT_PUBLIC_SOCKET_URL (e.g. http://localhost:3010) and `npm run socket`.
 * Auth uses a short-lived token from `/api/chats/socket-token` so cross-origin
 * sockets work even when session cookies are not sent.
 */
export function getChatSocket(): Socket | null {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL?.trim()
  if (!url) {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development" && !warnedMissingUrl) {
      warnedMissingUrl = true
      console.warn(
        "[chat] NEXT_PUBLIC_SOCKET_URL is not set — realtime messages and typing are disabled. Set it to your socket server (e.g. http://localhost:3010) and run `npm run socket`.",
      )
    }
    return null
  }

  if (!sharedSocket) {
    sharedSocket = io(url, {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: true,
      transports: ["websocket", "polling"],
      auth: async (cb) => {
        const token = await refreshSocketToken()
        cb(token ? { token } : {})
      },
    })

    sharedSocket.on("connect_error", (error) => {
      console.warn("[chat] socket connect_error", error.message)
    })

    sharedSocket.on("socket:error", (payload: { error?: string }) => {
      console.warn("[chat] socket:error", payload?.error)
    })
  }

  return sharedSocket
}
