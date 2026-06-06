/**
 * Test PostgreSQL connection and basic operations.
 * Usage: DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/06-test-database-connection.ts
 */

import { Pool } from "pg"

const url = process.env.DATABASE_URL

async function testDatabaseConnection() {
  if (!url) {
    console.error("DATABASE_URL is not set")
    return false
  }

  const pool = new Pool({ connectionString: url })

  try {
    console.log("Starting database connection tests...")

    console.log("\n=== Test 1: Basic Connection ===")
    const countRes = await pool.query("SELECT 1 AS ok")
    if (countRes.rows[0]?.ok !== 1) {
      console.log("FAILED: Basic query failed")
      return false
    }
    console.log("PASSED: Database connection successful")

    console.log("\n=== Test 2: Schema Validation ===")
    const tables = [
      "institutions",
      "users",
      "members",
      "loans",
      "transactions",
      "notifications",
      "audit_logs",
      "app_auth_users",
    ]
    for (const table of tables) {
      const res = await pool.query(`SELECT 1 FROM ${table} LIMIT 1`).catch(() => null)
      if (!res) {
        console.log(`FAILED: Table ${table} does not exist or is not accessible`)
        return false
      }
      console.log(`PASSED: Table ${table} exists`)
    }

    console.log("\n✅ All database connection tests completed successfully!")
    return true
  } catch (error) {
    console.error("FAILED: Unexpected error:", error)
    return false
  } finally {
    await pool.end()
  }
}

testDatabaseConnection()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
