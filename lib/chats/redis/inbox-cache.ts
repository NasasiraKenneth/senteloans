import { getRedis } from "@/lib/queue/redis"
import type { ChatInboxResponse } from "@/lib/chats/types"
import { inboxCacheKey } from "./keys"
import type { InboxQuery } from "@/lib/chats/server/inbox-query"

const INBOX_CACHE_TTL_SECONDS = 60

export async function getCachedInbox(
  chatIdentityId: string,
  query: InboxQuery = {},
): Promise<ChatInboxResponse | null> {
  try {
    const raw = await getRedis().get(inboxCacheKey(chatIdentityId, query))
    if (!raw) return null
    return JSON.parse(raw) as ChatInboxResponse
  } catch {
    return null
  }
}

export async function setCachedInbox(
  chatIdentityId: string,
  payload: ChatInboxResponse,
  query: InboxQuery = {},
): Promise<void> {
  try {
    await getRedis().set(
      inboxCacheKey(chatIdentityId, query),
      JSON.stringify(payload),
      "EX",
      INBOX_CACHE_TTL_SECONDS,
    )
  } catch {
    // Cache is best-effort; inbox still works without Redis.
  }
}

export async function invalidateInboxCache(chatIdentityId: string): Promise<void> {
  try {
    const redis = getRedis()
    const pattern = `chat:inbox:${chatIdentityId}:*`
    let cursor = "0"

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100)
      cursor = nextCursor
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } while (cursor !== "0")
  } catch {
    // no-op
  }
}

export async function invalidateInboxCaches(chatIdentityIds: string[]): Promise<void> {
  await Promise.all(chatIdentityIds.map((id) => invalidateInboxCache(id)))
}
