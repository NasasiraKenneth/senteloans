import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import type { PoolClient } from "pg"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  type ActorContext,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  scopeWhere,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { auditLogger } from "@/lib/audit/audit-logger"

const VALID_STATUSES = ["Active", "Inactive", "Suspended", "Closed"] as const

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const url = new URL(req.url)
    const statusParam = (url.searchParams.get("status") || "").trim()
    const branchIdParam = (url.searchParams.get("branch_id") || "").trim()
    const searchParam = (url.searchParams.get("search") || "").trim()

    const autoBillParam = (
      url.searchParams.get("auto_bill_savings") ||
      url.searchParams.get("autoBillSavings") ||
      ""
    ).trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const allowed =
        (await hasPermission(client, actor, "view_savings")) ||
        (await hasPermission(client, actor, "add_account")) ||
        (await hasPermission(client, actor, "view_account")) ||
        (await hasPermission(client, actor, "register_member")) ||
        isSuperAdmin(actor)

      if (!allowed) return { error: "missing_permission:view_savings" as const }

      let where = "at.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (isSuperAdmin(actor)) {
        if (branchIdParam) {
          where += ` AND at.branch_id = $${idx++}`
          params.push(branchIdParam)
        }
      } else {
        if (!actor.branch_id) return { error: "actor_branch_missing" as const }
        where += ` AND at.branch_id = $${idx++}`
        params.push(actor.branch_id)
      }

      if (statusParam && statusParam !== "all") {
        where += ` AND at.status = $${idx++}`
        params.push(statusParam)
      }

      if (autoBillParam && autoBillParam !== "all") {
        where += ` AND at.auto_bill_savings = $${idx++}`
        params.push(autoBillParam)
      }

      if (searchParam) {
        where += ` AND at.account_name ILIKE $${idx++}`
        params.push(`%${searchParam}%`)
      }

      const res = await client.query(
        `SELECT
           at.id,
           at.institution_id,
           at.branch_id,
           at.account_name,
           at.status,
           at.auto_bill_savings,
           at.created_at,
           at.updated_at,
           b.name AS branch_name,
           COUNT(sa.id)::int AS accounts_count
         FROM account_type at
         LEFT JOIN branches b ON b.id = at.branch_id
         LEFT JOIN savings_accounts sa ON sa.account_type_id = at.id
         WHERE ${where}
         GROUP BY at.id, at.institution_id, at.branch_id, at.account_name, at.status, at.auto_bill_savings, at.created_at, at.updated_at, b.name
         ORDER BY at.account_name ASC`,
        params
      )

      return { accountTypes: res.rows }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_savings" || result.error === "no_app_user_profile"
          ? 403
          : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "account_types.list.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const accountName = String(body.account_name || body.name || "").trim()
    const status = String(body.status || "Active").trim()
    const autoBillSavings = String(body.auto_bill_savings || "false").trim() === "true" ? "true" : "false"
    const requestedBranchId = String(body.branch_id || "").trim()

    if (!accountName) {
      return NextResponse.json({ error: "account_name_required" }, { status: 400 })
    }
    if (accountName.length > 50) {
      return NextResponse.json({ error: "account_name_too_long" }, { status: 400 })
    }
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const allowed =
        (await hasPermission(client, actor, "add_account")) ||
        (await hasPermission(client, actor, "edit_account")) ||
        isSuperAdmin(actor)

      if (!allowed) return { error: "missing_permission:add_account" as const }

      const targetBranchId = isSuperAdmin(actor)
        ? requestedBranchId || String(actor.branch_id || "")
        : String(actor.branch_id || "")

      if (!targetBranchId) return { error: "branch_id_required" as const }

      const branchCheck = await assertBranchActive(client, targetBranchId)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }
      if (branchCheck.branch.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_operation_forbidden" as const }
      }

      // Check unique constraint on (branch_id, account_name)
      const existing = await client.query(
        `SELECT id, status FROM account_type WHERE branch_id = $1 AND LOWER(account_name) = LOWER($2) LIMIT 1`,
        [targetBranchId, accountName]
      )
      if (existing.rows.length > 0) {
        return { error: "duplicate_account_type_name" as const }
      }

      const insRes = await client.query(
        `INSERT INTO account_type (institution_id, branch_id, account_name, status, auto_bill_savings)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, institution_id, branch_id, account_name, status, auto_bill_savings, created_at, updated_at`,
        [actor.institution_id, targetBranchId, accountName, status, autoBillSavings]
      )
      const created = insRes.rows[0]

      await auditLogger.logInsert(
        "account_type",
        created.id,
        {
          account_name: accountName,
          status,
          auto_bill_savings: autoBillSavings,
          branch_id: targetBranchId,
        },
        actor.institution_id,
        actor.id,
        { branch_id: targetBranchId },
        client
      )

      return { ok: true, accountType: created }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:add_account" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "duplicate_account_type_name"
          ? 409
          : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "account_types.create.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
