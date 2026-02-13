/**
 * Create app_auth_users for existing senteloans_users (and optionally clients) and link them.
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
      `SELECT id, email, full_name FROM senteloans_users WHERE supabase_user_id IS NULL AND email IS NOT NULL AND email != ''`
    )
    for (const row of usersRes.rows) {
      const authId = crypto.randomUUID()
      await client.query(
        `INSERT INTO app_auth_users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
        [authId, row.email, passwordHash]
      )
      const existing = await client.query(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [row.email]
      )
      const linkId = existing.rows[0]?.id ?? authId
      await client.query(
        `UPDATE senteloans_users SET supabase_user_id = $1 WHERE id = $2`,
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
