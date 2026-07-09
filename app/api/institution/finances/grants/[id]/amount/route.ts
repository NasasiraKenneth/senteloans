import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, type ActorContext } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditGrantUpdate, grantSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import {
  mapGrantReceiptSettlementError,
  parseGrantReceiptPayment,
  recordGrantReceipt,
  validateGrantReceiptPayment,
} from "@/lib/finances/record-grant-receipt"
import { PaymentSettlementFailure } from "@/lib/finances/settle-payment-mode"

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
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }

    const payment = parseGrantReceiptPayment(body as Record<string, unknown>)
    const paymentError = validateGrantReceiptPayment(amount, payment)
    if (paymentError) {
      return NextResponse.json({ error: paymentError }, { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editGrantAmount)
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
        `SELECT
           id,
           branch_id,
           third_party_agent_id,
           COALESCE(total_amount, 0)::numeric AS total_amount,
           COALESCE(available_balance, 0)::numeric AS available_balance
         FROM grants g
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

      const totalAmount = Number(oldRow.total_amount || 0)
      const currentAvailable = Number(oldRow.available_balance || 0)
      const remaining = Math.max(0, totalAmount - currentAvailable)

      if (totalAmount > 0 && currentAvailable >= totalAmount) {
        return {
          error: "grant_already_complete" as const,
          message: "This grant is already complete — the full pledge has been received." as const,
        }
      }

      if (amount > remaining) {
        return {
          error: "amount_exceeds_remaining" as const,
          message: "Amount received cannot exceed the remaining grant balance." as const,
        }
      }

      const actorForBranch = { ...actor, branch_id: branchScope.branchId }
      const thirdPartyAgentId = String(oldRow.third_party_agent_id || "")

      await client.query("BEGIN")
      try {
        let receipt: { transactionId: string; transactionNumber: string }
        try {
          receipt = await recordGrantReceipt({
            client,
            actor: actorForBranch,
            institutionId: actor.institution_id,
            branchId: branchScope.branchId,
            grantId,
            thirdPartyAgentId,
            amount,
            balanceBefore: currentAvailable,
            balanceAfter: currentAvailable + amount,
            payment,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            return { error: mapGrantReceiptSettlementError(e.code) as string }
          }
          throw e
        }

        const setParams: unknown[] = [amount]
        let scopedWhere = `g.id = $2::uuid AND g.institution_id = $3::uuid`
        setParams.push(grantId, actor.institution_id)
        if (!isSuperAdmin(actor)) {
          scopedWhere += ` AND g.branch_id = $4::uuid`
          setParams.push(actor.branch_id)
        }
        scopedWhere +=
          ` AND COALESCE(g.available_balance, 0) + $1 <= COALESCE(g.total_amount, 0)` +
          ` AND COALESCE(g.available_balance, 0) < COALESCE(g.total_amount, 0)`

        const updateRes = await client.query(
          `UPDATE grants g
           SET available_balance = COALESCE(available_balance, 0) + $1,
               updated_at = NOW()
           WHERE ${scopedWhere}
           RETURNING id, third_party_agent_id, total_amount, available_balance, branch_id`,
          setParams,
        )

        if ((updateRes.rowCount ?? 0) === 0) {
          return {
            error: "grant_already_complete" as const,
            message:
              "This grant has changed since you opened it. Reload the table and try again." as const,
          }
        }

        const newRow = updateRes.rows[0] as Record<string, unknown>

        await auditGrantUpdate(
          client,
          actor,
          grantId,
          grantSnapshot(oldRow),
          {
            ...grantSnapshot(newRow),
            _action: "add_amount",
            _delta: amount,
            _transaction_id: receipt.transactionId,
          },
          (newRow.branch_id as string | null | undefined) ?? (oldRow.branch_id as string | null | undefined),
        )

        await client.query("COMMIT")

        return {
          id: String(newRow.id || ""),
          available_balance: Number(newRow.available_balance || 0),
          total_amount: Number(newRow.total_amount || 0),
          transaction_id: receipt.transactionId,
          transaction_number: receipt.transactionNumber,
        }
      } catch (e: unknown) {
        await client.query("ROLLBACK")
        throw e
      }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const code = String(result.error || "")
      const status =
        code === "not_found"
          ? 404
          : code === "grant_already_complete" || code === "amount_exceeds_remaining"
            ? 409
            : code === "invalid_amount" ||
                code === "invalid_payment_mode" ||
                code === "reference_number_required" ||
                code === "bank_account_required" ||
                code === "invalid_bank_account" ||
                code === "insufficient_bank_balance" ||
                code === "insufficient_cash_balance" ||
                code === "insufficient_mobile_money_balance"
              ? 400
              : 403
      const message = "message" in result && result.message ? result.message : undefined
      return NextResponse.json({ error: result.error, ...(message ? { message } : {}) }, { status })
    }

    apiLog("info", "finances.grants.amount.update.success", { method: "PATCH", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.amount.update.error", {
      method: "PATCH",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
