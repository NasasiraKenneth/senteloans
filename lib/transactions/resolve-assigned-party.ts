export type AssignedPartyType = "member" | "client" | "staff"

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
    client_id?: string | null
    staff_id?: string | null
  },
): Promise<AssignedParty> {
  const memberId = tx.member_id != null ? String(tx.member_id) : ""
  const clientId = tx.client_id != null ? String(tx.client_id) : ""
  const staffId = tx.staff_id != null ? String(tx.staff_id) : ""

  if (memberId) {
    const res = await client.query(
      `SELECT full_name, member_number FROM senteloans_members WHERE id = $1::uuid LIMIT 1`,
      [memberId],
    )
    const row = res.rows[0]
    return {
      assigned_to: row?.full_name != null ? String(row.full_name) : "",
      assigned_to_type: "member",
      assigned_to_number: row?.member_number != null ? String(row.member_number) : "",
    }
  }

  if (clientId) {
    const res = await client.query(`SELECT name FROM senteloans_clients WHERE id = $1::uuid LIMIT 1`, [clientId])
    const row = res.rows[0]
    return {
      assigned_to: row?.name != null ? String(row.name).trim() : "",
      assigned_to_type: "client",
      assigned_to_number: "",
    }
  }

  if (staffId) {
    const res = await client.query(`SELECT full_name FROM senteloans_users WHERE id = $1::uuid LIMIT 1`, [staffId])
    const row = res.rows[0]
    return {
      assigned_to: row?.full_name != null ? String(row.full_name).trim() : "",
      assigned_to_type: "staff",
      assigned_to_number: "",
    }
  }

  return { assigned_to: "", assigned_to_type: null, assigned_to_number: "" }
}
