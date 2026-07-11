/**
 * Run PostgreSQL migrations in order (00, 01, 02, ...).
 * Usage: npm run db:migrate  (loads .env.local / .env from project root)
 * Requires: DATABASE_URL in env or .env.local
 */

import * as path from "path"
import { config } from "dotenv"

// Load .env then .env.local from project root (so .env.local overrides)
config({ path: path.join(__dirname, "..", ".env") })
config({ path: path.join(__dirname, "..", ".env.local") })

import { Pool } from "pg"
import * as fs from "fs"
import { hash } from "bcryptjs"
import { AUTH_USER_TYPE_INSTITUTION_STAFF, AUTH_USER_TYPE_MEMBER, getUniqueUsername } from "../lib/auth-users"

const MIGRATIONS_DIR = path.join(__dirname)
const DEFAULT_SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "changeme"

async function seedAuthUsers(pool: Pool) {
  console.log("Seeding app auth links for staff/members...")
  const passwordHash = await hash(DEFAULT_SEED_PASSWORD, 10)
  const client = await pool.connect()
  let linkedStaff = 0
  let linkedMembers = 0

  try {
    await client.query("BEGIN")

    const staffRes = await client.query<{ id: string; email: string }>(
      `SELECT id, email
       FROM users
       WHERE auth_id IS NULL
         AND email IS NOT NULL
         AND email <> ''`
    )

    for (const row of staffRes.rows) {
      const email = row.email.trim().toLowerCase()
      const username = await getUniqueUsername(client, email)
      await client.query(
        `INSERT INTO app_auth_users (user_type, username, email, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [AUTH_USER_TYPE_INSTITUTION_STAFF, username, email, passwordHash]
      )

      const authRes = await client.query<{ id: string }>(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [email]
      )
      const authId = authRes.rows[0]?.id
      if (!authId) continue

      await client.query(
        `UPDATE users
         SET auth_id = $1
         WHERE id = $2`,
        [authId, row.id]
      )
      linkedStaff++
    }

    const memberRes = await client.query<{ id: string; email: string }>(
      `SELECT id, email
       FROM members
       WHERE auth_id IS NULL
         AND email IS NOT NULL
         AND email <> ''`
    )

    for (const row of memberRes.rows) {
      const email = row.email.trim().toLowerCase()
      const username = await getUniqueUsername(client, email)
      await client.query(
        `INSERT INTO app_auth_users (user_type, username, email, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [AUTH_USER_TYPE_MEMBER, username, email, passwordHash]
      )

      const authRes = await client.query<{ id: string }>(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [email]
      )
      const authId = authRes.rows[0]?.id
      if (!authId) continue

      await client.query(
        `UPDATE members
         SET auth_id = $1
         WHERE id = $2`,
        [authId, row.id]
      )
      linkedMembers++
    }

    await client.query("COMMIT")
    console.log(
      `  OK: seeded auth links (staff=${linkedStaff}, members=${linkedMembers}, default_password=${DEFAULT_SEED_PASSWORD})`
    )
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

async function seedMemberSupportConversations(pool: Pool) {
  const filePath = path.join(MIGRATIONS_DIR, "seed-member-support-conversations.sql")
  if (!fs.existsSync(filePath)) {
    console.log("Skipping member support seed (seed-member-support-conversations.sql not found)")
    return
  }

  console.log("Seeding SUPPORT conversations for portal-authenticated members...")
  const sql = fs.readFileSync(filePath, "utf8")
  const client = await pool.connect()
  try {
    await client.query(sql)
    const countRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM conversations c
        WHERE c.type = 'SUPPORT'`,
    )
    console.log(`  OK: SUPPORT conversations present=${countRes.rows[0]?.count ?? "0"}`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    // Fresh DBs without chat schema yet should not hard-fail unrelated setups.
    if (/relation .* does not exist/i.test(message) || /type .* does not exist/i.test(message)) {
      console.log(`  SKIP: chat schema not ready (${message})`)
      return
    }
    console.error("  FAIL: seed-member-support-conversations.sql", message)
    throw err
  } finally {
    client.release()
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{2}-.*\.sql$/.test(f))
    // Keep db:migrate for real migrations only; tests should be run manually.
    .filter((f) => !f.includes("-test-"))
  files.sort()

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, "utf8")
    console.log(`Running ${file}...`)
    const client = await pool.connect()
    try {
      await client.query(sql)
      console.log(`  OK: ${file}`)
    } catch (err: any) {
      console.error(`  FAIL: ${file}`, err.message)
      throw err
    } finally {
      client.release()
    }
  }

  await seedAuthUsers(pool)
  await seedMemberSupportConversations(pool)

  await pool.end()
  console.log("Migrations complete.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
