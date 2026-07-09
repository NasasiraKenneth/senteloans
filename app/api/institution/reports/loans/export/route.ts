import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { parseLoanReportFilters } from "@/lib/reports/loan-report-export"
import { enqueueReport } from "@/queues/report.queue"

const EXPORT_FILTER_KEYS = new Set([
  "status",
  "loan_type",
  "product_id",
  "branches",
  "applicationDateStart",
  "applicationDateEnd",
  "reviewedDateStart",
  "reviewedDateEnd",
  "approvedDateStart",
  "approvedDateEnd",
  "disbursedDateStart",
  "disbursedDateEnd",
  "search",
  "overdue_only",
])

function filtersFromUrl(url: URL): Record<string, string> {
  const filters: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "format" || key === "jobId") continue
    if (!EXPORT_FILTER_KEYS.has(key)) continue
    const trimmed = value.trim()
    if (trimmed) filters[key] = trimmed
  }
  return filters
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const auth = await requireStaffSession()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    if (format !== "excel" && format !== "pdf") {
      return NextResponse.json({ error: "invalid_format" }, { status: 400 })
    }

    const filters = filtersFromUrl(url)
    parseLoanReportFilters(filters)

    const actorResult = await runWithAuth(auth.authUserId, async (client) => {
      const actor = await resolveActorContext(client, auth.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }
      return { institutionId: actor.institution_id }
    })

    if (actorResult && "error" in actorResult) {
      const statusCode =
        actorResult.error === "missing_permission:view_loans" || actorResult.error === "user_not_linked"
          ? 403
          : 400
      return NextResponse.json({ error: actorResult.error }, { status: statusCode })
    }

    const job = await enqueueReport({
      kind: "loan-reports-export",
      format,
      institutionId: actorResult.institutionId,
      actorId: auth.authUserId,
      filters,
      delivery: { type: "url", expiresInSec: 6 * 3600 },
    })

    apiLog("info", "loan_reports.export.queued", {
      method: "GET",
      apiPath,
      status: 202,
      jobId: job.id,
      format,
    })

    return NextResponse.json(
      {
        jobId: String(job.id),
        status: "queued",
        pollUrl: `/api/institution/reports/jobs/${job.id}`,
        downloadUrl: `/api/institution/reports/jobs/${job.id}?download=true`,
      },
      { status: 202 },
    )
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loan_reports.export.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
