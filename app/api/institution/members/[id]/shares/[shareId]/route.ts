import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { createTransaction } from "@/lib/transactions/create-transaction"
import {
  assertMemberAndBranchActive,
  memberRouteDenialBody,
  memberRouteHttpStatus,
  type MemberRouteHttpStatusGroups,
} from "@/lib/members/member-status"
import {
  settlePaymentByMode,
  PaymentSettlementFailure,
} from "@/lib/finances/settle-payment-mode"
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice"
import {
  recordInvoicePayment,
  cancelInvoicePaymentByTransactionId,
  getInvoicePaidAmount,
} from "@/lib/invoices/invoice-payments"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SHARES_STATUS_GROUPS: MemberRouteHttpStatusGroups = {
  forbidden: ["forbidden", "no_app_user", "missing_permission:edit_shares", SUPER_ADMIN_WRITE_BLOCKED],
  notFound: ["member_not_found", "shares_not_found", "institution_not_found", "bank_account_not_found"],
  badRequest: [
    "invalid_action_type",
    "invalid_number_of_shares",
    "share_record_already_cancelled",
    "shares_already_transferred_or_sold",
    "shares_disabled",
    "share_value_not_configured",
    "invalid_mode",
    "invalid_payment_date",
    "payment_date_in_future",
    "reference_number_required",
    "bank_account_required",
    "bank_account_not_found",
    "invalid_settlement_amount",
    "insufficient_bank_balance",
    "insufficient_cash_balance",
    "insufficient_mobile_money_balance",
    "insufficient_shares",
    "insufficient_account_balance",
  ],
  serverError: ["shares_transaction_failed"],
  defaultStatus: 400,
}

function sharesDenialResponse(
  result: Record<string, unknown>,
  groups: MemberRouteHttpStatusGroups = SHARES_STATUS_GROUPS,
) {
  const error = String(result.error)
  return NextResponse.json(
    memberRouteDenialBody({
      error,
      memberStatus: result.memberStatus as never,
      branchStatus: result.branchStatus as never,
      message: typeof result.message === "string" ? result.message : undefined,
      detail: typeof result.detail === "string" ? result.detail : undefined,
    }),
    { status: memberRouteHttpStatus(error, groups) },
  )
}

/**
 * DELETE /api/institution/members/[id]/shares/[shareId]
 * Voids a member share record:
 * 1. Checks downstream movements (cannot void if shares already transferred/sold).
 * 2. Cancels linked transactions and settles branch outflow via settlePaymentByMode.
 * 3. Cancels linked invoice payment and re-syncs the invoice.
 * 4. Marks member_shares as 'cancelled' with remaining_shares = 0.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId, shareId } = await params
    if (!memberId || !UUID_REGEX.test(memberId) || !shareId || !UUID_REGEX.test(shareId)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.void.denied", { method: "DELETE", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.void.denied", { method: "DELETE", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    let voidReason = "Voided by staff"
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.reason && typeof body.reason === "string") {
        voidReason = body.reason.trim()
      }
    } catch {
      // Body is optional
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }

      const notSuperAdmin = assertNotSuperAdmin(actor)
      if (!notSuperAdmin.ok) return notSuperAdmin

      const allowed = await hasPermission(client, actor, "edit_shares")
      if (!allowed) return { error: "missing_permission:edit_shares" as const }

      const memberGate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (!memberGate.ok) return memberGate

      await client.query("BEGIN")
      try {
        // 1. Lock member share row
        const shareRes = await client.query(
          `SELECT ms.*, t.transaction_number, t.mode, t.date AS tx_date, t.amount AS tx_amount, t.bank_account_id, t.reference_number
             FROM member_shares ms
             LEFT JOIN transactions t ON t.id = ms.transaction_id
            WHERE ms.id = $1 AND ms.member_id = $2
            FOR UPDATE`,
          [shareId, memberId],
        )
        const shareRow = shareRes.rows[0]
        if (!shareRow) {
          await client.query("ROLLBACK")
          return { error: "shares_not_found" as const }
        }

        if (shareRow.status === "cancelled") {
          await client.query("ROLLBACK")
          return { error: "share_record_already_cancelled" as const }
        }

        const acqType = String(shareRow.acquisition_type || "purchase").toLowerCase().trim()
        const sharesCount = Number(shareRow.number_of_shares || 0)
        const remainingShares = Number(shareRow.remaining_shares || 0)
        const totalValue = Number(shareRow.total_value || 0)

        // 2. Downstream movements guard: cannot void if shares were already transferred or sold
        if (acqType === "purchase" || acqType === "transfer_in" || acqType === "buy") {
          if (remainingShares < sharesCount) {
            await client.query("ROLLBACK")
            return {
              error: "shares_already_transferred_or_sold" as const,
              detail: `Cannot void: ${sharesCount - remainingShares} of these shares have already been transferred or sold.`,
            }
          }
        }

        // 3. Roll back financial transactions & balances
        if (shareRow.transaction_id && totalValue > 0) {
          // Cancel transaction row
          await client.query(
            `UPDATE transactions
                SET status = 'Cancelled',
                    description = COALESCE(description, '') || ' [Cancelled: ' || $1 || ']',
                    updated_at = NOW()
              WHERE id = $2`,
            [voidReason, shareRow.transaction_id],
          )

          // Cancel invoice payment and sync invoice
          const { invoiceId } = await cancelInvoicePaymentByTransactionId(client, shareRow.transaction_id, {
            institutionId: actor.institution_id,
            branchId: memberGate.member.branch_id,
            userId: actor.id,
          })

          if (invoiceId) {
            const paid = await getInvoicePaidAmount(client, invoiceId)
            if (paid <= 0) {
              const invRes = await client.query(
                `SELECT invoice_type, (SELECT description FROM invoice_items WHERE invoice_id = invoices.id LIMIT 1) AS item_desc
                   FROM invoices WHERE id = $1`,
                [invoiceId],
              )
              const itemDesc = (invRes.rows[0]?.item_desc || "").toLowerCase()
              const isRegistrationInvoice = /minimum shares/i.test(itemDesc)
              if (!isRegistrationInvoice) {
                await client.query(
                  `UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
                  [invoiceId],
                )
              }
            }
          }

          // Settle reversal via outflow using settlePaymentByMode (no negative amount)
          await settlePaymentByMode(client, {
            institutionId: actor.institution_id,
            branchId: memberGate.member.branch_id,
            amount: totalValue,
            mode: shareRow.mode || "Cash",
            flow: "outflow",
            actor,
            bankAccountId: shareRow.bank_account_id || null,
            referenceNumber: shareRow.reference_number || shareRow.transaction_number || `VOID-${shareRow.transaction_id.slice(0, 8)}`,
          })
        }

        // 4. Handle twin records if transfer or buy_off
        const moveRes = await client.query(
          `SELECT sm.*, ms_from.member_id AS from_member_id, ms_to.member_id AS to_member_id
             FROM share_movements sm
             JOIN member_shares ms_from ON sm.from_member_shares_id = ms_from.id
             JOIN member_shares ms_to ON sm.to_member_shares_id = ms_to.id
            WHERE sm.from_member_shares_id = $1 OR sm.to_member_shares_id = $1
            FOR UPDATE`,
          [shareId],
        )
        const move = moveRes.rows[0]
        if (move) {
          // If transfer: restore sender's shares and deduct recipient's shares
          if (move.move_type === "transfer") {
            await client.query(
              `UPDATE member_shares
                  SET remaining_shares = remaining_shares + $1,
                      status = CASE WHEN id = $2 THEN 'cancelled' ELSE status END,
                      updated_at = NOW()
                WHERE id = $3`,
              [sharesCount, shareId, move.from_member_shares_id],
            )
            await client.query(
              `UPDATE member_shares
                  SET remaining_shares = remaining_shares - $1,
                      status = CASE WHEN id = $2 THEN 'cancelled' ELSE status END,
                      updated_at = NOW()
                WHERE id = $3`,
              [sharesCount, shareId, move.to_member_shares_id],
            )
          } else if (move.move_type === "buy_out") {
            // Restore seller's shares and deduct buyer's shares
            await client.query(
              `UPDATE member_shares
                  SET remaining_shares = remaining_shares + $1,
                      status = CASE WHEN id = $2 THEN 'cancelled' ELSE status END,
                      updated_at = NOW()
                WHERE id = $3`,
              [sharesCount, shareId, move.from_member_shares_id],
            )
            await client.query(
              `UPDATE member_shares
                  SET remaining_shares = remaining_shares - $1,
                      status = CASE WHEN id = $2 THEN 'cancelled' ELSE status END,
                      updated_at = NOW()
                WHERE id = $3`,
              [sharesCount, shareId, move.to_member_shares_id],
            )

            // Revert savings account balances if settled via savings
            if (move.buyer_account_transaction_id) {
              const bTxRes = await client.query(
                `SELECT account_id FROM transactions WHERE id = $1`,
                [move.buyer_account_transaction_id],
              )
              const bAccId = bTxRes.rows[0]?.account_id
              if (bAccId) {
                await client.query(
                  `UPDATE savings_accounts
                      SET available_balance = available_balance + $1,
                          total_balance = total_balance + $1,
                          updated_at = NOW()
                    WHERE id = $2`,
                  [totalValue, bAccId],
                )
              }
              await client.query(
                `UPDATE transactions SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`,
                [move.buyer_account_transaction_id],
              )
            }

            if (move.seller_account_transaction_id) {
              const sTxRes = await client.query(
                `SELECT account_id FROM transactions WHERE id = $1`,
                [move.seller_account_transaction_id],
              )
              const sAccId = sTxRes.rows[0]?.account_id
              if (sAccId) {
                await client.query(
                  `UPDATE savings_accounts
                      SET available_balance = available_balance - $1,
                          total_balance = total_balance - $1,
                          updated_at = NOW()
                    WHERE id = $2`,
                  [totalValue, sAccId],
                )
              }
              await client.query(
                `UPDATE transactions SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`,
                [move.seller_account_transaction_id],
              )
            }
          }
        }

        // 5. Update target share row to cancelled
        await client.query(
          `UPDATE member_shares
              SET status = 'cancelled',
                  remaining_shares = 0,
                  updated_at = NOW()
            WHERE id = $1`,
          [shareId],
        )

        // 6. Audit logging
        await auditLogger.logUpdate(
          "member_shares",
          shareId,
          { status: shareRow.status, remaining_shares: remainingShares },
          { status: "cancelled", remaining_shares: 0, void_reason: voidReason },
          actor.institution_id,
          actor.id,
          { branch_id: memberGate.member.branch_id },
          client,
        )

        await client.query("COMMIT")
        return { ok: true, message: "Share record voided successfully" }
      } catch (err: unknown) {
        await client.query("ROLLBACK")
        if (err instanceof PaymentSettlementFailure) {
          return { error: err.code }
        }
        const e = err as Error
        apiLog("error", "member.shares.void.rollback", { method: "DELETE", apiPath, memberId, shareId, error: e.message })
        return { error: "shares_transaction_failed" as const, detail: e.message }
      }
    })

    if (result && "error" in result) {
      return sharesDenialResponse(result as Record<string, unknown>)
    }

    apiLog("info", "member.shares.void.success", { method: "DELETE", apiPath, status: 200, memberId, shareId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.void.error", { method: "DELETE", apiPath, status: 500, error: err.message })
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * PUT /api/institution/members/[id]/shares/[shareId]
 * Edits a share record (Purchase, Transfer, or Buy-Off) using the "Void & Supersede" / "Cancel & Re-issue" pattern:
 * 1. Checks downstream movements & min/max holding limits.
 * 2. If numberOfShares === 0, cancels the record (identical to void).
 * 3. Calculates the settlement difference (valueDifference = newTotalValue - oldTotalValue).
 * 4. Adjusts financial ledger / savings / bank accounts via settlePaymentByMode using inflow & outflow flows.
 * 5. Re-issues new transaction and invoice payment with updated details.
 * 6. Updates member_shares (and counterparty twin if applicable) and audits the change.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId, shareId } = await params
    if (!memberId || !UUID_REGEX.test(memberId) || !shareId || !UUID_REGEX.test(shareId)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.edit.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.edit.denied", { method: "PUT", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const rawAction = String(body.actionType || "").toLowerCase().trim()
    const rawShares = body.numberOfShares
    const numberOfShares = Number(rawShares)

    if (rawShares === undefined || rawShares === null || Number.isNaN(numberOfShares) || numberOfShares < 0 || !Number.isInteger(numberOfShares)) {
      return NextResponse.json({ error: "invalid_number_of_shares" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }

      const notSuperAdmin = assertNotSuperAdmin(actor)
      if (!notSuperAdmin.ok) return notSuperAdmin

      const allowed = await hasPermission(client, actor, "edit_shares")
      if (!allowed) return { error: "missing_permission:edit_shares" as const }

      const memberGate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (!memberGate.ok) return memberGate

      await client.query("BEGIN")
      try {
        // 1. Lock existing share row
        const shareRes = await client.query(
          `SELECT ms.*, t.transaction_number, t.mode, t.date AS tx_date, t.amount AS tx_amount, t.bank_account_id, t.reference_number
             FROM member_shares ms
             LEFT JOIN transactions t ON t.id = ms.transaction_id
            WHERE ms.id = $1 AND ms.member_id = $2
            FOR UPDATE`,
          [shareId, memberId],
        )
        const oldShare = shareRes.rows[0]
        if (!oldShare) {
          await client.query("ROLLBACK")
          return { error: "shares_not_found" as const }
        }

        if (oldShare.status === "cancelled") {
          await client.query("ROLLBACK")
          return { error: "share_record_already_cancelled" as const }
        }

        const acqType = String(oldShare.acquisition_type || "purchase").toLowerCase().trim()
        const isTransfer =
          rawAction === "transfer" ||
          acqType === "transfer" ||
          acqType === "transfer_in" ||
          acqType === "transfer_out"

        const isBuyOff =
          rawAction === "buy_off" ||
          rawAction === "buy_out" ||
          rawAction === "sell" ||
          rawAction === "buy" ||
          acqType === "sell" ||
          acqType === "buy" ||
          acqType === "buy_out" ||
          acqType === "buy_off"

        const oldShares = Number(oldShare.number_of_shares || 0)
        const oldRemainingShares = Number(oldShare.remaining_shares || 0)
        const oldTotalValue = Number(oldShare.total_value || 0)

        // 2. Resolve branch configuration
        const cfgRes = await client.query(
          `SELECT shares, share_value, minimum_shares, maximum_shares, currency, invoice_overdue_period
             FROM config
            WHERE branch_id = $1
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1`,
          [memberGate.member.branch_id],
        )
        const cfg = cfgRes.rows[0] || {}
        if (cfg.shares === "false") {
          await client.query("ROLLBACK")
          return { error: "shares_disabled" as const }
        }

        const minShares = cfg.minimum_shares != null ? Number(cfg.minimum_shares) : undefined
        const maxShares = cfg.maximum_shares != null ? Number(cfg.maximum_shares) : undefined
        const valuePerShare = Number(body.shareValue || oldShare.share_value || cfg.share_value || 0)
        if (valuePerShare <= 0 && numberOfShares > 0) {
          await client.query("ROLLBACK")
          return { error: "share_value_not_configured" as const }
        }

        const newTotalValue = numberOfShares * valuePerShare
        const valueDifference = newTotalValue - oldTotalValue
        const sharesDifference = numberOfShares - oldShares

        // 3. Downstream reduction check: if reducing, member must still hold enough remaining shares
        const reduction = oldShares - numberOfShares
        if (reduction > 0 && oldRemainingShares < reduction) {
          await client.query("ROLLBACK")
          return {
            error: "shares_already_transferred_or_sold" as const,
            detail: `Cannot reduce: ${oldShares - oldRemainingShares} of these shares have already been transferred or sold.`,
          }
        }

        // 4. Holding constraints check (min/max)
        if (numberOfShares > 0 && !isTransfer) {
          const otherSharesRes = await client.query(
            `SELECT COALESCE(SUM(number_of_shares), 0)::int AS other_shares
               FROM member_shares
              WHERE member_id = $1 AND id <> $2 AND status = 'active'`,
            [memberId, shareId],
          )
          const otherShares = Number(otherSharesRes.rows[0]?.other_shares || 0)
          const projectedTotal = otherShares + numberOfShares

          if (minShares !== undefined && projectedTotal < minShares) {
            await client.query("ROLLBACK")
            return { error: `minimum_shares_${minShares}` as const }
          }
          if (maxShares !== undefined && projectedTotal > maxShares) {
            await client.query("ROLLBACK")
            return { error: `maximum_shares_${maxShares}` as const }
          }
        }

        // 5. If numberOfShares === 0, eliminate/cancel the share record
        if (numberOfShares === 0) {
          // Roll back old transaction & invoice
          if (oldShare.transaction_id && oldTotalValue > 0) {
            await client.query(
              `UPDATE transactions
                  SET status = 'Cancelled',
                      description = COALESCE(description, '') || ' [Cancelled & Eliminated during edit]',
                      updated_at = NOW()
                WHERE id = $1`,
              [oldShare.transaction_id],
            )
            await cancelInvoicePaymentByTransactionId(client, oldShare.transaction_id, {
              institutionId: actor.institution_id,
              branchId: memberGate.member.branch_id,
              userId: actor.id,
            })

            // Settle reversal via outflow using settlePaymentByMode (no negative amount)
            await settlePaymentByMode(client, {
              institutionId: actor.institution_id,
              branchId: memberGate.member.branch_id,
              amount: oldTotalValue,
              mode: oldShare.mode || "Cash",
              flow: "outflow",
              actor,
              bankAccountId: oldShare.bank_account_id || null,
              referenceNumber: oldShare.reference_number || oldShare.transaction_number || `VOID-${oldShare.transaction_id.slice(0, 8)}`,
            })
          }

          await client.query(
            `UPDATE member_shares
                SET status = 'cancelled',
                    number_of_shares = 0,
                    total_value = 0,
                    remaining_shares = 0,
                    updated_at = NOW()
              WHERE id = $1`,
            [shareId],
          )

          await auditLogger.logUpdate(
            "member_shares",
            shareId,
            { number_of_shares: oldShares, status: oldShare.status },
            { number_of_shares: 0, status: "cancelled", reason: "Eliminated during edit" },
            actor.institution_id,
            actor.id,
            { branch_id: memberGate.member.branch_id },
            client,
          )

          await client.query("COMMIT")
          return {
            ok: true,
            voided: true,
            message: "Share record set to 0 and cancelled",
            settlement: {
              previousTotalValue: oldTotalValue,
              newTotalValue: 0,
              valueDifference: -oldTotalValue,
              sharesDifference: -oldShares,
            },
          }
        }

        // =====================================================================
        // 6. ACTION BRANCHING: BUY-OFF vs TRANSFER vs PURCHASE
        // =====================================================================
        if (isBuyOff) {
          // BUY-OFF / BUY-OUT EDIT
          const moveRes = await client.query(
            `SELECT sm.*,
                    ms_from.id AS from_id, ms_from.member_id AS from_member_id, ms_from.number_of_shares AS from_shares, ms_from.remaining_shares AS from_remaining,
                    ms_to.id AS to_id, ms_to.member_id AS to_member_id, ms_to.number_of_shares AS to_shares, ms_to.remaining_shares AS to_remaining
               FROM share_movements sm
               JOIN member_shares ms_from ON sm.from_member_shares_id = ms_from.id
               JOIN member_shares ms_to ON sm.to_member_shares_id = ms_to.id
              WHERE sm.from_member_shares_id = $1 OR sm.to_member_shares_id = $1
              FOR UPDATE`,
            [shareId],
          )
          const move = moveRes.rows[0]

          if (move) {
            // Check seller remaining shares if increasing buy_off
            if (sharesDifference > 0 && Number(move.from_remaining) < sharesDifference) {
              await client.query("ROLLBACK")
              return { error: "insufficient_shares" as const }
            }
            // Check buyer remaining shares if reducing buy_off
            if (sharesDifference < 0 && Number(move.to_remaining) < Math.abs(sharesDifference)) {
              await client.query("ROLLBACK")
              return { error: "shares_already_transferred_or_sold" as const }
            }
          }

          // Handle savings account settlement difference if settled via savings, or bank/cash adjustment via settlePaymentByMode
          if (move && valueDifference !== 0) {
            if (move.buyer_account_transaction_id) {
              const bTxRes = await client.query(
                `SELECT account_id FROM transactions WHERE id = $1`,
                [move.buyer_account_transaction_id],
              )
              const bAccId = bTxRes.rows[0]?.account_id
              if (bAccId) {
                // If valueDifference > 0: buyer must pay more (debit buyer)
                if (valueDifference > 0) {
                  const bBalRes = await client.query(
                    `SELECT available_balance FROM savings_accounts WHERE id = $1 FOR UPDATE`,
                    [bAccId],
                  )
                  if (Number(bBalRes.rows[0]?.available_balance ?? 0) < valueDifference) {
                    await client.query("ROLLBACK")
                    return { error: "insufficient_account_balance" as const }
                  }
                  await client.query(
                    `UPDATE savings_accounts
                        SET available_balance = available_balance - $1,
                            total_balance = total_balance - $1,
                            updated_at = NOW()
                      WHERE id = $2`,
                    [valueDifference, bAccId],
                  )
                } else {
                  // valueDifference < 0: refund buyer
                  await client.query(
                    `UPDATE savings_accounts
                        SET available_balance = available_balance + $1,
                            total_balance = total_balance + $1,
                            updated_at = NOW()
                      WHERE id = $2`,
                    [Math.abs(valueDifference), bAccId],
                  )
                }
              }
            } else {
              // Buyer paid via Cash or Bank Transfer float: settle via inflow / outflow
              const txMode = oldShare.mode || "Cash"
              if (valueDifference > 0) {
                // Inflow: buyer pays additional difference to branch float (positive amount)
                await settlePaymentByMode(client, {
                  institutionId: actor.institution_id,
                  branchId: memberGate.member.branch_id,
                  amount: valueDifference,
                  mode: txMode,
                  flow: "inflow",
                  actor,
                  bankAccountId: oldShare.bank_account_id || null,
                  referenceNumber: oldShare.reference_number || oldShare.transaction_number || `BUYOFF-IN-${shareId.slice(0, 8)}`,
                })
              } else if (valueDifference < 0) {
                // Outflow: branch float refunds excess difference to buyer (positive amount)
                await settlePaymentByMode(client, {
                  institutionId: actor.institution_id,
                  branchId: memberGate.member.branch_id,
                  amount: Math.abs(valueDifference),
                  mode: txMode,
                  flow: "outflow",
                  actor,
                  bankAccountId: oldShare.bank_account_id || null,
                  referenceNumber: oldShare.reference_number || oldShare.transaction_number || `BUYOFF-REF-${shareId.slice(0, 8)}`,
                })
              }
            }

            if (move.seller_account_transaction_id) {
              const sTxRes = await client.query(
                `SELECT account_id FROM transactions WHERE id = $1`,
                [move.seller_account_transaction_id],
              )
              const sAccId = sTxRes.rows[0]?.account_id
              if (sAccId) {
                if (valueDifference > 0) {
                  // Credit seller additional proceeds
                  await client.query(
                    `UPDATE savings_accounts
                        SET available_balance = available_balance + $1,
                            total_balance = total_balance + $1,
                            updated_at = NOW()
                      WHERE id = $2`,
                    [valueDifference, sAccId],
                  )
                } else {
                  // Debit seller excess proceeds (refund clawback)
                  const sBalRes = await client.query(
                    `SELECT available_balance FROM savings_accounts WHERE id = $1 FOR UPDATE`,
                    [sAccId],
                  )
                  if (Number(sBalRes.rows[0]?.available_balance ?? 0) < Math.abs(valueDifference)) {
                    await client.query("ROLLBACK")
                    return { error: "insufficient_account_balance" as const }
                  }
                  await client.query(
                    `UPDATE savings_accounts
                        SET available_balance = available_balance - $1,
                            total_balance = total_balance - $1,
                            updated_at = NOW()
                      WHERE id = $2`,
                    [Math.abs(valueDifference), sAccId],
                  )
                }
              }
            }
          }

          // Update seller and buyer member_shares records
          if (move) {
            await client.query(
              `UPDATE member_shares
                  SET number_of_shares = $1,
                      share_value = $2,
                      total_value = $3,
                      remaining_shares = remaining_shares - $4,
                      updated_at = NOW()
                WHERE id = $5`,
              [numberOfShares, valuePerShare, newTotalValue, sharesDifference, move.from_id],
            )
            await client.query(
              `UPDATE member_shares
                  SET number_of_shares = $1,
                      share_value = $2,
                      total_value = $3,
                      remaining_shares = remaining_shares + $4,
                      updated_at = NOW()
                WHERE id = $5`,
              [numberOfShares, valuePerShare, newTotalValue, sharesDifference, move.to_id],
            )
          } else {
            // Standalone update if no move link
            await client.query(
              `UPDATE member_shares
                  SET number_of_shares = $1,
                      share_value = $2,
                      total_value = $3,
                      remaining_shares = remaining_shares + $4,
                      updated_at = NOW()
                WHERE id = $5`,
              [numberOfShares, valuePerShare, newTotalValue, sharesDifference, shareId],
            )
          }

          await auditLogger.logUpdate(
            "member_shares",
            shareId,
            { number_of_shares: oldShares, total_value: oldTotalValue },
            { number_of_shares: numberOfShares, total_value: newTotalValue, value_difference: valueDifference },
            actor.institution_id,
            actor.id,
            { branch_id: memberGate.member.branch_id },
            client,
          )

          await client.query("COMMIT")
          return {
            ok: true,
            id: shareId,
            actionType: "buy_off",
            settlement: {
              previousTotalValue: oldTotalValue,
              newTotalValue,
              valueDifference,
              sharesDifference,
              settled: true,
            },
          }
        }

        if (isTransfer) {
          // PURE TRANSFER EDIT
          const moveRes = await client.query(
            `SELECT sm.*,
                    ms_from.id AS from_id, ms_from.number_of_shares AS from_shares, ms_from.remaining_shares AS from_remaining,
                    ms_to.id AS to_id, ms_to.number_of_shares AS to_shares, ms_to.remaining_shares AS to_remaining
               FROM share_movements sm
               JOIN member_shares ms_from ON sm.from_member_shares_id = ms_from.id
               JOIN member_shares ms_to ON sm.to_member_shares_id = ms_to.id
              WHERE sm.from_member_shares_id = $1 OR sm.to_member_shares_id = $1
              FOR UPDATE`,
            [shareId],
          )
          const move = moveRes.rows[0]

          if (move) {
            // Check sender remaining shares if increasing transfer
            if (sharesDifference > 0 && Number(move.from_remaining) < sharesDifference) {
              await client.query("ROLLBACK")
              return { error: "insufficient_shares" as const }
            }
            // Check recipient remaining shares if reducing transfer
            if (sharesDifference < 0 && Number(move.to_remaining) < Math.abs(sharesDifference)) {
              await client.query("ROLLBACK")
              return { error: "shares_already_transferred_or_sold" as const }
            }

            // Update sender (transfer_out)
            await client.query(
              `UPDATE member_shares
                  SET number_of_shares = $1,
                      share_value = $2,
                      total_value = $3,
                      remaining_shares = remaining_shares - $4,
                      updated_at = NOW()
                WHERE id = $5`,
              [numberOfShares, valuePerShare, newTotalValue, sharesDifference, move.from_id],
            )

            // Update recipient (transfer_in)
            await client.query(
              `UPDATE member_shares
                  SET number_of_shares = $1,
                      share_value = $2,
                      total_value = $3,
                      remaining_shares = remaining_shares + $4,
                      updated_at = NOW()
                WHERE id = $5`,
              [numberOfShares, valuePerShare, newTotalValue, sharesDifference, move.to_id],
            )
          }

          await auditLogger.logUpdate(
            "member_shares",
            shareId,
            { number_of_shares: oldShares, total_value: oldTotalValue },
            { number_of_shares: numberOfShares, total_value: newTotalValue, shares_difference: sharesDifference },
            actor.institution_id,
            actor.id,
            { branch_id: memberGate.member.branch_id },
            client,
          )

          await client.query("COMMIT")
          return {
            ok: true,
            id: shareId,
            actionType: "transfer",
            settlement: {
              previousTotalValue: oldTotalValue,
              newTotalValue,
              valueDifference,
              sharesDifference,
              settled: true,
            },
          }
        }

        // =====================================================================
        // REGULAR PURCHASE EDIT (Cancel & Re-issue)
        // =====================================================================
        // Rollback old financial effects as OUTFLOW
        if (oldShare.transaction_id && oldTotalValue > 0) {
          await client.query(
            `UPDATE transactions
                SET status = 'Cancelled',
                    description = COALESCE(description, '') || ' [Cancelled & Replaced during edit]',
                    updated_at = NOW()
              WHERE id = $1`,
            [oldShare.transaction_id],
          )

          const { invoiceId } = await cancelInvoicePaymentByTransactionId(client, oldShare.transaction_id, {
            institutionId: actor.institution_id,
            branchId: memberGate.member.branch_id,
            userId: actor.id,
          })

          if (invoiceId) {
            const paid = await getInvoicePaidAmount(client, invoiceId)
            if (paid <= 0) {
              const invRes = await client.query(
                `SELECT invoice_type, (SELECT description FROM invoice_items WHERE invoice_id = invoices.id LIMIT 1) AS item_desc
                   FROM invoices WHERE id = $1`,
                [invoiceId],
              )
              const itemDesc = (invRes.rows[0]?.item_desc || "").toLowerCase()
              const isRegistrationInvoice = /minimum shares/i.test(itemDesc)
              if (!isRegistrationInvoice) {
                await client.query(
                  `UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
                  [invoiceId],
                )
              }
            }
          }

          // Outflow reversal of old payment via settlePaymentByMode
          await settlePaymentByMode(client, {
            institutionId: actor.institution_id,
            branchId: memberGate.member.branch_id,
            amount: oldTotalValue,
            mode: oldShare.mode || "Cash",
            flow: "outflow",
            actor,
            bankAccountId: oldShare.bank_account_id || null,
            referenceNumber: oldShare.reference_number || oldShare.transaction_number || `REV-${oldShare.transaction_id.slice(0, 8)}`,
          })
        }

        // Re-issue updated financial transaction & invoice payment
        const mode = String(body.mode || oldShare.mode || "Cash").trim()
        const referenceNumber =
          typeof body.referenceNumber === "string" && body.referenceNumber.trim()
            ? body.referenceNumber.trim()
            : typeof body.reference_number === "string" && body.reference_number.trim()
              ? body.reference_number.trim()
              : (mode === "Cash" ? null : oldShare.reference_number || oldShare.transaction_number || null)

        const bankAccountId = (body.bank_account_id || oldShare.bank_account_id || "").trim() || null

        const paymentDateStr = body.paymentDate || oldShare.date || new Date().toISOString().slice(0, 10)
        const paymentDate = new Date(`${paymentDateStr}T00:00:00Z`)
        if (Number.isNaN(paymentDate.getTime())) {
          await client.query("ROLLBACK")
          return { error: "invalid_payment_date" as const }
        }
        if (paymentDate.getTime() > Date.now()) {
          await client.query("ROLLBACK")
          return { error: "payment_date_in_future" as const }
        }

        // Settle replacement payment as INFLOW through settlePaymentByMode
        const { bankAccount: resolvedBankAcc } = await settlePaymentByMode(client, {
          institutionId: actor.institution_id,
          branchId: memberGate.member.branch_id,
          amount: newTotalValue,
          charges: body.transaction_charges ? Number(body.transaction_charges) : null,
          mode,
          flow: "inflow",
          actor,
          bankAccountId,
          referenceNumber,
        })

        const newRemaining = oldRemainingShares - reduction
        const description = body.description || `Updated purchase of ${numberOfShares} share(s)`

        // Create new replacement transaction
        const newTx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: memberGate.member.branch_id,
          type: "Shares Purchase",
          amount: newTotalValue,
          mode,
          processedBy: actor.id,
          transactionDate: paymentDate,
          memberId,
          bankAccountId: resolvedBankAcc?.id ?? null,
          referenceNumber,
          charges: body.transaction_charges ? Number(body.transaction_charges) : null,
          description,
          status: "Completed",
        })

        // Create new auto-invoice and record payment
        const invoiceDueDays = Number(cfg.invoice_overdue_period || 30)
        const due = new Date(paymentDate.getTime())
        due.setUTCDate(due.getUTCDate() + Math.max(1, invoiceDueDays))
        const invoiceDue = due.toISOString().slice(0, 10)

        const newInvoice = await createInvoiceWithItems(client, {
          institutionId: actor.institution_id,
          branchId: memberGate.member.branch_id,
          createdBy: actor.id,
          invoiceDate: paymentDateStr,
          invoiceDue,
          invoiceType: "Auto",
          status: "fully paid",
          vat: 0,
          target: { member_id: memberId },
          items: [
            {
              unit: "Shares",
              description: `Share Purchase (${numberOfShares} units)`,
              quantity: numberOfShares,
              unit_price: valuePerShare,
              total_price: newTotalValue,
              vatinclusive: false,
            },
          ],
        })

        await recordInvoicePayment(client, {
          institutionId: actor.institution_id,
          branchId: memberGate.member.branch_id,
          invoiceId: newInvoice.id,
          amount: newTotalValue,
          paymentDate,
          processedBy: actor.id,
          transactionId: newTx.id,
        })

        // Update target member_shares row
        await client.query(
          `UPDATE member_shares
              SET number_of_shares = $1,
                  share_value = $2,
                  total_value = $3,
                  remaining_shares = $4,
                  transaction_id = $5,
                  date = $6,
                  status = 'active',
                  modified_by = $7,
                  updated_at = NOW()
            WHERE id = $8`,
          [
            numberOfShares,
            valuePerShare,
            newTotalValue,
            newRemaining,
            newTx.id,
            paymentDateStr,
            actor.id,
            shareId,
          ],
        )

        // Audit logging
        await auditLogger.logUpdate(
          "member_shares",
          shareId,
          {
            number_of_shares: oldShares,
            total_value: oldTotalValue,
            remaining_shares: oldRemainingShares,
            transaction_id: oldShare.transaction_id,
          },
          {
            number_of_shares: numberOfShares,
            total_value: newTotalValue,
            remaining_shares: newRemaining,
            transaction_id: newTx.id,
          },
          actor.institution_id,
          actor.id,
          { branch_id: memberGate.member.branch_id },
          client,
        )

        await client.query("COMMIT")
        return {
          ok: true,
          id: shareId,
          transaction_id: newTx.id,
          transaction_number: newTx.transactionNumber,
          invoice_number: newInvoice.invoice_number,
          actionType: "purchase",
          settlement: {
            previousTotalValue: oldTotalValue,
            newTotalValue,
            valueDifference,
            sharesDifference,
            settled: true,
          },
        }
      } catch (err: unknown) {
        await client.query("ROLLBACK")
        if (err instanceof PaymentSettlementFailure) {
          return { error: err.code }
        }
        const e = err as Error
        apiLog("error", "member.shares.edit.rollback", { method: "PUT", apiPath, memberId, shareId, error: e.message })
        return { error: "shares_transaction_failed" as const, detail: e.message }
      }
    })

    if (result && "error" in result) {
      return sharesDenialResponse(result as Record<string, unknown>)
    }

    apiLog("info", "member.shares.edit.success", { method: "PUT", apiPath, status: 200, memberId, shareId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.edit.error", { method: "PUT", apiPath, status: 500, error: err.message })
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 })
  }
}
