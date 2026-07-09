import type { PoolClient } from "@/lib/db"
import type { ChatInboxResponse } from "@/lib/chats/types"
import { getCachedInbox, setCachedInbox } from "@/lib/chats/redis/inbox-cache"
import { listInboxConversations } from "./list-inbox"
import type { InboxQuery } from "./inbox-query"

type LoadInboxOptions = {
  chatIdentityId: string
  institutionId: string
  skipCache?: boolean
  query?: InboxQuery
}

export async function loadInbox(
  client: PoolClient,
  options: LoadInboxOptions,
): Promise<ChatInboxResponse> {
  const { chatIdentityId, institutionId, skipCache = false, query = {} } = options

  if (!skipCache) {
    const cached = await getCachedInbox(chatIdentityId, query)
    if (cached) return cached
  }

  const inbox = await listInboxConversations(client, chatIdentityId, institutionId, query)
  await setCachedInbox(chatIdentityId, inbox, query)
  return inbox
}
