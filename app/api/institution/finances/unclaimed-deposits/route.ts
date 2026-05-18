import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { normalizePaymentMode } from "@/lib/finances/payment-mode"

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
    const status = (url.searchParams.get("status") || "").trim()
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10), 1), 500)

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewUnclaimedDeposits)
      if (!allowed) return { error: "missing_permission:view_unclaimed_deposits" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "ud", actor, selectedBranchIds })
      let where = scoped.where
      const values: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (status) {
        where += ` AND lower(trim(ud.status)) = lower(trim($${idx}::text))`
        values.push(status)
        idx++
      }

      values.push(limit)
      const listRes = await client.query(
        `SELECT
           ud.id,
           COALESCE(ud.transaction_number, '') AS transaction_number,
           ud.amount,
           ud.mode,
           ud.date,
           ud.status,
           COALESCE(m.full_name, c.name, '—') AS assigned_to,
           CASE
             WHEN ud.member_id IS NOT NULL THEN 'Member'
             WHEN ud.client_id IS NOT NULL THEN 'Client'
             ELSE '—'
           END AS assigned_type,
           COALESCE(ud.notes, '') AS notes
         FROM senteloans_unclaimed_deposits ud
         LEFT JOIN senteloans_members m ON m.id = ud.member_id
         LEFT JOIN senteloans_clients c ON c.id = ud.client_id
         WHERE ${where}
         ORDER BY ud.date DESC NULLS LAST, ud.created_at DESC
         LIMIT $${idx}`,
        values,
      )

      return {
        rows: listRes.rows.map((row) => ({
          id: String(row.id),
          transaction_number: String(row.transaction_number || ""),
          amount: Number(row.amount || 0),
          mode: String(row.mode || ""),
          date: toDateOnlyString(row.date),
          status: String(row.status || "unclaimed"),
          assigned_to: String(row.assigned_to || "—"),
          assigned_type: String(row.assigned_type || "—") as "Member" | "Client",
          notes: String(row.notes || ""),
        })),
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json({ rows: result?.rows || [] })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.list.error", { method: "GET", apiPath, status: 500, error: err?.message })
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
    const amount = Number(body?.amount)
    const mode = normalizePaymentMode(body?.mode)
    const depositDate = String(body?.date || "").trim() || null
    const transactionNumber = String(body?.transaction_number || "").trim() || null
    const notes = String(body?.notes || "").trim() || null
    const status = String(body?.status || "unclaimed").trim().toLowerCase()
    const memberId = String(body?.member_id || "").trim() || null
    const clientId = String(body?.client_id || "").trim() || null
    const branchId = String(body?.branch_id || "").trim()

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!mode) {
      return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
    }
    if (!["unclaimed", "claimed"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }

    const created = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.addUnclaimedDeposit)
      if (!allowed) return { error: "missing_permission:add_unclaimed_deposit" as const }

      const targetBranchId = isSuperAdmin(actor) ? branchId || actor.branch_id : actor.branch_id
      if (!targetBranchId) return { error: "branch_id_required" as const }

      const insertRes = await client.query(
        `INSERT INTO senteloans_unclaimed_deposits (
           institution_id, branch_id, member_id, client_id, transaction_number,
           amount, mode, date, status, notes, created_by, modified_by
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           $6, $7::payment_mode, $8::date, $9, $10, $11::uuid, $11::uuid
         )
         RETURNING id`,
        [
          actor.institution_id,
          targetBranchId,
          memberId,
          clientId,
          transactionNumber,
          amount,
          mode,
          depositDate,
          status,
          notes,
          actor.id,
        ],
      )

      return { id: String(insertRes.rows[0]?.id || "") }
    })

    if (created && "error" in created) {
      const statusCode =
        created.error === "branch_id_required" ? 400 : 403
      return NextResponse.json({ error: created.error }, { status: statusCode })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.create.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
