import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { auditUnclaimedDepositUpdate, unclaimedDepositSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { normalizePaymentMode } from "@/lib/finances/payment-mode"

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const canView = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewUnclaimedDeposits)
      const canEdit = await hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit)
      if (!canView && !canEdit) return { error: "missing_permission:view_unclaimed_deposits" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleUnclaimedWhere(actor, depositId)
      const res = await client.query(
        `SELECT
           ud.id,
           ud.unclaimed_deposit_number,
           ud.transaction_number,
           ud.amount,
           ud.mode,
           ud.date,
           ud.status,
           ud.member_id,
           ud.client_id,
           ud.branch_id,
           ud.transaction_id,
           ud.notes,
           COALESCE(m.full_name, c.name, '') AS assignee_name,
           t.transaction_number AS linked_transaction_number
         FROM unclaimed_deposits ud
         LEFT JOIN members m ON m.id = ud.member_id
         LEFT JOIN clients c ON c.id = ud.client_id
         LEFT JOIN transactions t ON t.id = ud.transaction_id
         WHERE ${where}
         LIMIT 1`,
        values,
      )

      const row = res.rows[0]
      if (!row) return { error: "not_found" as const }

      const memberId = row.member_id ? String(row.member_id) : ""
      const clientId = row.client_id ? String(row.client_id) : ""
      const assigneeType = memberId ? "member" : clientId ? "client" : ""
      const statusRaw = String(row.status || "unclaimed")
      const isClaimed = statusRaw.trim().toLowerCase() === "claimed"

      return {
        deposit: {
          id: String(row.id),
          unclaimed_deposit_number: row.unclaimed_deposit_number
            ? String(row.unclaimed_deposit_number)
            : "",
          transaction_number: row.transaction_number ? String(row.transaction_number) : "",
          amount: Number(row.amount || 0),
          mode: String(row.mode || ""),
          date: toDateOnlyString(row.date),
          status: statusRaw,
          member_id: memberId,
          client_id: clientId,
          assignee_type: assigneeType as "" | "member" | "client",
          assignee_name: String(row.assignee_name || ""),
          branch_id: row.branch_id ? String(row.branch_id) : "",
          transaction_id: row.transaction_id ? String(row.transaction_id) : "",
          linked_transaction_number: row.linked_transaction_number
            ? String(row.linked_transaction_number)
            : "",
          notes: row.notes ? String(row.notes) : "",
          can_edit: canEdit && !isClaimed,
        },
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const amount = Number(body?.amount)
    const mode = normalizePaymentMode(body?.mode)
    const depositDate = String(body?.date || "").trim() || null
    const transactionNumber = String(body?.transaction_number || "").trim() || null
    const notes = String(body?.notes || "").trim() || null
    const branchId = String(body?.branch_id || "").trim()

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!mode) {
      return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
    }

    const updated = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit)
      if (!allowed) return { error: "missing_permission:edit_unclaimed_deposit" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleUnclaimedWhere(actor, depositId)
      const existing = await client.query(
        `SELECT id, branch_id, status, unclaimed_deposit_number, transaction_number, amount, mode, date,
                member_id, client_id, transaction_id, notes
         FROM unclaimed_deposits ud
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const currentStatus = String(oldRow.status || "").trim().toLowerCase()
      if (currentStatus === "claimed") {
        return {
          error: "deposit_not_editable" as const,
          message: "This deposit has been claimed and can no longer be edited." as const,
        }
      }

      const targetBranchId = isSuperAdmin(actor)
        ? branchId || String(oldRow.branch_id || "")
        : String(oldRow.branch_id || actor.branch_id)

      if (!targetBranchId) return { error: "branch_id_required" as const }

      if (isSuperAdmin(actor) && branchId) {
        const branchCheck = await client.query(
          `SELECT 1 FROM branches WHERE id = $1::uuid AND institution_id = $2::uuid LIMIT 1`,
          [targetBranchId, actor.institution_id],
        )
        if ((branchCheck.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }
      }

      const setParams: unknown[] = [
        transactionNumber,
        amount,
        mode,
        depositDate,
        notes,
        targetBranchId,
        actor.id,
      ]
      let scopedWhere = `ud.id = $8::uuid AND ud.institution_id = $9::uuid`
      setParams.push(depositId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ud.branch_id = $10::uuid AND lower(trim(ud.status)) = 'unclaimed'`
        setParams.push(actor.branch_id)
      } else {
        scopedWhere += ` AND lower(trim(ud.status)) = 'unclaimed'`
      }

      const updateRes = await client.query(
        `UPDATE unclaimed_deposits ud
         SET transaction_number = $1,
             amount = $2,
             mode = $3::payment_mode,
             date = $4::date,
             notes = $5,
             branch_id = $6::uuid,
             modified_by = $7::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, unclaimed_deposit_number, transaction_number, amount, mode, date, status,
                   member_id, client_id, transaction_id, branch_id, notes`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) {
        return {
          error: "deposit_not_editable" as const,
          message: "This deposit has been claimed and can no longer be edited." as const,
        }
      }
      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditUnclaimedDepositUpdate(
        client,
        actor,
        depositId,
        unclaimedDepositSnapshot(oldRow),
        unclaimedDepositSnapshot(newRow),
        (newRow.branch_id as string | null | undefined) ?? targetBranchId,
      )

      return { id: String(newRow.id || "") }
    })

    if (updated && "error" in updated) {
      const code = String(updated.error || "")
      const statusCode =
        code === "not_found"
          ? 404
          : code === "deposit_not_editable"
            ? 409
            : code === "branch_id_required" || code === "invalid_branch"
              ? 400
              : 403
      const message = "message" in updated && updated.message ? updated.message : undefined
      return NextResponse.json({ error: updated.error, ...(message ? { message } : {}) }, { status: statusCode })
    }

    return NextResponse.json(updated)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
