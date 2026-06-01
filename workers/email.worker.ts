import { Worker, type Job } from "bullmq"
import { createConnection } from "../lib/queue/redis"
import {
  EMAIL_QUEUE_NAME,
  type EmailJobData,
  type EmailJobName,
} from "../queues/email.queue"

export function startEmailWorker() {
  const worker = new Worker<EmailJobData, unknown, EmailJobName>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData, unknown, EmailJobName>) => {
      console.log(
        `[email.worker] job=${job.id} to=${job.data.to} subject="${job.data.subject}"`,
      )
      // TODO: wire to mail provider. Codebase already has Mailgun usage in
      // `lib/send-contact-email.ts`; extract a shared sender and call it here.
      return { ok: true }
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
