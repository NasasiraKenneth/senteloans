import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, type ActorContext } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  assertFinanceReadAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditGrantUpdate, grantSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

function singleGrantWhere(
  actor: ActorContext,
  grantId: string,
): { where: string; values: unknown[] } {
  let where = `g.id = $1::uuid AND g.institution_id = $2::uuid`
  const values: unknown[] = [grantId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND g.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: grantId } = await params
  if (!grantId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceReadAccess(client, sess.authUserId, [
        FINANCE_PERMISSIONS.viewGrants,
        FINANCE_PERMISSIONS.editGrant,
      ])
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access
      const canEdit = await hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant)

      const { where, values } = singleGrantWhere(actor, grantId)
      const res = await client.query(
        `SELECT
           g.id,
           g.third_party_agent_id,
           tpa.name AS third_party_agent_name,
           COALESCE(g.total_amount, 0)::numeric AS total_amount,
           COALESCE(g.available_balance, 0)::numeric AS available_balance,
           GREATEST(COALESCE(g.total_amount, 0) - COALESCE(g.available_balance, 0), 0)::numeric AS remaining_amount,
           CASE
             WHEN COALESCE(g.total_amount, 0) > 0
               THEN ROUND((COALESCE(g.available_balance, 0) / g.total_amount) * 100, 2)
             ELSE 0
           END::numeric AS percentage_received,
           g.branch_id,
           b.name AS branch_name,
           g.created_at,
           g.updated_at
         FROM grants g
         JOIN third_party_agents tpa ON tpa.id = g.third_party_agent_id
         LEFT JOIN branches b ON b.id = g.branch_id
         WHERE ${where}
         LIMIT 1`,
        values,
      )

      const row = res.rows[0]
      if (!row) return { error: "not_found" as const }

      return {
        grant: {
          id: String(row.id),
          third_party_agent_id: row.third_party_agent_id ? String(row.third_party_agent_id) : "",
          third_party_agent_name: String(row.third_party_agent_name || ""),
          total_amount: Number(row.total_amount || 0),
          available_balance: Number(row.available_balance || 0),
          remaining_amount: Number(row.remaining_amount || 0),
          percentage_received: Number(row.percentage_received || 0),
          branch_id: row.branch_id ? String(row.branch_id) : "",
          branch_name: String(row.branch_name || ""),
          created_at: row.created_at ? String(row.created_at) : "",
          updated_at: row.updated_at ? String(row.updated_at) : "",
          can_edit: canEdit,
        },
      }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const status = result.error === "not_found" ? 404 : 403
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: grantId } = await params
  if (!grantId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({}))
    const thirdPartyAgentId = String(body?.third_party_agent_id || "").trim()
    const totalAmount = Number(body?.total_amount)
    const availableBalanceRaw = body?.available_balance
    const branchId = String(body?.branch_id || "").trim()

    if (!thirdPartyAgentId) {
      return NextResponse.json({ error: "third_party_agent_id_required" }, { status: 400 })
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: "invalid_total_amount" }, { status: 400 })
    }

    const availableBalance =
      availableBalanceRaw === undefined || availableBalanceRaw === null || availableBalanceRaw === ""
        ? totalAmount
        : Number(availableBalanceRaw)

    if (!Number.isFinite(availableBalance) || availableBalance < 0 || availableBalance > totalAmount) {
      return NextResponse.json({ error: "invalid_available_balance" }, { status: 400 })
    }

    const updated = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editGrant)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = singleGrantWhere(actor, grantId)
      const existing = await client.query(
        `SELECT id, branch_id, third_party_agent_id,
                COALESCE(total_amount, 0)::numeric AS total_amount,
                COALESCE(available_balance, 0)::numeric AS available_balance
         FROM grants g
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const targetBranchId = isSuperAdmin(actor)
        ? branchId || String(oldRow.branch_id || "")
        : String(oldRow.branch_id || actor.branch_id)

      const branchScope = await assertFinanceBranchScope(client, actor, targetBranchId)
      if (!branchScope.ok) {
        return {
          error: branchScope.error,
          staffStatus: branchScope.staffStatus,
          branchStatus: branchScope.branchStatus,
        }
      }

      const agentCheck = await client.query(
        `SELECT 1 FROM third_party_agents
         WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
         LIMIT 1`,
        [thirdPartyAgentId, actor.institution_id, branchScope.branchId],
      )
      if ((agentCheck.rowCount ?? 0) === 0) return { error: "invalid_third_party_agent" as const }

      const setParams: unknown[] = [thirdPartyAgentId, totalAmount, availableBalance, branchScope.branchId]
      let scopedWhere = `g.id = $5::uuid AND g.institution_id = $6::uuid`
      setParams.push(grantId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND g.branch_id = $7::uuid`
        setParams.push(actor.branch_id)
      }

      const updateRes = await client.query(
        `UPDATE grants g
         SET third_party_agent_id = $1::uuid,
             total_amount = $2,
             available_balance = $3,
             branch_id = $4::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, third_party_agent_id, total_amount, available_balance, branch_id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditGrantUpdate(
        client,
        actor,
        grantId,
        grantSnapshot(oldRow),
        grantSnapshot(newRow),
        (newRow.branch_id as string | null | undefined) ?? branchScope.branchId,
      )

      return { id: String(newRow.id || "") }
    })

    if (updated && "error" in updated) {
      const accessResponse = financeAccessErrorResponseOrNull(updated)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const status =
        updated.error === "not_found"
          ? 404
          : updated.error === "invalid_third_party_agent"
            ? 400
            : 403
      return NextResponse.json({ error: updated.error }, { status })
    }

    return NextResponse.json(updated)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
