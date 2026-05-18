import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

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
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const canView = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts)
      const canEdit = await hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAccount)
      if (!canView && !canEdit) return { error: "missing_permission:view_bank_accouts" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const res = await client.query(
        `SELECT
           ba.id,
           ba.bank_name,
           ba.bank_account_number,
           COALESCE(ba.total_amount, 0)::numeric AS total_amount,
           ba.branch_id,
           b.name AS branch_name,
           ba.updated_at
         FROM senteloans_bank_accounts ba
         LEFT JOIN senteloans_branches b ON b.id = ba.branch_id
         WHERE ${where}
         LIMIT 1`,
        values,
      )

      const row = res.rows[0]
      if (!row) return { error: "not_found" as const }

      return {
        account: {
          id: String(row.id),
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
      const status =
        result.error === "not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
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
    const bankName = String(body?.bank_name || "").trim()
    const accountNumber = String(body?.bank_account_number || "").trim()
    const totalAmount = Number(body?.total_amount)
    const branchId = String(body?.branch_id || "").trim()

    if (!bankName || !accountNumber) {
      return NextResponse.json({ error: "bank_name_and_account_required" }, { status: 400 })
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: "invalid_total_amount" }, { status: 400 })
    }

    const updated = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAccount)
      if (!allowed) return { error: "missing_permission:edit_bank_account" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const existing = await client.query(`SELECT id, branch_id FROM senteloans_bank_accounts ba WHERE ${where} LIMIT 1`, values)
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }

      const targetBranchId = isSuperAdmin(actor)
        ? branchId || String(existing.rows[0]?.branch_id || "")
        : String(existing.rows[0]?.branch_id || actor.branch_id)

      if (!targetBranchId) return { error: "branch_id_required" as const }

      if (isSuperAdmin(actor) && branchId) {
        const branchCheck = await client.query(
          `SELECT 1 FROM senteloans_branches WHERE id = $1::uuid AND institution_id = $2::uuid LIMIT 1`,
          [targetBranchId, actor.institution_id],
        )
        if ((branchCheck.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }
      }

      const setParams: unknown[] = [bankName, accountNumber, totalAmount, targetBranchId, actor.id]
      let scopedWhere = `ba.id = $6::uuid AND ba.institution_id = $7::uuid`
      setParams.push(accountId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND ba.branch_id = $8::uuid`
        setParams.push(actor.branch_id)
      }

      const updateRes = await client.query(
        `UPDATE senteloans_bank_accounts ba
         SET bank_name = $1,
             bank_account_number = $2,
             total_amount = $3,
             branch_id = $4::uuid,
             modified_by = $5::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) return { error: "not_found" as const }
      return { id: String(updateRes.rows[0]?.id || "") }
    })

    if (updated && "error" in updated) {
      const status =
        updated.error === "not_found"
          ? 404
          : updated.error === "branch_id_required" || updated.error === "invalid_branch"
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
