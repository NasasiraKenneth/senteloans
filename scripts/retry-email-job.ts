/**
 * Re-queue a failed BullMQ email job by id.
 *
 * Usage:
 *   npm run email:retry -- 12
 *   npm run email:retry -- 12 15 20
 */
import { Queue } from "bullmq"
import { EMAIL_QUEUE_NAME } from "../queues/email.queue"
import { closeSharedConnection, getSharedConnection } from "../lib/queue/redis"

async function main() {
  const ids = process.argv.slice(2).map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    console.error("Usage: npm run email:retry -- <jobId> [jobId...]")
    process.exit(1)
  }

  const queue = new Queue(EMAIL_QUEUE_NAME, { connection: getSharedConnection() })

  try {
    for (const id of ids) {
      const job = await queue.getJob(id)
      if (!job) {
        console.error(`Job ${id} not found`)
        continue
      }
      await job.retry()
      console.log(`Job ${id} re-queued`)
    }
  } finally {
    await queue.close()
    await closeSharedConnection()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
