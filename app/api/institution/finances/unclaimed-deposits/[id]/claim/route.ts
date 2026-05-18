import { NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

function singleUnclaimedWhere(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
  depositId: string,
): { where: string; values: unknown[] } {
  let where = `ud.id = $1::uuid AND ud.institution_id = $2::uuid`
  const values: unknown[] = [depositId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND ud.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

async function validateAssignees(
  client: PoolClient,
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
  branchId: string,
  memberId: string | null,
  clientId: string | null,
): Promise<string | null> {
  if (!memberId && !clientId) return "assignee_required"
  if (memberId && clientId) return "member_and_client_conflict"
  if (memberId) {
    const res = await client.query(
      `SELECT 1 FROM senteloans_members
       WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
       LIMIT 1`,
      [memberId, actor.institution_id, branchId],
    )
    if ((res.rowCount ?? 0) === 0) return "invalid_member"
  }
  if (clientId) {
    const res = await client.query(
      `SELECT 1 FROM senteloans_clients
       WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
       LIMIT 1`,
      [clientId, actor.institution_id, branchId],
    )
    if ((res.rowCount ?? 0) === 0) return "invalid_client"
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: depositId } = await params
  if (!depositId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({}))
    const memberId = String(body?.member_id || "").trim() || null
    const clientId = String(body?.client_id || "").trim() || null

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit)
      if (!allowed) return { error: "missing_permission:edit_unclaimed_deposit" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleUnclaimedWhere(actor, depositId)
      const existing = await client.query(
        `SELECT id, branch_id, status FROM senteloans_unclaimed_deposits ud WHERE ${where} LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }

      const currentStatus = String(existing.rows[0]?.status || "").trim().toLowerCase()
      if (currentStatus !== "unclaimed") {
        return {
          error: "deposit_already_claimed" as const,
          message:
            currentStatus === "claimed"
              ? ("This deposit has already been claimed." as const)
              : ("Only unclaimed deposits can be claimed." as const),
        }
      }

      const branchId = String(existing.rows[0]?.branch_id || actor.branch_id || "")
      if (!branchId) return { error: "branch_id_required" as const }

      const assigneeError = await validateAssignees(client, actor, branchId, memberId, clientId)
      if (assigneeError) return { error: assigneeError as "assignee_required" | "invalid_member" | "invalid_client" | "member_and_client_conflict" }

      const setParams: unknown[] = ["claimed", memberId, clientId, actor.id]
      let scopedWhere = `ud.id = $4::uuid AND ud.institution_id = $5::uuid`
      setParams.push(depositId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ud.branch_id = $6::uuid AND lower(trim(ud.status)) = 'unclaimed'`
        setParams.push(actor.branch_id)
      } else {
        scopedWhere += ` AND lower(trim(ud.status)) = 'unclaimed'`
      }

      const updateRes = await client.query(
        `UPDATE senteloans_unclaimed_deposits ud
         SET status = $1,
             member_id = $2::uuid,
             client_id = $3::uuid,
             modified_by = $4::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) {
        return {
          error: "deposit_already_claimed" as const,
          message: "This deposit has already been claimed." as const,
        }
      }

      return { id: String(updateRes.rows[0]?.id || "") }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "not_found"
          ? 404
          : code === "deposit_already_claimed"
            ? 409
            : code === "assignee_required" ||
                code === "invalid_member" ||
                code === "invalid_client" ||
                code === "member_and_client_conflict" ||
                code === "branch_id_required" ||
                code === "actor_branch_missing"
              ? 400
              : 403
      const message = "message" in result && result.message ? result.message : undefined
      return NextResponse.json({ error: result.error, ...(message ? { message } : {}) }, { status: statusCode })
    }

    apiLog("info", "finances.unclaimed.claim.success", { method: "POST", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.claim.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
