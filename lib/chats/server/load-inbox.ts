import type { PoolClient } from "@/lib/db"
import type { ChatInboxResponse } from "@/lib/chats/types"
import { getCachedInbox, setCachedInbox } from "@/lib/chats/redis/inbox-cache"
import { listInboxConversations, type ListInboxOptions } from "./list-inbox"

type LoadInboxOptions = {
  chatIdentityId: string
  institutionId: string
  skipCache?: boolean
  query?: ListInboxOptions
}

export async function loadInbox(
  client: PoolClient,
  options: LoadInboxOptions,
): Promise<ChatInboxResponse> {
  const { chatIdentityId, institutionId, skipCache = false, query = {} } = options

  // Support queue + member ensure make cache stale more often — skip when queue enabled.
  const skipForQueue = query.includeSupportQueue === true
  if (!skipCache && !skipForQueue) {
    const cached = await getCachedInbox(chatIdentityId, query)
    if (cached) return cached
  }

  const inbox = await listInboxConversations(client, chatIdentityId, institutionId, query)
  if (!skipForQueue) {
    await setCachedInbox(chatIdentityId, inbox, query)
  }
  return inbox
}
