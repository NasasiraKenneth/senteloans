import { NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, type ActorContext } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditUnclaimedDepositUpdate, unclaimedDepositSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { readUnclaimedThirdPartyAgentId } from "@/lib/finances/unclaimed-deposit"

function singleUnclaimedWhere(
  actor: ActorContext,
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
  actor: ActorContext,
  branchId: string,
  memberId: string | null,
  clientId: string | null,
): Promise<string | null> {
  if (!memberId && !clientId) return "assignee_required"
  if (memberId && clientId) return "member_and_client_conflict"
  if (memberId) {
    const res = await client.query(
      `SELECT 1 FROM members
       WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
       LIMIT 1`,
      [memberId, actor.institution_id, branchId],
    )
    if ((res.rowCount ?? 0) === 0) return "invalid_member"
  }
  if (clientId) {
    const res = await client.query(
      `SELECT 1 FROM third_party_agents
       WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
       LIMIT 1`,
      [clientId, actor.institution_id, branchId],
    )
    if ((res.rowCount ?? 0) === 0) return "invalid_third_party_agent"
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
    const thirdPartyAgentId = readUnclaimedThirdPartyAgentId(body as Record<string, unknown>)
    const transactionId = String(body?.transaction_id || "").trim() || null

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editUnclaimedDeposit)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = singleUnclaimedWhere(actor, depositId)
      const existing = await client.query(
        `SELECT id, branch_id, status, amount, unclaimed_deposit_number, transaction_number, mode, date,
                member_id, third_party_agent_id, transaction_id, notes
         FROM unclaimed_deposits ud
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const branchScope = await assertFinanceBranchScope(client, actor, oldRow.branch_id as string)
      if (!branchScope.ok) {
        return {
          error: branchScope.error,
          staffStatus: branchScope.staffStatus,
          branchStatus: branchScope.branchStatus,
        }
      }

      const currentStatus = String(oldRow.status || "").trim().toLowerCase()
      if (currentStatus !== "unclaimed") {
        return {
          error: "deposit_already_claimed" as const,
          message:
            currentStatus === "claimed"
              ? ("This deposit has already been claimed." as const)
              : ("Only unclaimed deposits can be claimed." as const),
        }
      }

      const branchId = branchScope.branchId
      const depositAmount = Number(oldRow.amount || 0)

      const assigneeError = await validateAssignees(client, actor, branchId, memberId, thirdPartyAgentId)
      if (assigneeError) {
        return {
          error: assigneeError as
            | "assignee_required"
            | "invalid_member"
            | "invalid_third_party_agent"
            | "member_and_client_conflict",
        }
      }

      if (transactionId) {
        const linkCheck = await client.query(
          `SELECT 1 FROM unclaimed_deposits
           WHERE transaction_id = $1::uuid
             AND id <> $2::uuid
           LIMIT 1`,
          [transactionId, depositId],
        )
        if ((linkCheck.rowCount ?? 0) > 0) {
          return {
            error: "transaction_already_linked" as const,
            message: "This transaction is already linked to another deposit." as const,
          }
        }

        let txQuery =
          `SELECT t.amount FROM transactions t
           WHERE t.id = $1::uuid
             AND t.institution_id = $2::uuid
             AND t.branch_id = $3::uuid`
        const txParams: unknown[] = [transactionId, actor.institution_id, branchId]
        if (memberId) {
          txQuery += ` AND t.member_id = $4::uuid`
          txParams.push(memberId)
        } else if (thirdPartyAgentId) {
          txQuery += ` AND t.third_party_agent_id = $4::uuid`
          txParams.push(thirdPartyAgentId)
        }
        txQuery += ` LIMIT 1`

        const txRes = await client.query(txQuery, txParams)
        if ((txRes.rowCount ?? 0) === 0) return { error: "invalid_transaction" as const }

        const txAmount = Number(txRes.rows[0]?.amount || 0)
        if (
          !Number.isFinite(txAmount) ||
          !Number.isFinite(depositAmount) ||
          Math.abs(txAmount - depositAmount) > 0.005
        ) {
          return {
            error: "transaction_amount_mismatch" as const,
            message:
              `Transaction amount (${txAmount.toFixed(2)}) does not match the deposit amount (${depositAmount.toFixed(2)}).` as const,
          }
        }
      }

      const setParams: unknown[] = ["claimed", memberId, thirdPartyAgentId, transactionId, actor.id]
      let scopedWhere = `ud.id = $6::uuid AND ud.institution_id = $7::uuid`
      setParams.push(depositId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ud.branch_id = $8::uuid AND lower(trim(ud.status)) = 'unclaimed'`
        setParams.push(actor.branch_id)
      } else {
        scopedWhere += ` AND lower(trim(ud.status)) = 'unclaimed'`
      }

      const updateRes = await client.query(
        `UPDATE unclaimed_deposits ud
         SET status = $1,
             member_id = $2::uuid,
             third_party_agent_id = $3::uuid,
             transaction_id = $4::uuid,
             modified_by = $5::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, unclaimed_deposit_number, transaction_number, amount, mode, date, status,
                   member_id, third_party_agent_id, transaction_id, branch_id, notes`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) {
        return {
          error: "deposit_already_claimed" as const,
          message: "This deposit has already been claimed." as const,
        }
      }

      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditUnclaimedDepositUpdate(
        client,
        actor,
        depositId,
        unclaimedDepositSnapshot(oldRow),
        { ...unclaimedDepositSnapshot(newRow), _action: "claim" },
        (newRow.branch_id as string | null | undefined) ?? branchId,
      )

      return { id: String(newRow.id || "") }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const code = String(result.error || "")
      const statusCode =
        code === "not_found"
          ? 404
          : code === "deposit_already_claimed" || code === "transaction_already_linked"
            ? 409
            : code === "assignee_required" ||
                code === "invalid_member" ||
                code === "invalid_third_party_agent" ||
                code === "invalid_client" ||
                code === "invalid_transaction" ||
                code === "transaction_amount_mismatch" ||
                code === "member_and_client_conflict"
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
