/**
 * Create app_auth_users for existing users (and optionally clients) and link them.
 * Run after 09-seed-users.sql. Default password: "changeme" (change in production).
 * Usage: npm run db:seed-auth  (loads .env.local / .env from project root)
 */

import * as path from "path"
import { config } from "dotenv"

// Load .env then .env.local from project root (so .env.local overrides)
config({ path: path.join(__dirname, "..", ".env") })
config({ path: path.join(__dirname, "..", ".env.local") })

import * as crypto from "crypto"
import { Pool } from "pg"
import { hash } from "bcryptjs"

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "changeme"

function normalizeUsernameBase(email: string): string {
  const local = String(email || "").split("@")[0] || "user"
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, "")
  return cleaned || "user"
}

async function getUniqueUsername(client: any, email: string): Promise<string> {
  const base = normalizeUsernameBase(email)
  let candidate = base
  let suffix = 1

  while (true) {
    const exists = await client.query(
      `SELECT 1 FROM app_auth_users WHERE username = $1 LIMIT 1`,
      [candidate]
    )
    if (exists.rowCount === 0) return candidate
    candidate = `${base}${suffix}`
    suffix += 1
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const passwordHash = await hash(DEFAULT_PASSWORD, 10)

  const client = await pool.connect()
  try {
    const usersRes = await client.query(
      `SELECT id, email, full_name FROM users WHERE supabase_user_id IS NULL AND email IS NOT NULL AND email != ''`
    )
    for (const row of usersRes.rows) {
      const authId = crypto.randomUUID()
      const username = await getUniqueUsername(client, row.email)
      await client.query(
        `INSERT INTO app_auth_users (id, email, password_hash, username)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
         SET username = COALESCE(app_auth_users.username, EXCLUDED.username)`,
        [authId, row.email, passwordHash, username]
      )
      const existing = await client.query(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [row.email]
      )
      const linkId = existing.rows[0]?.id ?? authId
      await client.query(
        `UPDATE users SET supabase_user_id = $1 WHERE id = $2`,
        [linkId, row.id]
      )
      console.log(`Linked staff ${row.email} to app_auth_users`)
    }
    console.log("Done. Default password for seeded users:", DEFAULT_PASSWORD)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
