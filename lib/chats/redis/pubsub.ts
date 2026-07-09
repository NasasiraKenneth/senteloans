import type { ChatMessage } from "@/lib/chats/types"
import { getRedis } from "@/lib/queue/redis"
import { inboxChannel, threadChannel } from "./keys"

export type InboxInvalidateEvent = {
  type: "inbox:invalidate"
  chatIdentityId: string
  at: string
}

export type ThreadEvent =
  | {
      type: "message:new"
      conversationId: string
      message: ChatMessage
      at: string
    }
  | {
      type: "message:updated"
      conversationId: string
      message: ChatMessage
      latestPinnedAt?: string | null
      at: string
    }
  | {
      type: "participants:added"
      conversationId: string
      systemMessage?: ChatMessage
      participantIds: string[]
      at: string
    }

export async function publishInboxInvalidate(chatIdentityId: string): Promise<void> {
  const payload: InboxInvalidateEvent = {
    type: "inbox:invalidate",
    chatIdentityId,
    at: new Date().toISOString(),
  }
  try {
    await getRedis().publish(inboxChannel(chatIdentityId), JSON.stringify(payload))
  } catch {
    // Realtime refresh is best-effort until Socket.IO server is connected.
  }
}

export async function publishThreadEvent(
  conversationId: string,
  event: Omit<ThreadEvent, "at">,
): Promise<void> {
  const payload = {
    ...event,
    at: new Date().toISOString(),
  } as ThreadEvent

  try {
    await getRedis().publish(threadChannel(conversationId), JSON.stringify(payload))
  } catch {
    // Best-effort realtime delivery.
  }
}
