import { Worker, type Job } from "bullmq"
import { createConnection } from "../lib/queue/redis"
import {
  EMAIL_QUEUE_NAME,
  type EmailJobData,
  type EmailJobName,
} from "../queues/email.queue"
import { sendTransactionalEmail } from "../lib/email/sender"

export function startEmailWorker() {
  const worker = new Worker<EmailJobData, unknown, EmailJobName>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData, unknown, EmailJobName>) => {
      const result = await sendTransactionalEmail(job.data)
      if (!result.ok && result.skipped) {
        console.warn(
          `[email.worker] skipped job=${job.id} to=${job.data.to} reason=${result.error}`,
        )
        return { skipped: true, reason: result.error }
      }
      if (!result.ok) {
        throw new Error(result.error)
      }
      console.log(
        `[email.worker] sent job=${job.id} to=${job.data.to} provider=${result.provider}`,
      )
      return result
    },
    {
      connection: createConnection("email-worker"),
      concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY || 5),
    },
  )

  worker.on("completed", (job) => {
    console.log(`[email.worker] completed ${job.id}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[email.worker] failed ${job?.id ?? "?"}: ${err.message}`)
  })
  worker.on("error", (err) => {
    console.error(`[email.worker] error: ${err.message}`)
  })

  return worker
}
