import { getMessagePreviewText } from "./format"
import type { ChatMessage } from "./types"

type BuildForwardedMessageInput = {
  original: ChatMessage
  forwardedFromName: string
  caption?: string
  conversationId: string
  senderId: string
  idSuffix?: number | string
}

export function buildForwardedMessage({
  original,
  forwardedFromName,
  caption = "",
  conversationId,
  senderId,
  idSuffix = Date.now(),
}: BuildForwardedMessageInput): ChatMessage {
  return {
    id: `fwd-${idSuffix}-${conversationId}`,
    conversationId,
    senderId,
    type: original.type,
    body: caption.trim(),
    sentAt: new Date().toISOString(),
    attachmentName: original.attachmentName,
    forwardedFrom: {
      senderName: forwardedFromName,
      body: original.body,
      type: original.type,
      attachmentName: original.attachmentName,
    },
    forwardedFromMessageId: original.id,
  }
}

export function getForwardedLastMessagePreview(message: ChatMessage): string {
  return getMessagePreviewText(message)
}

export function getOriginalSenderName(
  message: ChatMessage,
  currentUserId: string,
  participantName?: string,
): string {
  if (message.senderId === currentUserId) return "You"
  return participantName ?? "Unknown"
}
