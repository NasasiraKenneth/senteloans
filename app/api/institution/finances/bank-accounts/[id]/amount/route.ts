import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { auditBankAccountUpdate, bankAccountSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

type Direction = "deposit" | "withdraw"

function normalizeDirection(raw: unknown): Direction | null {
  const v = String(raw || "").trim().toLowerCase()
  if (v === "deposit" || v === "add" || v === "credit") return "deposit"
  if (v === "withdraw" || v === "subtract" || v === "debit") return "withdraw"
  return null
}

function singleBankAccountWhere(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
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
    const amount = Number(body?.amount)
    const direction = normalizeDirection(body?.direction)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!direction) {
      return NextResponse.json({ error: "invalid_direction" }, { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAmount)
      if (!allowed) return { error: "missing_permission:edit_bank_amount" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const existing = await client.query(
        `SELECT id, branch_id, bank_name, bank_account_number,
                COALESCE(total_amount, 0)::numeric AS total_amount
         FROM bank_accounts ba
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const currentBalance = Number(oldRow.total_amount || 0)
      const delta = direction === "deposit" ? amount : -amount

      if (direction === "withdraw" && amount > currentBalance) {
        return {
          error: "insufficient_balance" as const,
          message:
            `Withdrawal exceeds the current balance (${currentBalance.toFixed(2)}).` as const,
        }
      }

      const setParams: unknown[] = [delta, actor.id]
      let scopedWhere = `ba.id = $3::uuid AND ba.institution_id = $4::uuid`
      setParams.push(accountId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ba.branch_id = $5::uuid`
        setParams.push(actor.branch_id)
      }
      scopedWhere += ` AND COALESCE(ba.total_amount, 0) + $1 >= 0`

      const updateRes = await client.query(
        `UPDATE bank_accounts ba
         SET total_amount = COALESCE(total_amount, 0) + $1,
             modified_by = $2::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, bank_name, bank_account_number, total_amount, branch_id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) {
        return {
          error: "balance_changed" as const,
          message:
            "The account balance changed since this form was opened. Reload the table and try again." as const,
        }
      }

      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditBankAccountUpdate(
        client,
        actor,
        accountId,
        bankAccountSnapshot(oldRow),
        { ...bankAccountSnapshot(newRow), _action: direction, _delta: delta },
        (newRow.branch_id as string | null | undefined) ?? (oldRow.branch_id as string | null | undefined),
      )

      return {
        id: String(newRow.id || ""),
        total_amount: Number(newRow.total_amount || 0),
        direction,
        delta,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "not_found"
          ? 404
          : code === "insufficient_balance" || code === "balance_changed"
            ? 409
            : code === "invalid_amount" ||
                code === "invalid_direction" ||
                code === "actor_branch_missing"
              ? 400
              : 403
      const message = "message" in result && result.message ? result.message : undefined
      return NextResponse.json({ error: result.error, ...(message ? { message } : {}) }, { status })
    }

    apiLog("info", "finances.bank_accounts.amount.update.success", {
      method: "PATCH",
      apiPath,
      status: 200,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.bank_accounts.amount.update.error", {
      method: "PATCH",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
