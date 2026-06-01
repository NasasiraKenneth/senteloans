import { Queue, type JobsOptions } from "bullmq"
import { getSharedConnection } from "../lib/queue/redis"

export const NOTIFICATION_QUEUE_NAME = "notification"

export type NotificationJobName = "cleanup-expired"

export type NotificationJobData = {
  kind: "cleanup-expired"
  /** Override the default 7-day grace period in days (optional). */
  graceDays?: number
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 30 },
  removeOnFail: { age: 14 * 24 * 3600 },
}

let queue: Queue<NotificationJobData, unknown, NotificationJobName> | null = null

export function getNotificationQueue(): Queue<
  NotificationJobData,
  unknown,
  NotificationJobName
> {
  if (!queue) {
    queue = new Queue<NotificationJobData, unknown, NotificationJobName>(
      NOTIFICATION_QUEUE_NAME,
      {
        connection: getSharedConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }
    )
  }
  return queue
}

export async function enqueueNotificationJob(
  data: NotificationJobData,
  opts?: JobsOptions
) {
  return getNotificationQueue().add(data.kind, data, opts)
}

/**
 * Schedule the daily cleanup repeatable job. Idempotent — calling multiple
 * times reuses the same scheduler key. Default pattern: 03:15 UTC every day.
 *
 * The scheduler key must match the job name in BullMQ's generic typing, so we
 * use "cleanup-expired" both as the scheduler key and the produced job's name.
 */
export async function scheduleDailyNotificationCleanup(
  cron: string = process.env.NOTIFICATION_CLEANUP_CRON || "15 3 * * *"
) {
  const q = getNotificationQueue()
  return q.upsertJobScheduler(
    "cleanup-expired",
    { pattern: cron },
    {
      name: "cleanup-expired",
      data: { kind: "cleanup-expired" },
      opts: DEFAULT_JOB_OPTIONS,
    }
  )
}
