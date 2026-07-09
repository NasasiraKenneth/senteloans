import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { assertThirdPartyAgentEditableForUpdates } from "@/lib/third-party-agents/agent-status"
import { notifyThirdPartyAgentUpdated } from "@/lib/notifications/third-party-agent-events"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
  type ActorContext,
} from "@/lib/api/rbac"

const VALID_STATUSES = ["Active", "Inactive", "Suspended"] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function whereScope(actor: ActorContext) {
  if (isSuperAdmin(actor)) {
    return { clause: "c.id = $1 AND c.institution_id = $2", params: [] as unknown[] }
  }
  return { clause: "c.id = $1 AND c.institution_id = $2 AND c.branch_id = $3", params: [actor.branch_id] as unknown[] }
}

const AGENT_RETURNING = `
  c.id, c.institution_id, c.branch_id, c.name, c.status, c.email, c.address, c.phone,
  c.created_by, c.created_at, c.modified_by, c.updated_at
`.trim()

type AgentUpdates = Record<string, string | null>

function parseAgentUpdates(body: Record<string, unknown>): { updates: AgentUpdates } | { error: string } {
  const updates: AgentUpdates = {}

  if (typeof body.name === "string") {
    const trimmed = body.name.trim()
    if (!trimmed) return { error: "Name cannot be empty" }
    updates.name = trimmed
  }

  if (typeof body.status === "string") {
    const trimmed = body.status.trim()
    if (!trimmed) return { error: "Status is required" }
    if (!VALID_STATUSES.includes(trimmed as (typeof VALID_STATUSES)[number])) {
      return { error: "Invalid status" }
    }
    updates.status = trimmed
  }

  if (typeof body.email === "string") {
    const emailRaw = body.email.trim()
    if (emailRaw) {
      const normalized = emailRaw.toLowerCase()
      if (!EMAIL_RE.test(normalized)) return { error: "Invalid email format" }
      updates.email = normalized
    } else {
      updates.email = null
    }
  }

  if (typeof body.address === "string") {
    updates.address = body.address.trim() || null
  }

  if (typeof body.phone === "string") {
    updates.phone = body.phone.trim() || null
  }

  if (Object.keys(updates).length === 0) {
    return { error: "no_updatable_fields" }
  }

  return { updates }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing third party agent ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_third_party_agents")
      if (!allowed) return { error: "missing_permission:view_third_party_agents" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const clientRes = await client.query(
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
         WHERE ${scope.clause}
         LIMIT 1`,
        [id, actor.institution_id, ...scope.params]
      )
      if (clientRes.rows.length === 0) return { error: "third_party_agent_not_found" as const }
      return { third_party_agent: clientRes.rows[0] }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "third_party_agent_not_found" ? 404 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "third_party_agents.detail.denied", {
        method: "GET",
        apiPath,
        status: statusCode,
        error: errorCode,
        authUserId: session.user.authUserId,
        thirdPartyAgentId: id,
      })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "third_party_agents.detail.success", {
      method: "GET",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
      thirdPartyAgentId: id,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing third party agent ID" }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const parsed = parseAgentUpdates(body as Record<string, unknown>)
    if ("error" in parsed) {
      const errorCode = parsed.error
      apiLog("warn", "third_party_agents.update.invalid_request", {
        method: "PATCH",
        apiPath,
        status: 400,
        error: errorCode,
        thirdPartyAgentId: id,
      })
      return NextResponse.json({ error: errorCode }, { status: 400 })
    }
    const { updates } = parsed

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.update.denied", { method: "PATCH", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.update.denied", { method: "PATCH", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
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

      const allowed = await hasPermission(client, actor, "edit_third_party_agent")
      if (!allowed) return { error: "missing_permission:edit_third_party_agent" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const existingRes = await client.query(
        `SELECT c.id, c.branch_id, c.name, c.status, c.email, c.address, c.phone
         FROM third_party_agents c
         WHERE ${scope.clause}
         LIMIT 1`,
        [id, actor.institution_id, ...scope.params]
      )
      if (existingRes.rows.length === 0) return { error: "third_party_agent_not_found" as const }
      const previous = existingRes.rows[0]

      const agentEditCheck = assertThirdPartyAgentEditableForUpdates(
        { status: String(previous.status || "") },
        updates,
      )
      if (!agentEditCheck.ok) {
        return {
          error: agentEditCheck.error,
          agentStatus: agentEditCheck.error === "third_party_agent_inactive" ? agentEditCheck.status : undefined,
        }
      }

      const branchCheck = await assertBranchActive(client, String(previous.branch_id || ""))
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const writeUpdates: AgentUpdates = { ...updates, modified_by: actor.id }
      const keys = Object.keys(writeUpdates)
      const whereParamCount = 2 + scope.params.length
      const setClause = keys.map((k, i) => `${k} = $${i + 1 + whereParamCount}`).join(", ")
      const vals = Object.values(writeUpdates)

      const updateRes = await client.query(
        `UPDATE third_party_agents c
         SET ${setClause}, updated_at = NOW()
         WHERE ${scope.clause}
         RETURNING ${AGENT_RETURNING}`,
        [id, actor.institution_id, ...scope.params, ...vals]
      )
      if (updateRes.rows.length === 0) return { error: "third_party_agent_not_found" as const }
      const updated = updateRes.rows[0]

      const beforeAudit: Record<string, unknown> = {}
      const afterAudit: Record<string, unknown> = {}
      for (const key of Object.keys(updates)) {
        beforeAudit[key] = previous[key]
        afterAudit[key] = updates[key]
      }

      await auditLogger.logUpdate(
        "third_party_agents",
        id,
        beforeAudit,
        afterAudit,
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      return {
        third_party_agent: updated,
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          agent: { id: updated.id as string, name: updated.name as string },
          updatedFields: Object.keys(updates),
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "third_party_agent_not_found" ? 404 :
        errorCode === "staff_not_found" ? 404 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === SUPER_ADMIN_WRITE_BLOCKED ||
        errorCode === "branch_inactive" ||
        errorCode === "branch_not_found" ||
        errorCode === "staff_inactive" ||
        errorCode === "third_party_agent_inactive" ||
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "third_party_agents.update.denied", {
        method: "PATCH",
        apiPath,
        status: statusCode,
        error: errorCode,
        authUserId: session.user.authUserId,
        thirdPartyAgentId: id,
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
      if ("agentStatus" in result && result.agentStatus) {
        payload.agent_status = result.agentStatus
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    const ctx = result?.postCommit
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyThirdPartyAgentUpdated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            agent: ctx.agent,
            updatedFields: ctx.updatedFields,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "third_party_agents.update.notifications_dispatched" : "third_party_agents.update.notifications_partial",
          {
            method: "PATCH",
            apiPath,
            status: 200,
            thirdPartyAgentId: id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "third_party_agents.update.notifications_failed", {
          method: "PATCH",
          apiPath,
          status: 200,
          thirdPartyAgentId: id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    apiLog("info", "third_party_agents.update.success", {
      method: "PATCH",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
      thirdPartyAgentId: id,
    })
    return NextResponse.json({ third_party_agent: result?.third_party_agent })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
