import { Queue, type JobsOptions } from "bullmq"
import { getSharedConnection } from "../lib/queue/redis"

export const INVESTMENT_QUEUE_NAME = "investment"

export type InvestmentJobName =
  | "post-monthly-report"
  | "recompute-current-value"
  | "send-status-notification"

export type InvestmentJobData =
  | {
      kind: "post-monthly-report"
      institutionId: string
      actorId: string
      investmentId: string
      reportId: string
    }
  | {
      kind: "recompute-current-value"
      institutionId: string
      investmentId: string
    }
  | {
      kind: "send-status-notification"
      institutionId: string
      investmentId: string
      previousStatus: string
      nextStatus: string
    }

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600 },
}

let queue: Queue<InvestmentJobData, unknown, InvestmentJobName> | null = null

export function getInvestmentQueue(): Queue<
  InvestmentJobData,
  unknown,
  InvestmentJobName
> {
  if (!queue) {
    queue = new Queue<InvestmentJobData, unknown, InvestmentJobName>(
      INVESTMENT_QUEUE_NAME,
      {
        connection: getSharedConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      },
    )
  }
  return queue
}

export async function enqueueInvestmentJob(
  data: InvestmentJobData,
  opts?: JobsOptions,
) {
  return getInvestmentQueue().add(data.kind, data, opts)
}
