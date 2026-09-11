import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertActorActive } from "@/lib/staff/staff-status"
import { auditLogger } from "@/lib/audit/audit-logger"

const VALID_STATUSES = ["Active", "Inactive", "Suspended", "Closed"] as const

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

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
           b.name AS branch_name
         FROM account_type at
         LEFT JOIN branches b ON b.id = at.branch_id
         WHERE at.id = $1 AND at.institution_id = $2
         LIMIT 1`,
        [id, actor.institution_id]
      )
      const row = res.rows[0]
      if (!row) return { error: "account_type_not_found" as const }
      return { accountType: row }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "account_type_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "account_type.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const accountName = body.account_name != null ? String(body.account_name).trim() : undefined
    const status = body.status != null ? String(body.status).trim() : undefined
    const autoBillSavings = body.auto_bill_savings != null ? (String(body.auto_bill_savings).trim() === "true" ? "true" : "false") : undefined

    if (accountName !== undefined && !accountName) {
      return NextResponse.json({ error: "account_name_cannot_be_empty" }, { status: 400 })
    }
    if (accountName && accountName.length > 50) {
      return NextResponse.json({ error: "account_name_too_long" }, { status: 400 })
    }
    if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) return { error: staffCheck.error }

      const allowed =
        (await hasPermission(client, actor, "edit_account")) ||
        (await hasPermission(client, actor, "add_account")) ||
        isSuperAdmin(actor)
      if (!allowed) return { error: "missing_permission:edit_account" as const }

      const curRes = await client.query(
        `SELECT id, institution_id, branch_id, account_name, status, auto_bill_savings FROM account_type WHERE id = $1 AND institution_id = $2`,
        [id, actor.institution_id]
      )
      const current = curRes.rows[0]
      if (!current) return { error: "account_type_not_found" as const }

      if (!isSuperAdmin(actor) && current.branch_id !== actor.branch_id) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      if (accountName && accountName.toLowerCase() !== current.account_name.toLowerCase()) {
        const dupRes = await client.query(
          `SELECT 1 FROM account_type WHERE branch_id = $1 AND LOWER(account_name) = LOWER($2) AND id <> $3`,
          [current.branch_id, accountName, id]
        )
        if (dupRes.rows.length > 0) {
          return { error: "duplicate_account_type_name" as const }
        }
      }

      const updRes = await client.query(
        `UPDATE account_type
         SET account_name = COALESCE($1, account_name),
             status = COALESCE($2, status),
             auto_bill_savings = COALESCE($3, auto_bill_savings),
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, institution_id, branch_id, account_name, status, auto_bill_savings, created_at, updated_at`,
        [accountName || null, status || null, autoBillSavings || null, id]
      )
      const updated = updRes.rows[0]

      await auditLogger.logUpdate(
        "account_type",
        id,
        { account_name: current.account_name, status: current.status, auto_bill_savings: current.auto_bill_savings },
        { account_name: updated.account_name, status: updated.status, auto_bill_savings: updated.auto_bill_savings },
        actor.institution_id,
        actor.id,
        { branch_id: current.branch_id },
        client
      )

      return { ok: true, accountType: updated }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "account_type_not_found"
          ? 404
          : result.error === "duplicate_account_type_name"
          ? 409
          : result.error === "missing_permission:edit_account"
          ? 403
          : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "account_type.update.error", { method: "PUT", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
