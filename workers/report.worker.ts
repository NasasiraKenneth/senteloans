import { Worker, type Job } from "bullmq"
import { createConnection } from "../lib/queue/redis"
import { storeReportArtifact } from "../lib/queue/report-artifacts"
import { generateLoanReportExport } from "../lib/reports/loan-report-export"
import {
  REPORT_QUEUE_NAME,
  type ReportJobData,
  type ReportJobName,
} from "../queues/report.queue"

async function processReportJob(job: Job<ReportJobData, unknown, ReportJobName>) {
  switch (job.data.kind) {
    case "loan-reports-export": {
      const result = await generateLoanReportExport({
        authUserId: job.data.actorId,
        format: job.data.format,
        filters: job.data.filters,
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      const expiresInSec = job.data.delivery?.type === "url" ? job.data.delivery.expiresInSec : undefined
      await storeReportArtifact(
        String(job.id),
        result.buffer,
        {
          contentType: result.contentType,
          filename: result.filename,
          institutionId: job.data.institutionId,
          authUserId: job.data.actorId,
          rowCount: result.rowCount,
        },
        expiresInSec,
      )
      return {
        ok: true,
        kind: job.data.kind,
        format: job.data.format,
        filename: result.filename,
        rowCount: result.rowCount,
      }
    }
    case "investment-reports-export":
    case "investments-export":
      // TODO: move matching export routes into shared lib functions.
      return { ok: true, kind: job.data.kind, format: job.data.format }
    default: {
      const _exhaustive: never = job.data.kind
      throw new Error(`unhandled report job kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function startReportWorker() {
  const worker = new Worker<ReportJobData, unknown, ReportJobName>(
    REPORT_QUEUE_NAME,
    async (job: Job<ReportJobData, unknown, ReportJobName>) => {
      console.log(
        `[report.worker] job=${job.id} kind=${job.data.kind} format=${job.data.format} institutionId=${job.data.institutionId}`,
      )
      return processReportJob(job)
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
