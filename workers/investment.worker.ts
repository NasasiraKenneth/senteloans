import { Worker, type Job } from "bullmq"
import { createConnection } from "../lib/queue/redis"
import {
  INVESTMENT_QUEUE_NAME,
  type InvestmentJobData,
  type InvestmentJobName,
} from "../queues/investment.queue"

export function startInvestmentWorker() {
  const worker = new Worker<InvestmentJobData, unknown, InvestmentJobName>(
    INVESTMENT_QUEUE_NAME,
    async (job: Job<InvestmentJobData, unknown, InvestmentJobName>) => {
      console.log(
        `[investment.worker] job=${job.id} kind=${job.data.kind} investmentId=${(job.data as { investmentId?: string }).investmentId ?? "?"}`,
      )
      switch (job.data.kind) {
        case "post-monthly-report":
          // TODO: send notifications, refresh caches, fan out side-effects
          return { ok: true }
        case "recompute-current-value":
          // TODO: re-derive senteloans_investments.current_value from valuations
          return { ok: true }
        case "send-status-notification":
          // TODO: enqueue email(s) via getEmailQueue()
          return { ok: true }
        default: {
          const _exhaustive: never = job.data
          throw new Error(`unhandled investment job kind: ${JSON.stringify(_exhaustive)}`)
        }
      }
    },
    {
      connection: createConnection("investment-worker"),
      concurrency: Number(process.env.INVESTMENT_WORKER_CONCURRENCY || 5),
    },
  )

  worker.on("completed", (job) => {
    console.log(`[investment.worker] completed ${job.id}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[investment.worker] failed ${job?.id ?? "?"}: ${err.message}`)
  })
  worker.on("error", (err) => {
    console.error(`[investment.worker] error: ${err.message}`)
  })

  return worker
}
