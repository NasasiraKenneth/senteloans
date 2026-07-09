import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  financeAccessErrorResponseOrNull,
  resolveFinanceWriteBranchId,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import {
  auditBankAccountUpdate,
  auditDailyFinanceInsert,
  bankAccountSnapshot,
  dailyFinanceSnapshot,
} from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

type IncomingBankAmount = {
  account_id?: unknown
  amount?: unknown
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const raw = typeof value === "string" ? value.trim() : value
  if (raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))

    const rawBranchId = String(body?.branch_id || "").trim()
    const mobileMoneyAmount = parseNonNegativeNumber(body?.mobile_money_amount) ?? 0
    const cashAmount = parseNonNegativeNumber(body?.cash_amount) ?? 0
    const rawBankAccountAmounts: IncomingBankAmount[] = Array.isArray(body?.bank_account_amounts)
      ? (body.bank_account_amounts as IncomingBankAmount[])
      : []

    const bankInputs: Array<{ accountId: string; amount: number }> = []
    for (const entry of rawBankAccountAmounts) {
      const accountId = String(entry?.account_id || "").trim()
      const amt = parseNonNegativeNumber(entry?.amount)
      if (!accountId || amt === null) {
        return NextResponse.json({ error: "invalid_bank_account_amount" }, { status: 400 })
      }
      bankInputs.push({ accountId, amount: amt })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editDailyReport)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const targetBranchId = resolveFinanceWriteBranchId(actor, rawBranchId)
      const branchScope = await assertFinanceBranchScope(client, actor, targetBranchId)
      if (!branchScope.ok) {
        return {
          error: branchScope.error,
          staffStatus: branchScope.staffStatus,
          branchStatus: branchScope.branchStatus,
        }
      }
      const resolvedBranchId = branchScope.branchId

      const bankTotalAmount = bankInputs.reduce((acc, b) => acc + b.amount, 0)
      const totalAmount = bankTotalAmount + mobileMoneyAmount + cashAmount

      if (totalAmount <= 0) {
        return { error: "no_amounts_declared" as const }
      }

      const existingTodayRes = await client.query(
        `SELECT 1
         FROM daily_finances
         WHERE institution_id = $1::uuid
           AND branch_id = $2::uuid
           AND total_amount > 0
           AND created_at >= date_trunc('day', NOW())
           AND created_at <  date_trunc('day', NOW()) + INTERVAL '1 day'
         LIMIT 1`,
        [actor.institution_id, resolvedBranchId],
      )
      if ((existingTodayRes.rowCount ?? 0) > 0) {
        return { error: "daily_report_already_filed" as const }
      }

      try {
        await client.query("BEGIN")

        const accountUpdates: Array<{ oldRow: Record<string, unknown>; newRow: Record<string, unknown> }> = []

        for (const entry of bankInputs) {
          const existing = await client.query(
            `SELECT ba.id, ba.third_party_agent_id, ba.bank_account_number, ba.branch_id,
                    tpa.name AS bank_name,
                    COALESCE(ba.total_amount, 0)::numeric AS total_amount
             FROM bank_accounts ba
             INNER JOIN third_party_agents tpa ON tpa.id = ba.third_party_agent_id
             WHERE ba.id = $1::uuid
               AND ba.institution_id = $2::uuid
               AND ba.branch_id = $3::uuid
             LIMIT 1`,
            [entry.accountId, actor.institution_id, resolvedBranchId],
          )
          if ((existing.rowCount ?? 0) === 0) {
            throw new Error("invalid_bank_account")
          }
          const oldRow = existing.rows[0] as Record<string, unknown>

          const updateRes = await client.query(
            `UPDATE bank_accounts
             SET total_amount = $1::numeric,
                 modified_by = $2::uuid,
                 updated_at = NOW()
             WHERE id = $3::uuid
               AND institution_id = $4::uuid
               AND branch_id = $5::uuid
             RETURNING id, third_party_agent_id, bank_account_number, total_amount, branch_id`,
            [
              entry.amount,
              actor.id,
              entry.accountId,
              actor.institution_id,
              resolvedBranchId,
            ],
          )
          if ((updateRes.rowCount ?? 0) === 0) {
            throw new Error("invalid_bank_account")
          }
          accountUpdates.push({
            oldRow,
            newRow: updateRes.rows[0] as Record<string, unknown>,
          })
        }

        const insertRes = await client.query(
          `INSERT INTO daily_finances (
             institution_id,
             branch_id,
             bank_total_amount,
             mobile_money_amount,
             cash_amount,
             total_amount,
             available_balance,
             created_by,
             created_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric,
             $6::numeric, $7::numeric, $8::uuid, NOW()
           )
           RETURNING id, institution_id, branch_id, bank_total_amount, mobile_money_amount,
                     cash_amount, total_amount, available_balance`,
          [
            actor.institution_id,
            resolvedBranchId,
            bankTotalAmount,
            mobileMoneyAmount,
            cashAmount,
            totalAmount,
            totalAmount,
            actor.id,
          ],
        )

        const insertedRow = insertRes.rows[0] as Record<string, unknown>
        const newId = String(insertedRow?.id || "")

        await auditDailyFinanceInsert(
          client,
          actor,
          newId,
          dailyFinanceSnapshot(insertedRow),
          (insertedRow.branch_id as string | null | undefined) ?? resolvedBranchId,
        )

        for (const upd of accountUpdates) {
          await auditBankAccountUpdate(
            client,
            actor,
            String(upd.newRow.id || ""),
            bankAccountSnapshot(upd.oldRow),
            { ...bankAccountSnapshot(upd.newRow), _action: "daily_report" },
            (upd.newRow.branch_id as string | null | undefined) ??
              (upd.oldRow.branch_id as string | null | undefined),
          )
        }

        await client.query("COMMIT")

        return {
          id: newId,
          bank_total_amount: bankTotalAmount,
          mobile_money_amount: mobileMoneyAmount,
          cash_amount: cashAmount,
          total_amount: totalAmount,
          available_balance: totalAmount,
        }
      } catch (txErr: unknown) {
        try {
          await client.query("ROLLBACK")
        } catch {
          /* ignore rollback failure */
        }
        const message = (txErr as Error)?.message || ""
        if (message === "invalid_bank_account") {
          return { error: "invalid_bank_account" as const }
        }
        throw txErr
      }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const code = String(result.error)
      const status =
        code === "invalid_bank_account_amount" || code === "no_amounts_declared"
          ? 400
          : code === "invalid_bank_account"
            ? 404
            : code === "daily_report_already_filed"
              ? 409
              : 403
      return NextResponse.json({ error: code }, { status })
    }

    apiLog("info", "finances.daily_report.create.success", {
      method: "POST",
      apiPath,
      status: 201,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.daily_report.create.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
