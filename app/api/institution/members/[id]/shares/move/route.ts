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
  memberWriteGateRouteError,
  type MemberRouteHttpStatusGroups,
} from "@/lib/members/member-status"

const SHARES_MOVE_STATUS_GROUPS: MemberRouteHttpStatusGroups = {
  forbidden: ["forbidden", "no_app_user", "missing_permission:edit_shares", SUPER_ADMIN_WRITE_BLOCKED],
  notFound: ["member_not_found", "target_member_not_found", "institution_not_found"],
  badRequest: [
    "invalid_action_type",
    "invalid_number_of_shares",
    "same_member_transfer",
    "target_member_not_found",
    "target_member_inactive",
    "insufficient_shares",
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const body = (await req.json()) as {
      actionType?: string
      numberOfShares?: number
      transferMemberId?: string
      buyingMemberId?: string
      mode?: string
      date?: string
      referenceNumber?: string
      reference_number?: string
      bank_account_id?: string
      savings_account_id?: string
      description?: string
    }

    const actionType = body?.actionType || "transfer"
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

    const mode = typeof body.mode === "string" ? body.mode.trim() : "Internal Transfer"

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.move.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.move.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

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

      if (actionType === "transfer") {
        const transferMemberId = (body.transferMemberId || "").trim()
        if (!transferMemberId) return { error: "target_member_not_found" as const }
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

          // Check transaction_type enum for Shares Transfer
          const txTypeEnumRes = await client.query(
            `SELECT 1
             FROM pg_enum
             WHERE enumlabel = 'Shares Transfer'
               AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
             LIMIT 1`
          )
          const txType = Number(txTypeEnumRes.rowCount || 0) > 0 ? "Shares Transfer" : "Transfer"

          // Check payment_mode enum
          const modeEnumRes = await client.query(
            `SELECT enumlabel
             FROM pg_enum
             WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_mode')`
          )
          const validModes = modeEnumRes.rows.map((r: { enumlabel: string }) => r.enumlabel)
          const resolvedPaymentMode = validModes.includes(mode) ? mode : "Cash"

          // 1. First transaction: Transferring Member
          const fromTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: fromMemberRow.branch_id,
            memberId,
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description: "Shares Transfer",
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
            type: txType,
            amount: totalValue,
            mode: resolvedPaymentMode,
            description: "Shares Transfer",
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

          // 5. Create share_movements table if not exists, and insert movement record
          await client.query(
            `CREATE TABLE IF NOT EXISTS share_movements (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               from_member_shares_id UUID NOT NULL REFERENCES member_shares(id) ON DELETE CASCADE,
               to_member_shares_id UUID NOT NULL REFERENCES member_shares(id) ON DELETE CASCADE,
               move_type VARCHAR(30) CHECK (move_type IN ('transfer', 'buy_out')),
               created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
             )`
          )

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

      return { error: "invalid_action_type" as const }
    })

    if (result && "error" in result) {
      return sharesMoveDenialResponse(result as Record<string, unknown>, SHARES_MOVE_STATUS_GROUPS)
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
