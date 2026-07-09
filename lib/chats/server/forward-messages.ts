import type { PoolClient } from "@/lib/db"
import type { ChatMessage } from "@/lib/chats/types"
import { ChatMessageError } from "./chat-message-error"
import { requireConversationAccess } from "./conversation-access"
import { loadSourceMessageSnapshot } from "./load-message"
import { sendMessage } from "./send-message"

export type ForwardMessagesInput = {
  sourceConversationId: string
  sourceMessageId: string
  targetConversationIds: string[]
  senderChatIdentityId: string
  caption?: string
}

export type ForwardMessagesResponse = {
  ok: true
  results: Array<{ conversationId: string; message: ChatMessage }>
}

export async function forwardMessages(
  client: PoolClient,
  input: ForwardMessagesInput,
): Promise<ForwardMessagesResponse> {
  const {
    sourceConversationId,
    sourceMessageId,
    targetConversationIds,
    senderChatIdentityId,
    caption = "",
  } = input

  const uniqueTargets = [...new Set(targetConversationIds.filter(Boolean))].filter(
    (id) => id !== sourceConversationId,
  )

  if (uniqueTargets.length === 0) {
    throw new ChatMessageError("Select at least one target conversation", "invalid_request")
  }

  await requireConversationAccess(client, sourceConversationId, senderChatIdentityId)

  const source = await loadSourceMessageSnapshot(
    client,
    sourceMessageId,
    sourceConversationId,
  )
  if (!source) {
    throw new ChatMessageError("Source message not found", "not_found")
  }

  const results: Array<{ conversationId: string; message: ChatMessage }> = []

  for (const targetConversationId of uniqueTargets) {
    await requireConversationAccess(client, targetConversationId, senderChatIdentityId)

    const clientMessageId = `fwd-${sourceMessageId}-${targetConversationId}-${senderChatIdentityId}`
    const sent = await sendMessage(client, {
      conversationId: targetConversationId,
      senderChatIdentityId,
      body: caption.trim(),
      messageType: source.messageType as ChatMessage["type"],
      clientMessageId,
      forwardedFromMessageId: sourceMessageId,
      metadata: {
        forwardSnapshot: {
          senderName: source.senderName,
          body: source.body,
          messageType: source.messageType,
          attachmentName: source.attachmentName ?? null,
        },
      },
    })

    results.push({
      conversationId: targetConversationId,
      message: sent.message,
    })
  }

  return { ok: true, results }
}
