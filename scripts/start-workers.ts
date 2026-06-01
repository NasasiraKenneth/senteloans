/**
 * Boots all BullMQ workers in a single Node process.
 * Usage: `npm run workers` (loads .env then .env.local from project root).
 * Requires: REDIS_URL in env (defaults to redis://127.0.0.1:6379).
 */

import * as path from "path"
import { config } from "dotenv"

config({ path: path.join(__dirname, "..", ".env") })
config({ path: path.join(__dirname, "..", ".env.local") })

import { startEmailWorker } from "../workers/email.worker"
import { startReportWorker } from "../workers/report.worker"
import { startInvestmentWorker } from "../workers/investment.worker"
import { startNotificationWorker } from "../workers/notification.worker"
import { closeSharedConnection, REDIS_URL } from "../lib/queue/redis"

function maskUrl(url: string): string {
  return url.replace(/(redis(?:s)?:\/\/[^@/]*:)([^@]+)(@)/i, "$1***$3")
}

console.log(`[start-workers] redis=${maskUrl(REDIS_URL)}`)

const workers = [
  startEmailWorker(),
  startReportWorker(),
  startInvestmentWorker(),
  startNotificationWorker(),
]

console.log(`[start-workers] ${workers.length} workers running (pid=${process.pid})`)

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[start-workers] ${signal} received, closing workers...`)
  await Promise.all(
    workers.map((w) =>
      w.close().catch((err) => console.error(`[start-workers] close error: ${err?.message ?? err}`)),
    ),
  )
  await closeSharedConnection().catch(() => undefined)
  console.log(`[start-workers] all workers closed; exiting`)
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

process.on("unhandledRejection", (reason) => {
  console.error(`[start-workers] unhandledRejection:`, reason)
})
process.on("uncaughtException", (err) => {
  console.error(`[start-workers] uncaughtException:`, err)
})
