import { Worker, type Job } from "bullmq"
import { createConnection } from "../lib/queue/redis"
import {
  REPORT_QUEUE_NAME,
  type ReportJobData,
  type ReportJobName,
} from "../queues/report.queue"

export function startReportWorker() {
  const worker = new Worker<ReportJobData, unknown, ReportJobName>(
    REPORT_QUEUE_NAME,
    async (job: Job<ReportJobData, unknown, ReportJobName>) => {
      console.log(
        `[report.worker] job=${job.id} kind=${job.data.kind} format=${job.data.format} institutionId=${job.data.institutionId}`,
      )
      // TODO: move the body of the matching export route into a shared
      // function (e.g. `lib/exports/investment-reports.ts`) and call it here.
      // For now just acknowledge the job so the queue plumbing is testable.
      return { ok: true, kind: job.data.kind, format: job.data.format }
    },
    {
      connection: createConnection("report-worker"),
      concurrency: Number(process.env.REPORT_WORKER_CONCURRENCY || 2),
    },
  )

  worker.on("completed", (job) => {
    console.log(`[report.worker] completed ${job.id}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[report.worker] failed ${job?.id ?? "?"}: ${err.message}`)
  })
  worker.on("error", (err) => {
    console.error(`[report.worker] error: ${err.message}`)
  })

  return worker
}
