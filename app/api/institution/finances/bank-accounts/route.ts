import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requireStaffSession, scopeWhere } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  assertFinanceReadAccess,
  financeAccessErrorResponseOrNull,
  resolveFinanceWriteBranchId,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditBankAccountInsert, bankAccountSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { BANK_ACCOUNT_AGENT_JOIN } from "@/lib/finances/bank-account"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const search = (url.searchParams.get("q") || "").trim()
    const pageRaw = parseInt(url.searchParams.get("page") || "0", 10)
    const rowsPerPageRaw = parseInt(url.searchParams.get("rowsPerPage") || "10", 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0
    const rowsPerPage = Math.min(Math.max(Number.isFinite(rowsPerPageRaw) ? rowsPerPageRaw : 10, 1), 200)
    const offset = page * rowsPerPage

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceReadAccess(client, sess.authUserId, FINANCE_PERMISSIONS.viewBankAccounts)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const scoped = scopeWhere({ tableAlias: "ba", actor, selectedBranchIds })
      let where = scoped.where
      const values: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (search) {
        where += ` AND (tpa.name ILIKE $${idx} OR ba.bank_account_number ILIKE $${idx})`
        values.push(`%${search}%`)
        idx++
      }

      const limitIdx = idx
      const offsetIdx = idx + 1
      values.push(rowsPerPage, offset)

      const listRes = await client.query(
        `SELECT
           ba.id,
           ba.third_party_agent_id,
           tpa.name AS bank_name,
           ba.bank_account_number,
           COALESCE(ba.total_amount, 0)::numeric AS total_amount,
           b.name AS branch_name,
           ba.updated_at,
           COUNT(*) OVER()::int AS total_count
         FROM bank_accounts ba
         ${BANK_ACCOUNT_AGENT_JOIN}
         LEFT JOIN branches b ON b.id = ba.branch_id
         WHERE ${where}
         ORDER BY ba.updated_at DESC NULLS LAST, ba.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      )

      const total = listRes.rows[0]?.total_count != null ? Number(listRes.rows[0].total_count) : 0

      return {
        rows: listRes.rows.map((row) => ({
          id: String(row.id),
          third_party_agent_id: row.third_party_agent_id ? String(row.third_party_agent_id) : "",
          bank_name: String(row.bank_name || ""),
          bank_account_number: String(row.bank_account_number || ""),
          total_amount: Number(row.total_amount || 0),
          branch_name: String(row.branch_name || ""),
          updated_at: row.updated_at ? String(row.updated_at) : "",
        })),
        total,
      }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    return NextResponse.json({ rows: result?.rows || [], total: result?.total || 0 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.bank_accounts.list.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
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

    const created = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.addBankAccount)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const targetBranchId = resolveFinanceWriteBranchId(actor, branchId)
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

      const insertRes = await client.query(
        `INSERT INTO bank_accounts (
           institution_id, branch_id, third_party_agent_id, bank_account_number, total_amount, modified_by
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 0, $5::uuid)
         RETURNING id, third_party_agent_id, bank_account_number, total_amount, branch_id`,
        [actor.institution_id, branchScope.branchId, thirdPartyAgentId, accountNumber, actor.id],
      )

      const newRow = insertRes.rows[0] as Record<string, unknown> | undefined
      const newId = String(newRow?.id || "")
      if (newRow && newId) {
        await auditBankAccountInsert(
          client,
          actor,
          newId,
          bankAccountSnapshot(newRow),
          (newRow.branch_id as string | null | undefined) ?? branchScope.branchId,
        )
      }

      return { id: newId }
    })

    if (created && "error" in created) {
      const accessResponse = financeAccessErrorResponseOrNull(created)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const statusCode = created.error === "invalid_third_party_agent" ? 400 : 403
      return NextResponse.json({ error: created.error }, { status: statusCode })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    if (err?.message?.includes("uk_bank_account_per_institution")) {
      return NextResponse.json({ error: "bank_account_already_exists" }, { status: 409 })
    }
    apiLog("error", "finances.bank_accounts.create.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
