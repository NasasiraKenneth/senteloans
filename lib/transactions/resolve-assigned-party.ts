export type AssignedPartyType = "member" | "third_party_agent" | "staff"

export type AssignedParty = {
  assigned_to: string
  assigned_to_type: AssignedPartyType | null
  assigned_to_number: string
}

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export async function resolveTransactionAssignedParty(
  client: PgClient,
  tx: {
    member_id?: string | null
    third_party_agent_id?: string | null
    staff_id?: string | null
  },
): Promise<AssignedParty> {
  const memberId = tx.member_id != null ? String(tx.member_id) : ""
  const thirdPartyAgentId = tx.third_party_agent_id != null ? String(tx.third_party_agent_id) : ""
  const staffId = tx.staff_id != null ? String(tx.staff_id) : ""

  if (memberId) {
    const res = await client.query(
      `SELECT full_name, member_number FROM members WHERE id = $1::uuid LIMIT 1`,
      [memberId],
    )
    const row = res.rows[0]
    return {
      assigned_to: row?.full_name != null ? String(row.full_name) : "",
      assigned_to_type: "member",
      assigned_to_number: row?.member_number != null ? String(row.member_number) : "",
    }
  }

  if (thirdPartyAgentId) {
    const res = await client.query(`SELECT name FROM third_party_agents WHERE id = $1::uuid LIMIT 1`, [thirdPartyAgentId])
    const row = res.rows[0]
    return {
      assigned_to: row?.name != null ? String(row.name).trim() : "",
      assigned_to_type: "third_party_agent",
      assigned_to_number: "",
    }
  }

  if (staffId) {
    const res = await client.query(`SELECT full_name FROM users WHERE id = $1::uuid LIMIT 1`, [staffId])
    const row = res.rows[0]
    return {
      assigned_to: row?.full_name != null ? String(row.full_name).trim() : "",
      assigned_to_type: "staff",
      assigned_to_number: "",
    }
  }

  return { assigned_to: "", assigned_to_type: null, assigned_to_number: "" }
}
