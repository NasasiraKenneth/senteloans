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

const MIGRATIONS_DIR = path.join(__dirname)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{2}-.*\.sql$/.test(f))
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

  await pool.end()
  console.log("Migrations complete.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
