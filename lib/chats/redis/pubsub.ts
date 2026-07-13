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
  | {
      type: "conversation:read"
      conversationId: string
      readerChatIdentityId: string
      lastReadMessageId: string
      readAt: string
      at: string
    }

export async function publishInboxInvalidate(chatIdentityId: string): Promise<void> {
  const payload: InboxInvalidateEvent = {
    type: "inbox:invalidate",
    chatIdentityId,
    at: new Date().toISOString(),
  }
  try {
    const receivers = await getRedis().publish(inboxChannel(chatIdentityId), JSON.stringify(payload))
    if (process.env.NODE_ENV === "development") {
      console.log("[chat:pubsub] inbox invalidate", { chatIdentityId, receivers })
    }
  } catch (error) {
    console.warn("[chat:pubsub] inbox publish failed", (error as Error)?.message)
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
    const receivers = await getRedis().publish(threadChannel(conversationId), JSON.stringify(payload))
    if (process.env.NODE_ENV === "development") {
      console.log("[chat:pubsub] thread event", {
        conversationId,
        type: event.type,
        receivers,
      })
    }
  } catch (error) {
    console.warn("[chat:pubsub] thread publish failed", (error as Error)?.message)
  }
}
