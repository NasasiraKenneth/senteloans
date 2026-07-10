import type { PoolClient } from "@/lib/db"
import { ChatMessageError } from "./chat-message-error"
import { canAccessSupportQueue } from "./support-access"

export type ConversationAccess = {
  conversationId: string
  institutionId: string
  branchId: string | null
  type: string
  isParticipant: boolean
}

export async function requireConversationAccess(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
  options?: {
    hasManageSupportParticipants?: boolean
  },
): Promise<ConversationAccess> {
  const access = await canAccessSupportQueue(client, {
    conversationId,
    chatIdentityId,
    hasManageSupportParticipants: options?.hasManageSupportParticipants ?? false,
  })

  if (!access.allowed) {
    throw new ChatMessageError("Conversation not found", "not_found")
  }

  return {
    conversationId,
    institutionId: access.institutionId,
    branchId: access.branchId,
    type: access.type,
    isParticipant: access.isParticipant,
  }
}
