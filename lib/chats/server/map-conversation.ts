import type {
  ChatParticipant,
  ConversationReference,
  ConversationType,
  MessageType,
} from "@/lib/chats/types"

export type ConversationRow = {
  id: string
  type: ConversationType
  title: string | null
  last_message_at: string | null
  last_message_preview: string | null
  latest_pinned_at: string | null
  last_message_sender_id: string | null
  last_message_type: MessageType | null
  unread_count: number
}

export type ParticipantRow = {
  conversation_id: string
  chat_identity_id: string
  is_system: boolean
  display_name: string
  role: "staff" | "member"
  member_id: string | null
  member_number: string | null
  branch_name: string | null
  staff_role_name: string | null
}

export type ReferenceRow = {
  conversation_id: string
  reference_type: ConversationReference["type"] | "INSTITUTION"
  reference_id: string
  reference_label: string | null
}

export function buildParticipantSubtitle(row: ParticipantRow): string | undefined {
  if (row.role === "member") {
    const parts = [
      row.member_number ? `M-${row.member_number}` : null,
      row.branch_name,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(" · ") : "Member"
  }

  if (row.staff_role_name) return row.staff_role_name
  return "Staff"
}

export function mapReferenceRow(row: ReferenceRow): ConversationReference | undefined {
  if (row.reference_type === "INSTITUTION") return undefined

  const label =
    row.reference_label ??
    (row.reference_type === "LOAN"
      ? row.reference_id
      : row.reference_type === "BRANCH"
        ? "Branch"
        : row.reference_type)

  return {
    type: row.reference_type,
    id: row.reference_id,
    label,
  }
}

export function resolveConversationDisplayTitle(
  row: Pick<ConversationRow, "type" | "title">,
  participants: ChatParticipant[],
  currentIdentityId: string,
): string {
  if (row.type !== "DIRECT") {
    return row.title?.trim() || "Conversation"
  }

  const peer = participants.find((participant) => participant.id !== currentIdentityId)
  return peer?.name ?? row.title?.trim() ?? "Direct message"
}

export function mapParticipantRow(row: ParticipantRow): ChatParticipant {
  return {
    id: row.chat_identity_id,
    name: row.display_name,
    role: row.role,
    memberId: row.member_id ?? undefined,
    subtitle: buildParticipantSubtitle(row),
  }
}
