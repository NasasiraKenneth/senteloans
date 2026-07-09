import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, type ActorContext } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  assertFinanceReadAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditBankAccountUpdate, bankAccountSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { BANK_ACCOUNT_AGENT_JOIN } from "@/lib/finances/bank-account"

function singleBankAccountWhere(
  actor: ActorContext,
  accountId: string,
): { where: string; values: unknown[] } {
  let where = `ba.id = $1::uuid AND ba.institution_id = $2::uuid`
  const values: unknown[] = [accountId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND ba.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: accountId } = await params
  if (!accountId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceReadAccess(client, sess.authUserId, [
        FINANCE_PERMISSIONS.viewBankAccounts,
        FINANCE_PERMISSIONS.editBankAccount,
      ])
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const res = await client.query(
        `SELECT
           ba.id,
           ba.third_party_agent_id,
           tpa.name AS bank_name,
           tpa.name AS third_party_agent_name,
           ba.bank_account_number,
           COALESCE(ba.total_amount, 0)::numeric AS total_amount,
           ba.branch_id,
           b.name AS branch_name,
           ba.updated_at
         FROM bank_accounts ba
         ${BANK_ACCOUNT_AGENT_JOIN}
         LEFT JOIN branches b ON b.id = ba.branch_id
         WHERE ${where}
         LIMIT 1`,
        values,
      )

      const row = res.rows[0]
      if (!row) return { error: "not_found" as const }

      return {
        account: {
          id: String(row.id),
          third_party_agent_id: row.third_party_agent_id ? String(row.third_party_agent_id) : "",
          third_party_agent_name: String(row.third_party_agent_name || ""),
          bank_name: String(row.bank_name || ""),
          bank_account_number: String(row.bank_account_number || ""),
          total_amount: Number(row.total_amount || 0),
          branch_id: row.branch_id ? String(row.branch_id) : "",
          branch_name: String(row.branch_name || ""),
          updated_at: row.updated_at ? String(row.updated_at) : "",
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
    apiLog("error", "finances.bank_accounts.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: accountId } = await params
  if (!accountId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({}))
    const thirdPartyAgentId = String(body?.third_party_agent_id || "").trim()
    const accountNumber = String(body?.bank_account_number || "").trim()
    const branchId = String(body?.branch_id || "").trim()

    if (!thirdPartyAgentId) {
      return NextResponse.json({ error: "third_party_agent_id_required" }, { status: 400 })
    }
    if (!accountNumber) {
      return NextResponse.json({ error: "bank_account_number_required" }, { status: 400 })
    }

    const updated = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editBankAccount)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const existing = await client.query(
        `SELECT ba.id, ba.branch_id, ba.third_party_agent_id, ba.bank_account_number, ba.total_amount
         FROM bank_accounts ba
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

      const setParams: unknown[] = [thirdPartyAgentId, accountNumber, branchScope.branchId, actor.id]
      let scopedWhere = `ba.id = $5::uuid AND ba.institution_id = $6::uuid`
      setParams.push(accountId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ba.branch_id = $7::uuid`
        setParams.push(actor.branch_id)
      }

      const updateRes = await client.query(
        `UPDATE bank_accounts ba
         SET third_party_agent_id = $1::uuid,
             bank_account_number = $2,
             branch_id = $3::uuid,
             modified_by = $4::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, third_party_agent_id, bank_account_number, total_amount, branch_id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditBankAccountUpdate(
        client,
        actor,
        accountId,
        bankAccountSnapshot(oldRow),
        bankAccountSnapshot(newRow),
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
    if (err?.message?.includes("uk_bank_account_per_institution")) {
      return NextResponse.json({ error: "bank_account_already_exists" }, { status: 409 })
    }
    apiLog("error", "finances.bank_accounts.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
