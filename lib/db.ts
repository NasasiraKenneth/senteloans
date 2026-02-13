/**
 * PostgreSQL client for SenteLoans (plain Postgres, no Supabase).
 * Use runWithAuth() so RLS sees app.current_user_id and auth.uid() works.
 */

import { Pool, PoolClient } from "pg"

let pool: Pool | null = null

function getPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  }
  return pool
}

const SEARCH_PATH = "SET LOCAL search_path = public, auth, app"

// PostgreSQL SET LOCAL does not accept bound parameters ($1); use literal value. Validate UUID to avoid injection.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function setCurrentUserId(client: PoolClient, authUserId: string): Promise<void> {
  if (!UUID_REGEX.test(authUserId)) return Promise.resolve()
  return client.query(`SET LOCAL app.current_user_id = '${authUserId}'`)
}

/**
 * Run a callback with a DB client. If authUserId is set, runs SET LOCAL app.current_user_id
 * so RLS policies that use auth.uid() apply. Use this for all tenant-scoped queries.
 */
export async function runWithAuth<T>(
  authUserId: string | null,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool()
  const client = await p.connect()
  try {
    await client.query(SEARCH_PATH)
    if (authUserId) await setCurrentUserId(client, authUserId)
    return await fn(client)
  } finally {
    client.release()
  }
}

/**
 * Get a raw client without setting auth context. Use for auth lookups (e.g. login)
 * or service-style operations that bypass RLS (e.g. with a superuser or separate role).
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect()
}

/**
 * Run a callback with a client that has no auth context (e.g. login, or admin operations).
 */
export async function runWithoutAuth<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool()
  const client = await p.connect()
  try {
    await client.query(SEARCH_PATH)
    return await fn(client)
  } finally {
    client.release()
  }
}

export type { PoolClient }
