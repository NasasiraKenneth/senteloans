import { getReportQueue } from "@/queues/report.queue"
import type { ReportJobData } from "@/queues/report.queue"

export type ReportJobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "unknown"

export type ReportJobView = {
  id: string
  status: ReportJobStatus
  kind: ReportJobData["kind"]
  format: ReportJobData["format"]
  result?: unknown
  failedReason?: string | null
  progress?: number
}

export async function getReportJob(jobId: string) {
  return getReportQueue().getJob(jobId)
}

export async function getReportJobView(jobId: string): Promise<ReportJobView | null> {
  const job = await getReportJob(jobId)
  if (!job) return null
  const state = (await job.getState()) as ReportJobStatus
  return {
    id: String(job.id),
    status: state || "unknown",
    kind: job.data.kind,
    format: job.data.format,
    result: job.returnvalue,
    failedReason: job.failedReason,
    progress: typeof job.progress === "number" ? job.progress : undefined,
  }
}

export function assertReportJobAccess(
  jobData: ReportJobData,
  authUserId: string,
  institutionId: string,
): void {
  if (jobData.actorId !== authUserId) {
    throw new Error("forbidden_job_access")
  }
  if (jobData.institutionId !== institutionId) {
    throw new Error("forbidden_job_access")
  }
}
