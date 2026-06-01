import { Queue, type JobsOptions } from "bullmq"
import { getSharedConnection } from "../lib/queue/redis"

export const EMAIL_QUEUE_NAME = "email"

export type EmailJobName = "send"

export type EmailJobData = {
  to: string
  subject: string
  /** template id or inline html. Worker decides based on `kind`. */
  template: string
  kind?: "template" | "html"
  data?: Record<string, unknown>
  /** optional context for audit/correlation */
  context?: { institutionId?: string; actorId?: string }
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
}

let queue: Queue<EmailJobData, unknown, EmailJobName> | null = null

export function getEmailQueue(): Queue<EmailJobData, unknown, EmailJobName> {
  if (!queue) {
    queue = new Queue<EmailJobData, unknown, EmailJobName>(EMAIL_QUEUE_NAME, {
      connection: getSharedConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return queue
}

export async function enqueueEmail(data: EmailJobData, opts?: JobsOptions) {
  return getEmailQueue().add("send", data, opts)
}
