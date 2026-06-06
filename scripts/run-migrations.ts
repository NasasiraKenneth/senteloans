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
       WHERE supabase_user_id IS NULL
         AND email IS NOT NULL
         AND email <> ''`
    )

    for (const row of staffRes.rows) {
      await client.query(
        `INSERT INTO app_auth_users (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING`,
        [row.email.trim().toLowerCase(), passwordHash]
      )

      const authRes = await client.query<{ id: string }>(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [row.email.trim().toLowerCase()]
      )
      const authId = authRes.rows[0]?.id
      if (!authId) continue

      await client.query(
        `UPDATE users
         SET supabase_user_id = $1
         WHERE id = $2`,
        [authId, row.id]
      )
      linkedStaff++
    }

    const memberRes = await client.query<{ id: string; email: string }>(
      `SELECT id, email
       FROM members
       WHERE supabase_user_id IS NULL
         AND email IS NOT NULL
         AND email <> ''`
    )

    for (const row of memberRes.rows) {
      await client.query(
        `INSERT INTO app_auth_users (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING`,
        [row.email.trim().toLowerCase(), passwordHash]
      )

      const authRes = await client.query<{ id: string }>(
        `SELECT id FROM app_auth_users WHERE email = $1`,
        [row.email.trim().toLowerCase()]
      )
      const authId = authRes.rows[0]?.id
      if (!authId) continue

      await client.query(
        `UPDATE members
         SET supabase_user_id = $1
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

  await pool.end()
  console.log("Migrations complete.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
