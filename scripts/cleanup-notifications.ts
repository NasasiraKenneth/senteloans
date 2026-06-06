/**
 * One-shot CLI to delete expired notifications (rows where expires_at < NOW()).
 * Use either:
 *   - Run the workers daemon (`npm run workers`), which schedules a daily job.
 *   - Or run this script from cron: `npm run notifications:cleanup`.
 *
 * Uses pg directly so ts-node does not need Next.js `@/` path aliases.
 */

import * as path from "path"
import { config } from "dotenv"
import { Pool } from "pg"

config({ path: path.join(__dirname, "..", ".env") })
config({ path: path.join(__dirname, "..", ".env.local") })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("[notifications:cleanup] DATABASE_URL is not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const start = Date.now()

  try {
    const res = await pool.query(
      `DELETE FROM notifications WHERE expires_at < NOW() RETURNING id`
    )
    const count = res.rowCount ?? 0
    const elapsed = Date.now() - start
    console.log(`[notifications:cleanup] removed=${count} elapsed=${elapsed}ms`)
  } catch (e: unknown) {
    const err = e as Error & { code?: string }
    if (err.code === "42P01") {
      console.error(
        "[notifications:cleanup] table notifications does not exist. Run:\n" +
          '  npm run db:migrate  (notifications tables are in scripts/01-create-schema.sql)'
      )
    } else {
      console.error(`[notifications:cleanup] failed: ${err.message}`)
    }
    process.exit(1)
  } finally {
    await pool.end()
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("[notifications:cleanup] uncaught:", err)
  process.exit(1)
})
