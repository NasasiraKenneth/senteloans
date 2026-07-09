import type { ChatParticipant } from "./types"

export function getMemberProfileHref(participant?: ChatParticipant | null): string | null {
  if (!participant || participant.role !== "member") return null
  if (participant.memberId) return `/members/${participant.memberId}`
  return null
}
