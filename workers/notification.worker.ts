import { Worker, type Job } from "bullmq"
import { Pool } from "pg"
import { createConnection } from "../lib/queue/redis"
import {
  NOTIFICATION_QUEUE_NAME,
  scheduleDailyNotificationCleanup,
  type NotificationJobData,
  type NotificationJobName,
} from "../queues/notification.queue"

async function deleteExpiredNotifications(): Promise<number> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const pool = new Pool({ connectionString: url })
  try {
    const res = await pool.query(
      `DELETE FROM notifications WHERE expires_at < NOW() RETURNING id`
    )
    return res.rowCount ?? 0
  } finally {
    await pool.end()
  }
}

export function startNotificationWorker() {
  const worker = new Worker<NotificationJobData, unknown, NotificationJobName>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData, unknown, NotificationJobName>) => {
      console.log(`[notification.worker] job=${job.id} kind=${job.data.kind}`)
      switch (job.data.kind) {
        case "cleanup-expired": {
          const removed = await deleteExpiredNotifications()
          console.log(`[notification.worker] cleanup-expired removed=${removed}`)
          return { removed }
        }
        default: {
          const _exhaustive: never = job.data.kind
          throw new Error(`unhandled notification job kind: ${String(_exhaustive)}`)
        }
      }
    },
    {
      connection: createConnection("notification-worker"),
      concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 1),
    }
  )

  worker.on("completed", (job) => {
    console.log(`[notification.worker] completed ${job.id}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[notification.worker] failed ${job?.id ?? "?"}: ${err.message}`)
  })
  worker.on("error", (err) => {
    console.error(`[notification.worker] error: ${err.message}`)
  })

  scheduleDailyNotificationCleanup()
    .then(() => {
      console.log(`[notification.worker] daily cleanup scheduler upserted`)
    })
    .catch((err) => {
      console.error(`[notification.worker] failed to schedule cleanup: ${err?.message ?? err}`)
    })

  return worker
}
