import type { PoolClient } from "pg"

export type ThirdPartyAgentStatus = "Active" | "Inactive" | "Suspended" | "Closed"

export interface ThirdPartyAgentRow {
  id: string
  institution_id: string
  branch_id: string
  name: string
  status: ThirdPartyAgentStatus
}

export type ThirdPartyAgentStatusError =
  | "third_party_agent_not_found"
  | "third_party_agent_inactive"

export type ThirdPartyAgentStatusResult =
  | { ok: true; agent: ThirdPartyAgentRow }
  | { ok: false; error: ThirdPartyAgentStatusError; status?: ThirdPartyAgentStatus }

const AGENT_LOOKUP_SQL = `SELECT
     id,
     institution_id,
     branch_id,
     name,
     status::text AS status
   FROM third_party_agents
  WHERE id = $1
  LIMIT 1`

export async function getThirdPartyAgentById(
  client: PoolClient,
  agentId: string,
  institutionId?: string,
): Promise<ThirdPartyAgentStatusResult> {
  const res = await client.query<ThirdPartyAgentRow>(AGENT_LOOKUP_SQL, [agentId])
  const row = res.rows[0]
  if (!row) return { ok: false, error: "third_party_agent_not_found" }
  if (institutionId && row.institution_id !== institutionId) {
    return { ok: false, error: "third_party_agent_not_found" }
  }
  return { ok: true, agent: row }
}

export function assertThirdPartyAgentActiveRow(
  agent: Pick<ThirdPartyAgentRow, "status"> & Partial<ThirdPartyAgentRow>,
): ThirdPartyAgentStatusResult {
  if (agent.status !== "Active") {
    return { ok: false, error: "third_party_agent_inactive", status: agent.status }
  }
  return { ok: true, agent: agent as ThirdPartyAgentRow }
}

export async function assertThirdPartyAgentActive(
  client: PoolClient,
  agentId: string,
  institutionId?: string,
): Promise<ThirdPartyAgentStatusResult> {
  const res = await getThirdPartyAgentById(client, agentId, institutionId)
  if (!res.ok) return res
  return assertThirdPartyAgentActiveRow(res.agent)
}

/**
 * Inactive agents may only receive a status-only PATCH (e.g. reactivation).
 */
export function assertThirdPartyAgentEditableForUpdates(
  agent: Pick<ThirdPartyAgentRow, "status">,
  updates: Record<string, unknown>,
): ThirdPartyAgentStatusResult {
  const activeCheck = assertThirdPartyAgentActiveRow(agent)
  if (activeCheck.ok) return activeCheck

  const updateKeys = Object.keys(updates)
  const statusOnlyReactivation = updateKeys.length === 1 && updateKeys[0] === "status"
  if (statusOnlyReactivation) {
    return { ok: true, agent: agent as ThirdPartyAgentRow }
  }

  return {
    ok: false,
    error: "third_party_agent_inactive",
    status: agent.status as ThirdPartyAgentStatus,
  }
}
