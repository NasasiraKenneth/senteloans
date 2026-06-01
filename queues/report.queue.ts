import { Queue, type JobsOptions } from "bullmq"
import { getSharedConnection } from "../lib/queue/redis"

export const REPORT_QUEUE_NAME = "report"

export type ReportJobName = "investment-reports-export" | "investments-export"

export type ReportJobData = {
  kind: ReportJobName
  format: "excel" | "pdf"
  institutionId: string
  actorId: string
  /** Mirrors the GET query string used by the synchronous export endpoints. */
  filters: Record<string, string>
  /** Optional: where the worker should drop the generated artifact. */
  delivery?:
    | { type: "email"; to: string }
    | { type: "url"; expiresInSec?: number }
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { age: 6 * 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600 },
}

let queue: Queue<ReportJobData, unknown, ReportJobName> | null = null

export function getReportQueue(): Queue<ReportJobData, unknown, ReportJobName> {
  if (!queue) {
    queue = new Queue<ReportJobData, unknown, ReportJobName>(REPORT_QUEUE_NAME, {
      connection: getSharedConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return queue
}

export async function enqueueReport(
  data: ReportJobData,
  opts?: JobsOptions,
) {
  return getReportQueue().add(data.kind, data, opts)
}
