import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { notifyThirdPartyAgentCreated } from "@/lib/notifications/third-party-agent-events"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") || "").trim()
    const status = (searchParams.get("status") || "").trim()
    const branchesRaw = (searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const pageRaw = parseInt(searchParams.get("page") || "0", 10)
    const rowsPerPageRaw = parseInt(searchParams.get("rowsPerPage") || searchParams.get("limit") || "50", 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0
    const rowsPerPage = Math.min(Math.max(Number.isFinite(rowsPerPageRaw) ? rowsPerPageRaw : 50, 1), 200)
    const offset = page * rowsPerPage

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_third_party_agents")
      if (!allowed) return { error: "missing_permission:view_third_party_agents" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "c.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (!isSuperAdmin(actor)) {
        where += ` AND c.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      }
      if (search) {
        where += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (status) {
        where += ` AND c.status = $${idx}`
        params.push(status)
        idx++
      }
      if (selectedBranchIds.length > 0 && isSuperAdmin(actor)) {
        where += ` AND c.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }

      const summaryRes = await client.query<{
        total: number
        active: number
        inactive_suspended: number
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE c.status = 'Active')::int AS active,
           COUNT(*) FILTER (WHERE c.status <> 'Active')::int AS inactive_suspended
         FROM third_party_agents c
         WHERE ${where}`,
        params,
      )
      const summary = summaryRes.rows[0] || { total: 0, active: 0, inactive_suspended: 0 }

      params.push(rowsPerPage, offset)
      const limitIdx = idx
      const offsetIdx = idx + 1
      const listRes = await client.query(
        `SELECT
           c.id,
           c.institution_id,
           c.branch_id,
           b.name AS branch_name,
           c.name,
           c.status,
           c.email,
           c.address,
           c.phone,
           c.created_by,
           c.created_at,
           c.modified_by,
           c.updated_at,
           cu.full_name AS created_by_name,
           mu.full_name AS modified_by_name
         FROM third_party_agents c
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN users cu ON cu.id = c.created_by
         LEFT JOIN users mu ON mu.id = c.modified_by
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params,
      )
      return {
        third_party_agents: listRes.rows,
        pagination: {
          page,
          rowsPerPage,
          total: summary.total,
        },
        summary: {
          total: summary.total,
          active: summary.active,
          inactive_suspended: summary.inactive_suspended,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "third_party_agents.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    apiLog("info", "third_party_agents.list.success", {
      method: "GET",
      apiPath,
      status: 200,
      count: result?.third_party_agents?.length || 0,
      total: result?.pagination?.total || 0,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json({
      third_party_agents: result?.third_party_agents || [],
      pagination: result?.pagination || { page: 0, rowsPerPage, total: 0 },
      summary: result?.summary || { total: 0, active: 0, inactive_suspended: 0 },
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const name = String(body.name || "").trim()
    const status = String(body.status || "Active").trim()
    const emailRaw = String(body.email || "").trim()
    const address = String(body.address || "").trim()
    const phone = String(body.phone || "").trim()

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const validStatuses = ["Active", "Inactive", "Suspended"]
    if (!validStatuses.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

    let email: string | null = null
    if (emailRaw) {
      const normalized = emailRaw.toLowerCase()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(normalized)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
      email = normalized
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const allowed = await hasPermission(client, actor, "create_third_party_agent")
      if (!allowed) return { error: "missing_permission:create_third_party_agent" as const }

      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const insertRes = await client.query(
        `INSERT INTO third_party_agents (
           institution_id, branch_id, name, status, email, address, phone, created_by, modified_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING id, institution_id, branch_id, name, status, email, address, phone, created_by, created_at, modified_by, updated_at`,
        [
          actor.institution_id,
          actor.branch_id,
          name,
          status,
          email,
          address || null,
          phone || null,
          actor.id,
        ]
      )
      const inserted = insertRes.rows[0]
      if (inserted?.id) {
        await auditLogger.logInsert(
          "third_party_agents",
          inserted.id,
          {
            name: inserted.name,
            status: inserted.status,
            email: inserted.email,
            address: inserted.address,
            phone: inserted.phone,
          },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
      }
      return {
        third_party_agent: inserted,
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          agent: { id: inserted.id as string, name: inserted.name as string },
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "staff_not_found" ? 404 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === SUPER_ADMIN_WRITE_BLOCKED ||
        errorCode === "branch_inactive" ||
        errorCode === "branch_not_found" ||
        errorCode === "staff_inactive" ||
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "third_party_agents.create.denied", {
        method: "POST",
        apiPath,
        status: statusCode,
        error: errorCode,
        authUserId: session.user.authUserId,
        ...(("branchStatus" in result && result.branchStatus) ? { branchStatus: result.branchStatus } : {}),
      })
      const payload: Record<string, unknown> = {
        error: "message" in result && result.message ? result.message : errorCode,
        code: errorCode,
      }
      if ("branchStatus" in result && result.branchStatus) {
        payload.branch_status = result.branchStatus
      }
      if ("staffStatus" in result && result.staffStatus) {
        payload.staff_status = result.staffStatus
      }
      return NextResponse.json(payload, { status: statusCode })
    }
    apiLog("info", "third_party_agents.create.success", { method: "POST", apiPath, status: 201, authUserId: session.user.authUserId, thirdPartyAgentId: result?.third_party_agent?.id })

    const ctx = result?.postCommit
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyThirdPartyAgentCreated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            agent: ctx.agent,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "third_party_agents.create.notifications_dispatched" : "third_party_agents.create.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            thirdPartyAgentId: result?.third_party_agent?.id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "third_party_agents.create.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          thirdPartyAgentId: result?.third_party_agent?.id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    return NextResponse.json({ third_party_agent: result?.third_party_agent }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
