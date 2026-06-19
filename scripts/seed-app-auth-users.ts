/**
 * Create app_auth_users for existing users (and optionally members) and link them.
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
import { AUTH_USER_TYPE_INSTITUTION_STAFF, getUniqueUsername } from "../lib/auth-users"

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
      `SELECT id, email, full_name FROM users WHERE auth_id IS NULL AND email IS NOT NULL AND email != ''`
    )
    for (const row of usersRes.rows) {
      const email = String(row.email).trim().toLowerCase()
      const authId = crypto.randomUUID()
      const username = await getUniqueUsername(client, email)
      await client.query(
        `INSERT INTO app_auth_users (id, user_type, username, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
         SET username = COALESCE(app_auth_users.username, EXCLUDED.username),
             user_type = COALESCE(app_auth_users.user_type, EXCLUDED.user_type)`,
        [authId, AUTH_USER_TYPE_INSTITUTION_STAFF, username, email, passwordHash]
      )
      const existing = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [email])
      const linkId = existing.rows[0]?.id ?? authId
      await client.query(`UPDATE users SET auth_id = $1 WHERE id = $2`, [linkId, row.id])
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
