import type { PoolClient } from "pg"

/** Values for app_auth_users.user_type */
export const AUTH_USER_TYPE_MEMBER = "member"
export const AUTH_USER_TYPE_INSTITUTION_STAFF = "institution_staff"

export function normalizeUsernameBase(email: string): string {
  const local = String(email || "").split("@")[0] || "user"
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, "")
  return cleaned || "user"
}

type QueryClient = Pick<PoolClient, "query">

export async function getUniqueUsername(
  client: QueryClient,
  email: string,
  excludeAuthId?: string
): Promise<string> {
  const base = normalizeUsernameBase(email)
  let candidate = base
  let suffix = 1

  while (true) {
    const exists = excludeAuthId
      ? await client.query(
          `SELECT 1 FROM app_auth_users WHERE username = $1 AND id != $2 LIMIT 1`,
          [candidate, excludeAuthId]
        )
      : await client.query(`SELECT 1 FROM app_auth_users WHERE username = $1 LIMIT 1`, [candidate])
    if ((exists.rowCount ?? 0) === 0) return candidate
    candidate = `${base}${suffix}`
    suffix += 1
  }
}
