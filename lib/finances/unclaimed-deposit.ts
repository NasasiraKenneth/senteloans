export const UNCLAIMED_ASSIGNED_TYPE_MEMBER = "Member" as const
export const UNCLAIMED_ASSIGNED_TYPE_THIRD_PARTY = "Third Party Agent" as const

export type UnclaimedAssignedType =
  | typeof UNCLAIMED_ASSIGNED_TYPE_MEMBER
  | typeof UNCLAIMED_ASSIGNED_TYPE_THIRD_PARTY
  | "—"

/** Normalizes list/export filter values for third-party assignees (legacy `client` still accepted). */
export function parseUnclaimedAssignedTypeFilter(raw: string): "" | "member" | "third_party_agent" {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
  if (value === "member") return "member"
  if (value === "client" || value === "third party agent" || value === "clients") return "third_party_agent"
  return ""
}

export function readUnclaimedThirdPartyAgentId(body: Record<string, unknown>): string | null {
  const fromNew = String(body?.third_party_agent_id || "").trim()
  if (fromNew) return fromNew
  const legacy = String(body?.client_id || "").trim()
  return legacy || null
}
