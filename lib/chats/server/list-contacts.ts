import type { PoolClient } from "@/lib/db"
import type { ChatContact } from "@/lib/chats/types"
import { toIlikePattern } from "./inbox-query"

export type ContactsQuery = {
  search?: string
  role?: "all" | "member" | "staff"
}

export async function syncInstitutionChatIdentities(
  client: PoolClient,
  institutionId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO chat_identities (institution_id, branch_id, user_id)
     SELECT u.institution_id, u.branch_id, u.id
       FROM users u
      WHERE u.institution_id = $1
        AND u.status = 'Active'
     ON CONFLICT (user_id) DO UPDATE
       SET is_active = TRUE,
           updated_at = NOW()`,
    [institutionId],
  )

  await client.query(
    `INSERT INTO chat_identities (institution_id, branch_id, member_id)
     SELECT m.institution_id, m.branch_id, m.id
       FROM members m
      WHERE m.institution_id = $1
     ON CONFLICT (member_id) DO UPDATE
       SET is_active = TRUE,
           updated_at = NOW()`,
    [institutionId],
  )
}

export async function listStaffContacts(
  client: PoolClient,
  institutionId: string,
  excludeChatIdentityId?: string,
  query: ContactsQuery = {},
): Promise<ChatContact[]> {
  await syncInstitutionChatIdentities(client, institutionId)

  const searchPattern = toIlikePattern(query.search ?? "")

  const res = await client.query(
    `SELECT
       ci.id,
       u.full_name AS name,
       'staff' AS role,
       r.name AS staff_role_name,
       b.name AS branch_name
     FROM users u
     INNER JOIN chat_identities ci
       ON ci.user_id = u.id
      AND ci.is_active = TRUE
      AND ci.is_system = FALSE
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.institution_id = $1
      AND u.status = 'Active'
      AND ($2::uuid IS NULL OR ci.id <> $2)
      AND (
        $3 = ''
        OR u.full_name ILIKE $3
        OR COALESCE(r.name, '') ILIKE $3
        OR COALESCE(b.name, '') ILIKE $3
      )
    ORDER BY u.full_name ASC`,
    [institutionId, excludeChatIdentityId ?? null, searchPattern],
  )

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: "staff" as const,
    subtitle: row.staff_role_name ?? row.branch_name ?? "Staff",
  }))
}

export async function listMemberContacts(
  client: PoolClient,
  institutionId: string,
  excludeChatIdentityId?: string,
  query: ContactsQuery = {},
): Promise<ChatContact[]> {
  await syncInstitutionChatIdentities(client, institutionId)

  const searchPattern = toIlikePattern(query.search ?? "")

  const res = await client.query(
    `SELECT
       ci.id,
       m.full_name AS name,
       m.id AS member_id,
       m.member_number,
       b.name AS branch_name
     FROM members m
     INNER JOIN chat_identities ci
       ON ci.member_id = m.id
      AND ci.is_active = TRUE
      AND ci.is_system = FALSE
     LEFT JOIN branches b ON b.id = m.branch_id
    WHERE m.institution_id = $1
      AND ($2::uuid IS NULL OR ci.id <> $2)
      AND (
        $3 = ''
        OR m.full_name ILIKE $3
        OR COALESCE(m.member_number, '') ILIKE $3
        OR COALESCE(b.name, '') ILIKE $3
      )
    ORDER BY m.full_name ASC`,
    [institutionId, excludeChatIdentityId ?? null, searchPattern],
  )

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: "member" as const,
    memberId: row.member_id,
    subtitle: [row.member_number ? `M-${row.member_number}` : null, row.branch_name]
      .filter(Boolean)
      .join(" · ") || "Member",
  }))
}

export async function listInstitutionContacts(
  client: PoolClient,
  institutionId: string,
  excludeChatIdentityId?: string,
  query: ContactsQuery = {},
): Promise<ChatContact[]> {
  const role = query.role ?? "all"

  if (role === "staff") {
    return listStaffContacts(client, institutionId, excludeChatIdentityId, query)
  }

  if (role === "member") {
    return listMemberContacts(client, institutionId, excludeChatIdentityId, query)
  }

  const [staff, members] = await Promise.all([
    listStaffContacts(client, institutionId, excludeChatIdentityId, query),
    listMemberContacts(client, institutionId, excludeChatIdentityId, query),
  ])

  return [...staff, ...members]
}

export async function listClientPortalContacts(
  client: PoolClient,
  institutionId: string,
  query: ContactsQuery = {},
): Promise<ChatContact[]> {
  return listStaffContacts(client, institutionId, undefined, query)
}

export function normalizeContactsRole(role?: string | null): ContactsQuery["role"] {
  const value = (role ?? "all").trim().toLowerCase()
  if (value === "member" || value === "staff") return value
  return "all"
}
