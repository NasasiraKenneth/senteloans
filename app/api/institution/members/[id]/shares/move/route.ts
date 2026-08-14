import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
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
  memberWriteGateRouteError,
  type MemberRouteHttpStatusGroups,
} from "@/lib/members/member-status"
import { applyDailyFinanceEntry } from "@/lib/finances/daily-finance"
import {
  adjustBankAccountBalance,
  getBranchBankAccount,
} from "@/lib/finances/bank-account"
import { isBankRoutedPaymentMode } from "@/lib/finances/payment-mode"
import {
  notifyShareTransfer,
  notifyShareBuyOff,
} from "@/lib/notifications/share-events"
import {
  enqueueShareTransferEmails,
  enqueueShareBuyOffEmails,
} from "@/lib/email/share-emails"

type ShareTransferPostCommit = {
  type: "transfer"
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  fromMember: { id: string; full_name: string; member_number: string; email: string }
  toMember: { id: string; full_name: string; member_number: string; email: string }
  shares: { numberOfShares: number; totalValue: number }
  fromTransaction: { id: string; transaction_number: string; amount: number }
  toTransaction: { id: string; transaction_number: string; amount: number }
}

type ShareBuyOffPostCommit = {
  type: "buy_out"
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  sellerMember: { id: string; full_name: string; member_number: string; email: string }
  buyerMember: { id: string; full_name: string; member_number: string; email: string }
  shares: { numberOfShares: number; totalValue: number }
  sellerTransaction: { id: string; transaction_number: string; amount: number }
  buyerTransaction: { id: string; transaction_number: string; amount: number }
  sellerSavingsTransaction?: { id: string; transaction_number: string; amount: number; accountId?: string | null } | null
  buyerSavingsTransaction?: { id: string; transaction_number: string; amount: number; accountId?: string | null } | null
}

type ShareMovePostCommit = ShareTransferPostCommit | ShareBuyOffPostCommit

const SHARES_MOVE_STATUS_GROUPS: MemberRouteHttpStatusGroups = {
  forbidden: ["forbidden", "no_app_user", "missing_permission:edit_shares", SUPER_ADMIN_WRITE_BLOCKED],
  notFound: [
    "member_not_found",
    "target_member_not_found",
    "institution_not_found",
    "bank_account_not_found",
    "buyer_savings_account_not_found",
    "seller_savings_account_not_found",
  ],
  badRequest: [
    "invalid_action_type",
    "invalid_number_of_shares",
    "same_member_transfer",
    "target_member_not_found",
    "target_member_inactive",
    "insufficient_shares",
    "insufficient_account_balance",
    "bank_account_required",
    "reference_number_required",
    "shares_disabled",
    "share_value_not_configured",
    "invalid_date",
    "date_in_future",
  ],
  serverError: ["shares_transaction_failed"],
  defaultStatus: 400,
}

function sharesMoveDenialResponse(
  result: Record<string, unknown>,
  groups: MemberRouteHttpStatusGroups,
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId || !UUID_REGEX.test(memberId)) {
      return NextResponse.json({ error: "missing_member_id" }, { status: 400 })
    }

    const body = (await req.json()) as {
      actionType?: string
      numberOfShares?: number
      transferMemberId?: string
      buyingMemberId?: string
      sellingMemberAccountId?: string
      seller_account_id?: string
      mode?: string
      date?: string
      referenceNumber?: string
      reference_number?: string
      bank_account_id?: string
      savings_account_id?: string
      description?: string
    }

    const actionType = body?.actionType || "transfer"
    if (!["transfer", "sell", "buy_out"].includes(actionType)) {
      return NextResponse.json({ error: "invalid_action_type" }, { status: 400 })
    }

    const numberOfShares = Number(body?.numberOfShares)
    if (!Number.isInteger(numberOfShares) || numberOfShares <= 0) {
      return NextResponse.json({ error: "invalid_number_of_shares" }, { status: 400 })
    }

    // Resolve date (defaulting to today)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const dateRaw = typeof body.date === "string" ? body.date.trim() : ""
    let resolvedDate = new Date()
    if (dateRaw) {
      const parsed = new Date(dateRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "invalid_date" }, { status: 400 })
      }
      if (parsed.getTime() > today.getTime()) {
        return NextResponse.json({ error: "date_in_future" }, { status: 400 })
      }
      resolvedDate = parsed
    }
    const dateStr = resolvedDate.toISOString().slice(0, 10)

    const referenceNumberInput =
      typeof body.referenceNumber === "string"
        ? body.referenceNumber.trim()
        : typeof body.reference_number === "string"
          ? body.reference_number.trim()
          : ""

    const mode = typeof body.mode === "string" ? body.mode.trim() : "Cash"

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.move.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.move.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    let postCommit: ShareMovePostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_shares")
      if (!allowed) return { error: "missing_permission:edit_shares" as const }

      // 1. Verify source member and branch active
      const fromGate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (fromGate.ok === false) {
        return memberWriteGateRouteError(fromGate)!
      }
      const fromMemberRow = fromGate.member

      // 2. Fetch branch share config
      const cfgRes = await client.query(
        `SELECT shares, share_value, minimum_shares, maximum_shares, currency
         FROM config
         WHERE branch_id = $1
         LIMIT 1`,
        [fromMemberRow.branch_id]
      )
      const cfg = cfgRes.rows[0]
      if (!cfg) return { error: "institution_not_found" as const }

      const sharesEnabled = String(cfg.shares ?? "false").toLowerCase() === "true"
      const valuePerShare = Number(cfg.share_value ?? 0)
      const minShares = cfg.minimum_shares != null ? Number(cfg.minimum_shares) : undefined
      const maxShares = cfg.maximum_shares != null ? Number(cfg.maximum_shares) : undefined

      if (!sharesEnabled) return { error: "shares_disabled" as const }
      if (!valuePerShare || Number.isNaN(valuePerShare) || valuePerShare <= 0) {
        return { error: "share_value_not_configured" as const }
      }

      // Check valid payment modes in pg_enum
      const modeEnumRes = await client.query(
        `SELECT enumlabel
         FROM pg_enum
         WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_mode')`
      )
      const validModes = modeEnumRes.rows.map((r: { enumlabel: string }) => r.enumlabel)
      const resolvedPaymentMode = validModes.includes(mode) ? mode : "Cash"

      // Check transaction_type enum
      const txTypeEnumRes = await client.query(
        `SELECT enumlabel
         FROM pg_enum
         WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')`
      )
      const validTxTypes = txTypeEnumRes.rows.map((r: { enumlabel: string }) => r.enumlabel)

      // ==========================================
      // FLOW 1: TRANSFER SHARES TO MEMBER
      // ==========================================
      if (actionType === "transfer") {
        const transferMemberId = (body.transferMemberId || "").trim()
        if (!transferMemberId || !UUID_REGEX.test(transferMemberId)) {
          return { error: "target_member_not_found" as const }
        }
        if (transferMemberId === memberId) return { error: "same_member_transfer" as const }

        // Verify destination member and branch active
        const toGate = await assertMemberAndBranchActive(client, transferMemberId, actor.institution_id)
        if (toGate.ok === false) {
          return {
            error: toGate.error === "member_inactive" ? ("target_member_inactive" as const) : ("target_member_not_found" as const),
            memberStatus: toGate.memberStatus,
            branchStatus: toGate.branchStatus,
          }
        }
        const toMemberRow = toGate.member

        try {
          await client.query("BEGIN")

          // Lock both member rows to prevent concurrent race conditions
          await client.query("SELECT id FROM members WHERE id = ANY($1::uuid[]) FOR UPDATE", [
            [memberId, transferMemberId],
          ])

          // Get transferring member's latest remaining_shares
          const fromLatestShareRes = await client.query(
            `SELECT remaining_shares
             FROM member_shares
             WHERE member_id = $1
             ORDER BY updated_at DESC
             LIMIT 1`,
            [memberId]
          )
          const fromCurrentShares =
            fromLatestShareRes.rows.length > 0 && fromLatestShareRes.rows[0]?.remaining_shares != null
              ? Number(fromLatestShareRes.rows[0].remaining_shares)
              : 0

          if (fromCurrentShares < numberOfShares) {
            await client.query("ROLLBACK")
            return { error: "insufficient_shares" as const }
          }

          const fromProjected = fromCurrentShares - numberOfShares
          if (typeof minShares === "number" && minShares > 0 && fromProjected < minShares) {
            await client.query("ROLLBACK")
            return { error: `minimum_shares_${minShares}` as const }
          }

          // Get destination member's latest remaining_shares
          const toLatestShareRes = await client.query(
            `SELECT remaining_shares
             FROM member_shares
             WHERE member_id = $1
             ORDER BY updated_at DESC
             LIMIT 1`,
            [transferMemberId]
          )
          const toCurrentShares =
            toLatestShareRes.rows.length > 0 && toLatestShareRes.rows[0]?.remaining_shares != null
              ? Number(toLatestShareRes.rows[0].remaining_shares)
              : 0

          const toProjected = toCurrentShares + numberOfShares
          if (typeof maxShares === "number" && maxShares > 0 && toProjected > maxShares) {
            await client.query("ROLLBACK")
            return { error: `maximum_shares_${maxShares}` as const }
          }

          const totalValue = numberOfShares * valuePerShare
          const fromBalanceBefore = fromCurrentShares * valuePerShare
          const fromBalanceAfter = fromProjected * valuePerShare
          const toBalanceBefore = toCurrentShares * valuePerShare
          const toBalanceAfter = toProjected * valuePerShare

          const txType = validTxTypes.includes("Shares Transfer") ? "Shares Transfer" : "Transfer"

          // 1. First transaction: Transferring Member
          const fromTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            memberId,
            transferredToId: null,
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description: body.description || `Shares Transfer: Transferred ${numberOfShares} share(s) to ${toMemberRow.full_name}`,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: fromBalanceBefore,
            balanceAfter: fromBalanceAfter,
            processedBy: actor.id,
            transactionDate: resolvedDate.toISOString(),
            prefix: "TXN",
          })

          // 2. Insert member_shares for Transferring Member
          const fromShareRes = await client.query(
            `INSERT INTO member_shares (
               transaction_id,
               member_id,
               acquisition_type,
               transfer_type,
               transfer_member_id,
               number_of_shares,
               share_value,
               total_value,
               remaining_shares,
               date,
               status,
               created_by
             ) VALUES ($1, $2, 'transfer_out', 'to', $3, $4, $5, $6, $7, $8, 'active', $9)
             RETURNING id`,
            [
              fromTx.id,
              memberId,
              transferMemberId,
              numberOfShares,
              valuePerShare,
              totalValue,
              fromProjected,
              dateStr,
              actor.id,
            ]
          )
          const fromMemberSharesRow = fromShareRes.rows[0]
          if (fromMemberSharesRow?.id) {
            await auditLogger.logInsert(
              "member_shares",
              fromMemberSharesRow.id,
              {
                transaction_id: fromTx.id,
                member_id: memberId,
                acquisition_type: "transfer_out",
                transfer_type: "to",
                transfer_member_id: transferMemberId,
                number_of_shares: numberOfShares,
                share_value: valuePerShare,
                total_value: totalValue,
                remaining_shares: fromProjected,
                date: dateStr,
                status: "active",
                created_by: actor.id,
              },
              actor.institution_id,
              actor.id,
              { branch_id: fromMemberRow.branch_id },
              client
            )
          }

          // 3. Second transaction: Destination Member
          const toTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: toMemberRow.branch_id,
            memberId: transferMemberId,
            transferredToId: null,
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description: body.description || `Shares Transfer: Received ${numberOfShares} share(s) from ${fromMemberRow.full_name}`,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: toBalanceBefore,
            balanceAfter: toBalanceAfter,
            processedBy: actor.id,
            transactionDate: resolvedDate.toISOString(),
            prefix: "TXN",
          })

          // 4. Insert member_shares for Destination Member
          const toShareRes = await client.query(
            `INSERT INTO member_shares (
               transaction_id,
               member_id,
               acquisition_type,
               transfer_type,
               transfer_member_id,
               number_of_shares,
               share_value,
               total_value,
               remaining_shares,
               date,
               status,
               created_by
             ) VALUES ($1, $2, 'transfer_in', 'from', $3, $4, $5, $6, $7, $8, 'active', $9)
             RETURNING id`,
            [
              toTx.id,
              transferMemberId,
              memberId,
              numberOfShares,
              valuePerShare,
              totalValue,
              toProjected,
              dateStr,
              actor.id,
            ]
          )
          const toMemberSharesRow = toShareRes.rows[0]
          if (toMemberSharesRow?.id) {
            await auditLogger.logInsert(
              "member_shares",
              toMemberSharesRow.id,
              {
                transaction_id: toTx.id,
                member_id: transferMemberId,
                acquisition_type: "transfer_in",
                transfer_type: "from",
                transfer_member_id: memberId,
                number_of_shares: numberOfShares,
                share_value: valuePerShare,
                total_value: totalValue,
                remaining_shares: toProjected,
                date: dateStr,
                status: "active",
                created_by: actor.id,
              },
              actor.institution_id,
              actor.id,
              { branch_id: toMemberRow.branch_id },
              client
            )
          }

          // 5. Insert movement record into share_movements
          const movementRes = await client.query(
            `INSERT INTO share_movements (
               from_member_shares_id,
               to_member_shares_id,
               move_type
             ) VALUES ($1, $2, 'transfer')
             RETURNING id`,
            [fromMemberSharesRow.id, toMemberSharesRow.id]
          )
          const movementRow = movementRes.rows[0]
          if (movementRow?.id) {
            await auditLogger.logInsert(
              "share_movements",
              movementRow.id,
              {
                from_member_shares_id: fromMemberSharesRow.id,
                to_member_shares_id: toMemberSharesRow.id,
                move_type: "transfer",
              },
              actor.institution_id,
              actor.id,
              { branch_id: fromMemberRow.branch_id },
              client
            )
          }

          // Resolve institution name for post-commit notifications/emails.
          const instRes = await client.query<{ name: string }>(
            `SELECT name FROM institutions WHERE id = $1`,
            [actor.institution_id],
          )
          const institutionName = instRes.rows[0]?.name || ""

          postCommit = {
            type: "transfer",
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            institutionName,
            currency: String(cfg.currency || "UGX"),
            fromMember: {
              id: String(fromMemberRow.id),
              full_name: String(fromMemberRow.full_name || ""),
              member_number: String(fromMemberRow.member_number || ""),
              email: fromMemberRow.email ? String(fromMemberRow.email) : "",
            },
            toMember: {
              id: String(toMemberRow.id),
              full_name: String(toMemberRow.full_name || ""),
              member_number: String(toMemberRow.member_number || ""),
              email: toMemberRow.email ? String(toMemberRow.email) : "",
            },
            shares: { numberOfShares, totalValue },
            fromTransaction: {
              id: fromTx.id,
              transaction_number: fromTx.transactionNumber,
              amount: totalValue,
            },
            toTransaction: {
              id: toTx.id,
              transaction_number: toTx.transactionNumber,
              amount: totalValue,
            },
          }

          await client.query("COMMIT")

          return {
            success: true,
            from_member_shares_id: fromMemberSharesRow.id,
            to_member_shares_id: toMemberSharesRow.id,
            share_movement_id: movementRow?.id,
            from_transaction_id: fromTx.id,
            to_transaction_id: toTx.id,
            numberOfShares,
            totalValue,
          }
        } catch (txErr) {
          await client.query("ROLLBACK")
          throw txErr
        }
      }

      // ==========================================
      // FLOW 2: BUY OUT / LIQUIDATE SHARES
      // ==========================================
      if (actionType === "sell" || actionType === "buy_out") {
        const buyingMemberId = (body.buyingMemberId || body.transferMemberId || "").trim()
        if (!buyingMemberId || !UUID_REGEX.test(buyingMemberId)) {
          return { error: "target_member_not_found" as const }
        }
        if (buyingMemberId === memberId) {
          return { error: "same_member_transfer" as const }
        }

        // Verify buying member and branch active
        const toGate = await assertMemberAndBranchActive(client, buyingMemberId, actor.institution_id)
        if (toGate.ok === false) {
          return {
            error: toGate.error === "member_inactive" ? ("target_member_inactive" as const) : ("target_member_not_found" as const),
            memberStatus: toGate.memberStatus,
            branchStatus: toGate.branchStatus,
          }
        }
        const toMemberRow = toGate.member

        const totalValue = numberOfShares * valuePerShare
        const isSavingsAccountMode = mode === "Savings Account"
        const isBankRouted = isBankRoutedPaymentMode(resolvedPaymentMode)
        const bankAccountId = (body.bank_account_id || "").trim()

        if (isBankRouted && !bankAccountId) {
          return { error: "bank_account_required" as const }
        }

        try {
          await client.query("BEGIN")

          // Lock both member rows to prevent race conditions
          await client.query("SELECT id FROM members WHERE id = ANY($1::uuid[]) FOR UPDATE", [
            [memberId, buyingMemberId],
          ])

          // Get selling member's latest remaining_shares
          const sellerLatestShareRes = await client.query(
            `SELECT remaining_shares
             FROM member_shares
             WHERE member_id = $1
             ORDER BY updated_at DESC
             LIMIT 1`,
            [memberId]
          )
          const sellerCurrentShares =
            sellerLatestShareRes.rows.length > 0 && sellerLatestShareRes.rows[0]?.remaining_shares != null
              ? Number(sellerLatestShareRes.rows[0].remaining_shares)
              : 0

          if (sellerCurrentShares < numberOfShares) {
            await client.query("ROLLBACK")
            return { error: "insufficient_shares" as const }
          }

          const sellerProjected = sellerCurrentShares - numberOfShares
          const sellerBalanceBefore = sellerCurrentShares * valuePerShare
          const sellerBalanceAfter = sellerProjected * valuePerShare

          // Get buying member's latest remaining_shares
          const buyerLatestShareRes = await client.query(
            `SELECT remaining_shares
             FROM member_shares
             WHERE member_id = $1
             ORDER BY updated_at DESC
             LIMIT 1`,
            [buyingMemberId]
          )
          const buyerCurrentShares =
            buyerLatestShareRes.rows.length > 0 && buyerLatestShareRes.rows[0]?.remaining_shares != null
              ? Number(buyerLatestShareRes.rows[0].remaining_shares)
              : 0

          const buyerProjected = buyerCurrentShares + numberOfShares
          if (typeof maxShares === "number" && maxShares > 0 && buyerProjected > maxShares) {
            await client.query("ROLLBACK")
            return { error: `maximum_shares_${maxShares}` as const }
          }

          const buyerBalanceBefore = buyerCurrentShares * valuePerShare
          const buyerBalanceAfter = buyerProjected * valuePerShare

          let sellerAccountTransactionId: string | null = null
          let buyerAccountTransactionId: string | null = null
          let sellerAccId: string | null = null
          let buyerAccId: string | null = null
          let sellerAccTx: { id: string; transactionNumber: string } | null = null
          let buyerAccTx: { id: string; transactionNumber: string } | null = null

          // 1. Resolve & lock selling member savings account (all payout modes credit seller account)
          const sellerAccIdInput = (body.sellingMemberAccountId || body.seller_account_id || "").trim()
          let sellerAccQuery = `SELECT id, available_balance, total_balance, status FROM savings_accounts WHERE member_id = $1 AND status = 'Active'`
          const sellerAccParams: unknown[] = [memberId]
          if (sellerAccIdInput && UUID_REGEX.test(sellerAccIdInput)) {
            sellerAccQuery += ` AND id = $2`
            sellerAccParams.push(sellerAccIdInput)
          }
          sellerAccQuery += ` ORDER BY created_at ASC LIMIT 1 FOR UPDATE`

          const sellerAccRes = await client.query(sellerAccQuery, sellerAccParams)
          const sellerAcc = sellerAccRes.rows[0]
          if (!sellerAcc) {
            await client.query("ROLLBACK")
            return { error: "seller_savings_account_not_found" as const }
          }

          sellerAccId = String(sellerAcc.id)
          const sellerAccBefore = Number(sellerAcc.available_balance ?? 0)
          const sellerAccAfter = sellerAccBefore + totalValue

          // Credit seller savings account
          await client.query(
            `UPDATE savings_accounts
                SET available_balance = available_balance + $1,
                    total_balance = total_balance + $1,
                    last_transaction_date = $2,
                    updated_at = NOW()
              WHERE id = $3`,
            [totalValue, dateStr, sellerAccId]
          )

          // Create transaction for selling member's savings account
          sellerAccTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            memberId,
            accountId: sellerAccId,
            transferredToId: null,
            bankAccountId: isBankRouted ? bankAccountId : null,
            type: "Deposit",
            amount: totalValue,
            mode: resolvedPaymentMode,
            description: `Shares Buy off: Proceeds of ${numberOfShares} share(s) sold to ${toMemberRow.full_name}`,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: sellerAccBefore,
            balanceAfter: sellerAccAfter,
            processedBy: actor.id,
            transactionDate: resolvedDate.toISOString(),
            prefix: "TXN",
          })
          sellerAccountTransactionId = sellerAccTx.id

          // 2. Handle Buyer Account if Savings Account payout mode
          if (isSavingsAccountMode) {
            const buyerAccIdInput = (body.savings_account_id || "").trim()
            let buyerAccQuery = `SELECT id, available_balance, total_balance, status FROM savings_accounts WHERE member_id = $1 AND status = 'Active'`
            const buyerAccParams: unknown[] = [buyingMemberId]
            if (buyerAccIdInput && UUID_REGEX.test(buyerAccIdInput)) {
              buyerAccQuery += ` AND id = $2`
              buyerAccParams.push(buyerAccIdInput)
            }
            buyerAccQuery += ` ORDER BY created_at ASC LIMIT 1 FOR UPDATE`

            const buyerAccRes = await client.query(buyerAccQuery, buyerAccParams)
            const buyerAcc = buyerAccRes.rows[0]
            if (!buyerAcc) {
              await client.query("ROLLBACK")
              return { error: "buyer_savings_account_not_found" as const }
            }

            const buyerAccAvailable = Number(buyerAcc.available_balance ?? 0)
            if (buyerAccAvailable < totalValue) {
              await client.query("ROLLBACK")
              return { error: "insufficient_account_balance" as const }
            }

            buyerAccId = String(buyerAcc.id)
            const buyerAccBefore = buyerAccAvailable
            const buyerAccAfter = buyerAccBefore - totalValue

            // Debit buyer savings account (the cut)
            await client.query(
              `UPDATE savings_accounts
                  SET available_balance = available_balance - $1,
                      total_balance = total_balance - $1,
                      last_transaction_date = $2,
                      updated_at = NOW()
                WHERE id = $3`,
              [totalValue, dateStr, buyerAccId]
            )

            // Create transaction for buying member's savings account (the cut)
            buyerAccTx = await createTransaction(client, {
              institutionId: actor.institution_id,
              branchId: toMemberRow.branch_id,
              memberId: buyingMemberId,
              accountId: buyerAccId,
              transferredToId: null,
              type: "Withdrawal",
              amount: totalValue,
              mode: "Cash",
              description: `Shares Buy off: Payment for ${numberOfShares} share(s) purchased from ${fromMemberRow.full_name}`,
              referenceNumber: referenceNumberInput || null,
              balanceBefore: buyerAccBefore,
              balanceAfter: buyerAccAfter,
              processedBy: actor.id,
              transactionDate: resolvedDate.toISOString(),
              prefix: "TXN",
            })
            buyerAccountTransactionId = buyerAccTx.id
          } else {
            // Non-savings mode: Perform branch finances settlement (inflow)
            if (isBankRouted) {
              const bankAccount = await getBranchBankAccount(client, {
                bankAccountId,
                institutionId: actor.institution_id,
                branchId: fromMemberRow.branch_id,
              })
              if (!bankAccount) {
                await client.query("ROLLBACK")
                return { error: "bank_account_not_found" as const }
              }

              await adjustBankAccountBalance(client, {
                account: bankAccount,
                amount: totalValue,
                actor,
              })

              await applyDailyFinanceEntry(client, {
                institutionId: actor.institution_id,
                branchId: fromMemberRow.branch_id,
                amount: 0,
                mode: resolvedPaymentMode,
                actor,
              })
            } else {
              // Cash or Mobile Money float adjustment (inflow)
              await applyDailyFinanceEntry(client, {
                institutionId: actor.institution_id,
                branchId: fromMemberRow.branch_id,
                amount: totalValue,
                mode: resolvedPaymentMode,
                actor,
              })
            }
          }

          const txType = validTxTypes.includes("Shares Buy off")
            ? "Shares Buy off"
            : validTxTypes.includes("Shares Purchase")
              ? "Shares Purchase"
              : "Deposit"

          // 1. Transaction for BUYING Member (Shares Holding)
          const buyerTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: toMemberRow.branch_id,
            memberId: buyingMemberId,
            accountId: null,
            transferredToId: null,
            bankAccountId: isBankRouted ? bankAccountId : null,
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description:
              body.description ||
              `Shares Buy off: Purchased ${numberOfShares} share(s) from ${fromMemberRow.full_name}`,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: buyerBalanceBefore,
            balanceAfter: buyerBalanceAfter,
            processedBy: actor.id,
            transactionDate: resolvedDate.toISOString(),
            prefix: "TXN",
          })

          // 2. Insert buying member record into member_shares
          const buyerShareRes = await client.query(
            `INSERT INTO member_shares (
               transaction_id,
               member_id,
               acquisition_type,
               transfer_type,
               transfer_member_id,
               number_of_shares,
               share_value,
               total_value,
               remaining_shares,
               date,
               status,
               created_by
             ) VALUES ($1, $2, 'buy', 'from', $3, $4, $5, $6, $7, $8, 'active', $9)
             RETURNING id`,
            [
              buyerTx.id,
              buyingMemberId,
              memberId,
              numberOfShares,
              valuePerShare,
              totalValue,
              buyerProjected,
              dateStr,
              actor.id,
            ]
          )
          const buyerMemberSharesRow = buyerShareRes.rows[0]
          if (buyerMemberSharesRow?.id) {
            await auditLogger.logInsert(
              "member_shares",
              buyerMemberSharesRow.id,
              {
                transaction_id: buyerTx.id,
                member_id: buyingMemberId,
                acquisition_type: "buy",
                transfer_type: "to",
                transfer_member_id: memberId,
                number_of_shares: numberOfShares,
                share_value: valuePerShare,
                total_value: totalValue,
                remaining_shares: buyerProjected,
                date: dateStr,
                status: "active",
                created_by: actor.id,
              },
              actor.institution_id,
              actor.id,
              { branch_id: toMemberRow.branch_id },
              client
            )
          }

          // 3. Transaction for SELLING Member (Shares Holding)
          const sellerTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            memberId,
            accountId: null,
            transferredToId: null,
            bankAccountId: isBankRouted ? bankAccountId : null,
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description:
              body.description ||
              `Shares Buy off: Sold ${numberOfShares} share(s) to ${toMemberRow.full_name}`,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: sellerBalanceBefore,
            balanceAfter: sellerBalanceAfter,
            processedBy: actor.id,
            transactionDate: resolvedDate.toISOString(),
            prefix: "TXN",
          })

          // 4. Insert selling member record into member_shares
          const sellerShareRes = await client.query(
            `INSERT INTO member_shares (
               transaction_id,
               member_id,
               acquisition_type,
               transfer_type,
               transfer_member_id,
               number_of_shares,
               share_value,
               total_value,
               remaining_shares,
               date,
               status,
               created_by
             ) VALUES ($1, $2, 'sell', 'to', $3, $4, $5, $6, $7, $8, 'active', $9)
             RETURNING id`,
            [
              sellerTx.id,
              memberId,
              buyingMemberId,
              numberOfShares,
              valuePerShare,
              totalValue,
              sellerProjected,
              dateStr,
              actor.id,
            ]
          )
          const sellerMemberSharesRow = sellerShareRes.rows[0]
          if (sellerMemberSharesRow?.id) {
            await auditLogger.logInsert(
              "member_shares",
              sellerMemberSharesRow.id,
              {
                transaction_id: sellerTx.id,
                member_id: memberId,
                acquisition_type: "sell",
                transfer_type: "to",
                transfer_member_id: buyingMemberId,
                number_of_shares: numberOfShares,
                share_value: valuePerShare,
                total_value: totalValue,
                remaining_shares: sellerProjected,
                date: dateStr,
                status: "active",
                created_by: actor.id,
              },
              actor.institution_id,
              actor.id,
              { branch_id: fromMemberRow.branch_id },
              client
            )
          }

          // 5. Insert movement record into share_movements
          const movementRes = await client.query(
            `INSERT INTO share_movements (
               from_member_shares_id,
               to_member_shares_id,
               move_type,
               seller_account_transaction_id,
               buyer_account_transaction_id
             ) VALUES ($1, $2, 'buy_out', $3, $4)
             RETURNING id`,
            [
              sellerMemberSharesRow.id,
              buyerMemberSharesRow.id,
              sellerAccountTransactionId,
              buyerAccountTransactionId,
            ]
          )
          const movementRow = movementRes.rows[0]
          if (movementRow?.id) {
            await auditLogger.logInsert(
              "share_movements",
              movementRow.id,
              {
                from_member_shares_id: sellerMemberSharesRow.id,
                to_member_shares_id: buyerMemberSharesRow.id,
                move_type: "buy_out",
                seller_account_transaction_id: sellerAccountTransactionId,
                buyer_account_transaction_id: buyerAccountTransactionId,
              },
              actor.institution_id,
              actor.id,
              { branch_id: fromMemberRow.branch_id },
              client
            )
          }

          // Resolve institution name for post-commit notifications/emails.
          const instRes = await client.query<{ name: string }>(
            `SELECT name FROM institutions WHERE id = $1`,
            [actor.institution_id],
          )
          const institutionName = instRes.rows[0]?.name || ""

          postCommit = {
            type: "buy_out",
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            institutionName,
            currency: String(cfg.currency || "UGX"),
            sellerMember: {
              id: String(fromMemberRow.id),
              full_name: String(fromMemberRow.full_name || ""),
              member_number: String(fromMemberRow.member_number || ""),
              email: fromMemberRow.email ? String(fromMemberRow.email) : "",
            },
            buyerMember: {
              id: String(toMemberRow.id),
              full_name: String(toMemberRow.full_name || ""),
              member_number: String(toMemberRow.member_number || ""),
              email: toMemberRow.email ? String(toMemberRow.email) : "",
            },
            shares: { numberOfShares, totalValue },
            sellerTransaction: {
              id: sellerTx.id,
              transaction_number: sellerTx.transactionNumber,
              amount: totalValue,
            },
            buyerTransaction: {
              id: buyerTx.id,
              transaction_number: buyerTx.transactionNumber,
              amount: totalValue,
            },
            sellerSavingsTransaction: sellerAccTx
              ? {
                  id: sellerAccTx.id,
                  transaction_number: sellerAccTx.transactionNumber,
                  amount: totalValue,
                  accountId: sellerAccId,
                }
              : null,
            buyerSavingsTransaction: buyerAccTx
              ? {
                  id: buyerAccTx.id,
                  transaction_number: buyerAccTx.transactionNumber,
                  amount: totalValue,
                  accountId: buyerAccId,
                }
              : null,
          }

          await client.query("COMMIT")

          return {
            success: true,
            from_member_shares_id: sellerMemberSharesRow.id,
            to_member_shares_id: buyerMemberSharesRow.id,
            share_movement_id: movementRow?.id,
            from_transaction_id: sellerTx.id,
            to_transaction_id: buyerTx.id,
            seller_account_transaction_id: sellerAccountTransactionId,
            buyer_account_transaction_id: buyerAccountTransactionId,
            numberOfShares,
            totalValue,
          }
        } catch (txErr) {
          await client.query("ROLLBACK")
          throw txErr
        }
      }

      return { error: "invalid_action_type" as const }
    })

    if (result && "error" in result) {
      return sharesMoveDenialResponse(result as Record<string, unknown>, SHARES_MOVE_STATUS_GROUPS)
    }

    // Post-commit side-effects: notifications + emails. Best-effort — never
    // raise back to the client (the share movement is already persisted).
    const ctx = postCommit as ShareMovePostCommit | null
    if (ctx) {
      if (ctx.type === "transfer") {
        try {
          const notifyRes = await runWithoutAuth((notifyClient) =>
            notifyShareTransfer({
              client: notifyClient,
              actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
              fromMember: ctx.fromMember,
              toMember: ctx.toMember,
              shares: ctx.shares,
              fromTransaction: ctx.fromTransaction,
              toTransaction: ctx.toTransaction,
              currency: ctx.currency,
            }),
          )
          apiLog(
            notifyRes.ok ? "info" : "warn",
            notifyRes.ok ? "member.shares.transfer.notifications_dispatched" : "member.shares.transfer.notifications_partial",
            {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              memberNotifications: notifyRes.memberNotifications,
              staffNotifications: notifyRes.staffNotifications,
              ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
            },
          )
        } catch (notifyErr) {
          apiLog("error", "member.shares.transfer.notifications_failed", {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            error: (notifyErr as Error)?.message || "notify_failed",
          })
        }

        try {
          const emailRes = await enqueueShareTransferEmails({
            fromMember: ctx.fromMember,
            toMember: ctx.toMember,
            institutionName: ctx.institutionName,
            currency: ctx.currency,
            shares: ctx.shares,
            fromTransaction: ctx.fromTransaction,
            toTransaction: ctx.toTransaction,
            context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
          })
          if (emailRes.errors.length > 0) {
            apiLog("warn", "member.shares.transfer.email_enqueue_partial", {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              errors: emailRes.errors,
            })
          }
        } catch (emailErr) {
          apiLog("error", "member.shares.transfer.email_enqueue_failed", {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            error: (emailErr as Error)?.message || "email_failed",
          })
        }
      } else if (ctx.type === "buy_out") {
        try {
          const notifyRes = await runWithoutAuth((notifyClient) =>
            notifyShareBuyOff({
              client: notifyClient,
              actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
              sellerMember: ctx.sellerMember,
              buyerMember: ctx.buyerMember,
              shares: ctx.shares,
              sellerTransaction: ctx.sellerTransaction,
              buyerTransaction: ctx.buyerTransaction,
              sellerSavingsTransaction: ctx.sellerSavingsTransaction,
              buyerSavingsTransaction: ctx.buyerSavingsTransaction,
              currency: ctx.currency,
            }),
          )
          apiLog(
            notifyRes.ok ? "info" : "warn",
            notifyRes.ok ? "member.shares.buy_out.notifications_dispatched" : "member.shares.buy_out.notifications_partial",
            {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              memberNotifications: notifyRes.memberNotifications,
              staffNotifications: notifyRes.staffNotifications,
              ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
            },
          )
        } catch (notifyErr) {
          apiLog("error", "member.shares.buy_out.notifications_failed", {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            error: (notifyErr as Error)?.message || "notify_failed",
          })
        }

        try {
          const emailRes = await enqueueShareBuyOffEmails({
            sellerMember: ctx.sellerMember,
            buyerMember: ctx.buyerMember,
            institutionName: ctx.institutionName,
            currency: ctx.currency,
            shares: ctx.shares,
            sellerTransaction: ctx.sellerTransaction,
            buyerTransaction: ctx.buyerTransaction,
            sellerSavingsTransaction: ctx.sellerSavingsTransaction,
            buyerSavingsTransaction: ctx.buyerSavingsTransaction,
            context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
          })
          if (emailRes.errors.length > 0) {
            apiLog("warn", "member.shares.buy_out.email_enqueue_partial", {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              errors: emailRes.errors,
            })
          }
        } catch (emailErr) {
          apiLog("error", "member.shares.buy_out.email_enqueue_failed", {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            error: (emailErr as Error)?.message || "email_failed",
          })
        }
      }
    }

    apiLog("info", "member.shares.move.success", {
      method: "POST",
      apiPath,
      status: 200,
      memberId,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.move.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
