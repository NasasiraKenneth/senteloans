import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import {
  getReportArtifactBuffer,
  getReportArtifactMeta,
} from "@/lib/queue/report-artifacts"
import {
  assertReportJobAccess,
  getReportJob,
  getReportJobView,
} from "@/lib/reports/report-jobs"

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteParams) {
  const apiPath = getApiPath(req)
  const { id: jobId } = await params

  try {
    const auth = await requireStaffSession()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const job = await getReportJob(jobId)
    if (!job) {
      return NextResponse.json({ error: "job_not_found" }, { status: 404 })
    }

    const actorResult = await runWithAuth(auth.authUserId, async (client) => {
      const actor = await resolveActorContext(client, auth.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      return { institutionId: actor.institution_id }
    })

    if (actorResult && "error" in actorResult) {
      return NextResponse.json({ error: actorResult.error }, { status: 403 })
    }

    try {
      assertReportJobAccess(job.data, auth.authUserId, actorResult.institutionId)
    } catch {
      return NextResponse.json({ error: "forbidden_job_access" }, { status: 403 })
    }

    const url = new URL(req.url)
    const download = url.searchParams.get("download") === "true"
    const view = await getReportJobView(jobId)
    if (!view) {
      return NextResponse.json({ error: "job_not_found" }, { status: 404 })
    }

    if (download) {
      if (view.status !== "completed") {
        return NextResponse.json(
          { error: "job_not_ready", status: view.status },
          { status: 409 },
        )
      }
      const meta = await getReportArtifactMeta(jobId)
      const buffer = await getReportArtifactBuffer(jobId)
      if (!meta || !buffer) {
        return NextResponse.json({ error: "artifact_not_found" }, { status: 404 })
      }
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": meta.contentType,
          "Content-Disposition": `attachment; filename="${meta.filename}"`,
        },
      })
    }

    const meta = view.status === "completed" ? await getReportArtifactMeta(jobId) : null
    return NextResponse.json({
      ...view,
      rowCount: meta?.rowCount ?? (view.result as { rowCount?: number } | undefined)?.rowCount,
      filename: meta?.filename ?? (view.result as { filename?: string } | undefined)?.filename,
      downloadUrl:
        view.status === "completed"
          ? `/api/institution/reports/jobs/${jobId}?download=true`
          : null,
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "report_jobs.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
      jobId,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
