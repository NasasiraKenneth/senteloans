import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { auditBankAccountInsert, bankAccountSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

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
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts)
      if (!allowed) return { error: "missing_permission:view_bank_accouts" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "ba", actor, selectedBranchIds })
      let where = scoped.where
      const values: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (search) {
        where += ` AND (ba.bank_name ILIKE $${idx} OR ba.bank_account_number ILIKE $${idx})`
        values.push(`%${search}%`)
        idx++
      }

      const limitIdx = idx
      const offsetIdx = idx + 1
      values.push(rowsPerPage, offset)

      const listRes = await client.query(
        `SELECT
           ba.id,
           ba.bank_name,
           ba.bank_account_number,
           COALESCE(ba.total_amount, 0)::numeric AS total_amount,
           b.name AS branch_name,
           ba.updated_at,
           COUNT(*) OVER()::int AS total_count
         FROM bank_accounts ba
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
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: statusCode })
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
    const bankName = String(body?.bank_name || "").trim()
    const accountNumber = String(body?.bank_account_number || "").trim()
    const totalAmount = Number(body?.total_amount ?? 0)
    const branchId = String(body?.branch_id || "").trim()

    if (!bankName || !accountNumber) {
      return NextResponse.json({ error: "bank_name_and_account_required" }, { status: 400 })
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: "invalid_total_amount" }, { status: 400 })
    }

    const created = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.addBankAccount)
      if (!allowed) return { error: "missing_permission:add_bank_account" as const }

      const targetBranchId = isSuperAdmin(actor) ? branchId || actor.branch_id : actor.branch_id
      if (!targetBranchId) return { error: "branch_id_required" as const }

      const branchCheck = await client.query(
        `SELECT 1 FROM branches WHERE id = $1::uuid AND institution_id = $2::uuid LIMIT 1`,
        [targetBranchId, actor.institution_id],
      )
      if ((branchCheck.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }

      const insertRes = await client.query(
        `INSERT INTO bank_accounts (
           institution_id, branch_id, bank_name, bank_account_number, total_amount, modified_by
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
         RETURNING id, bank_name, bank_account_number, total_amount, branch_id`,
        [actor.institution_id, targetBranchId, bankName, accountNumber, totalAmount, actor.id],
      )

      const newRow = insertRes.rows[0] as Record<string, unknown> | undefined
      const newId = String(newRow?.id || "")
      if (newRow && newId) {
        await auditBankAccountInsert(
          client,
          actor,
          newId,
          bankAccountSnapshot(newRow),
          (newRow.branch_id as string | null | undefined) ?? targetBranchId,
        )
      }

      return { id: newId }
    })

    if (created && "error" in created) {
      const statusCode =
        created.error === "branch_id_required" || created.error === "invalid_branch" ? 400 : 403
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
