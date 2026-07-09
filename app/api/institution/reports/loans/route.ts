import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import {
  buildLoanReportWhere,
  enrichLoanReportRows,
  fetchLoanReportAggregates,
  fetchLoanReportCurrency,
  type LoanReportFilters,
} from "@/lib/reports/loan-report"

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 5000
const MAX_EXPORT_PAGE_SIZE = 5000

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const auth = await requireStaffSession()
    if (!auth.ok) {
      apiLog("warn", "loan_reports.denied", { method: "GET", apiPath, status: auth.status, error: auth.error })
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(req.url)
    const exportAll = url.searchParams.get("export_all") === "true"
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const rawPageSize = parseInt(url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10)
    const pageSize = exportAll
      ? MAX_EXPORT_PAGE_SIZE
      : Math.min(Math.max(Number.isFinite(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const offset = exportAll ? 0 : (page - 1) * pageSize

    const productIdRaw = (url.searchParams.get("product_id") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()

    const filters: LoanReportFilters = {
      status: (url.searchParams.get("status") || "").trim() || undefined,
      loanType: (url.searchParams.get("loan_type") || "").trim().toLowerCase() || undefined,
      productIds: productIdRaw ? productIdRaw.split(",").map((v) => v.trim()).filter(Boolean) : [],
      selectedBranchIds: branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : [],
      applicationDateStart: (url.searchParams.get("applicationDateStart") || "").trim() || undefined,
      applicationDateEnd: (url.searchParams.get("applicationDateEnd") || "").trim() || undefined,
      reviewedDateStart: (url.searchParams.get("reviewedDateStart") || "").trim() || undefined,
      reviewedDateEnd: (url.searchParams.get("reviewedDateEnd") || "").trim() || undefined,
      approvedDateStart: (url.searchParams.get("approvedDateStart") || "").trim() || undefined,
      approvedDateEnd: (url.searchParams.get("approvedDateEnd") || "").trim() || undefined,
      disbursedDateStart: (url.searchParams.get("disbursedDateStart") || "").trim() || undefined,
      disbursedDateEnd: (url.searchParams.get("disbursedDateEnd") || "").trim() || undefined,
      search: (url.searchParams.get("search") || "").trim() || undefined,
      overdueOnly: url.searchParams.get("overdue_only") === "true",
    }

    const result = await runWithAuth(auth.authUserId, async (client) => {
      const actor = await resolveActorContext(client, auth.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, params, nextIndex } = buildLoanReportWhere(actor, filters)
      const currency = await fetchLoanReportCurrency(client, actor)

      const [countRes, aggregates] = await Promise.all([
        client.query(`SELECT COUNT(*)::int AS total FROM loans l WHERE ${where}`, params),
        fetchLoanReportAggregates(client, where, params),
      ])

      const total = Number(countRes.rows[0]?.total ?? 0)

      const listParams = [...params]
      let listIdx = nextIndex
      listParams.push(pageSize)
      const limitParam = listIdx++
      listParams.push(offset)
      const offsetParam = listIdx++

      const dataRes = await client.query(
        `SELECT
           l.id,
           l.application_id,
           l.member_id,
           l.loan_product_id,
           l.created_by,
           l.approved_by,
           l.principal_amount,
           l.interest_rate,
           l.tenure_months,
           l.outstanding_balance,
           l.status,
           l.loan_type,
           l.application_date,
           l.reviewed_at,
           l.approved_at,
           l.next_payment_date,
           l.disbursement_date,
           l.reviewed_by
         FROM loans l
         WHERE ${where}
         ORDER BY l.application_date DESC NULLS LAST, l.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        listParams,
      )

      const items = await enrichLoanReportRows(client, dataRes.rows)

      return {
        total,
        page: exportAll ? 1 : page,
        pageSize,
        currency,
        items,
        summary: aggregates.summary,
        breakdown: aggregates.breakdown,
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_loans"
          ? 403
          : result.error === "user_not_linked"
            ? 403
            : result.error === "actor_branch_missing"
              ? 400
              : 400
      apiLog("warn", "loan_reports.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "loan_reports.success", {
      method: "GET",
      apiPath,
      status: 200,
      count: result.items.length,
      total: result.total,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loan_reports.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
