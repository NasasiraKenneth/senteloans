import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, type ActorContext } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditBankAccountUpdate, bankAccountSnapshot } from "@/lib/audit/finances-audit"
import {
  mapBankAccountDepositSettlementError,
  recordBankAccountDeposit,
} from "@/lib/finances/bank-account-balance-deposit"
import { recordBankAccountWithdraw } from "@/lib/finances/bank-account-balance-withdraw"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { BANK_ACCOUNT_AGENT_JOIN } from "@/lib/finances/bank-account"
import { isBankRoutedPaymentMode, normalizePaymentMode } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"

type Direction = "deposit" | "withdraw"

function normalizeDirection(raw: unknown): Direction | null {
  const v = String(raw || "").trim().toLowerCase()
  if (v === "deposit" || v === "add" || v === "credit") return "deposit"
  if (v === "withdraw" || v === "subtract" || v === "debit") return "withdraw"
  return null
}

function singleBankAccountWhere(
  actor: ActorContext,
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
    const dateOnly = toDateOnlyString(body?.date)
    const mode = normalizePaymentMode(body?.mode)
    const inflowReferenceNumber = String(body?.reference_number || "").trim() || null
    const sourceReferenceNumber = String(body?.mode_reference_number || "").trim() || null
    const sourceBankAccountId = String(body?.bank_account_id || "").trim() || null
    const chargesRaw = body?.transaction_charges
    const charges =
      chargesRaw === undefined || chargesRaw === null || String(chargesRaw).trim() === ""
        ? 0
        : Number(chargesRaw)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!direction) {
      return NextResponse.json({ error: "invalid_direction" }, { status: 400 })
    }

    if (direction === "deposit") {
      if (!dateOnly) {
        return NextResponse.json({ error: "invalid_date" }, { status: 400 })
      }
      if (!inflowReferenceNumber) {
        return NextResponse.json({ error: "reference_number_required" }, { status: 400 })
      }
      if (!mode) {
        return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
      }
      if (mode !== "Cash" && !sourceReferenceNumber) {
        return NextResponse.json({ error: "mode_reference_number_required" }, { status: 400 })
      }
      const modeValidation = validatePaymentModeInput({
        mode,
        referenceNumber: mode === "Cash" ? inflowReferenceNumber : sourceReferenceNumber,
        bankAccountId: isBankRoutedPaymentMode(mode) ? sourceBankAccountId : null,
      })
      if (modeValidation) {
        return NextResponse.json({ error: modeValidation }, { status: 400 })
      }
      if (!Number.isFinite(charges) || charges < 0) {
        return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
      }
      if (isBankRoutedPaymentMode(mode) && sourceBankAccountId === accountId) {
        return NextResponse.json({ error: "invalid_bank_account" }, { status: 400 })
      }
    }

    if (direction === "withdraw") {
      if (!dateOnly) {
        return NextResponse.json({ error: "invalid_date" }, { status: 400 })
      }
      if (!inflowReferenceNumber) {
        return NextResponse.json({ error: "reference_number_required" }, { status: 400 })
      }
      if (!mode) {
        return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
      }
      if (mode !== "Cash" && !sourceReferenceNumber) {
        return NextResponse.json({ error: "mode_reference_number_required" }, { status: 400 })
      }
      const modeValidation = validatePaymentModeInput({
        mode,
        referenceNumber: mode === "Cash" ? inflowReferenceNumber : sourceReferenceNumber,
        bankAccountId: isBankRoutedPaymentMode(mode) ? sourceBankAccountId : null,
      })
      if (modeValidation) {
        return NextResponse.json({ error: modeValidation }, { status: 400 })
      }
      if (!Number.isFinite(charges) || charges < 0) {
        return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
      }
      if (isBankRoutedPaymentMode(mode) && sourceBankAccountId === accountId) {
        return NextResponse.json({ error: "invalid_bank_account" }, { status: 400 })
      }
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.editBankAmount)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = singleBankAccountWhere(actor, accountId)
      const existing = await client.query(
        `SELECT ba.id, ba.branch_id, ba.third_party_agent_id,
                tpa.name AS bank_name, ba.bank_account_number,
                COALESCE(ba.total_amount, 0)::numeric AS total_amount
         FROM bank_accounts ba
         ${BANK_ACCOUNT_AGENT_JOIN}
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

      const branchId = branchScope.branchId
      const actorForBranch = { ...actor, branch_id: branchId }

      if (direction === "deposit") {
        await client.query("BEGIN")
        try {
          const deposit = await recordBankAccountDeposit({
            client,
            actor: actorForBranch,
            targetAccount: {
              id: String(oldRow.id),
              branch_id: branchId,
              third_party_agent_id: String(oldRow.third_party_agent_id || ""),
              bank_name: String(oldRow.bank_name || ""),
              bank_account_number: String(oldRow.bank_account_number || ""),
            },
            amount,
            charges,
            sourceMode: mode!,
            date: dateOnly,
            inflowReferenceNumber: inflowReferenceNumber!,
            sourceReferenceNumber,
            sourceBankAccountId,
          })

          await auditBankAccountUpdate(
            client,
            actor,
            accountId,
            bankAccountSnapshot(oldRow),
            {
              ...bankAccountSnapshot({
                ...oldRow,
                total_amount: deposit.totalAmount,
              }),
              _action: "deposit",
              _delta: amount,
              _transfer_transaction_id: deposit.transactionId,
            },
            branchId,
          )

          await client.query("COMMIT")

          return {
            id: accountId,
            total_amount: deposit.totalAmount,
            direction,
            transaction_id: deposit.transactionId,
            transaction_number: deposit.transactionNumber,
            charges_expense_id: deposit.chargesExpenseId,
            charges_transaction_id: deposit.chargesTransactionId,
          }
        } catch (e: unknown) {
          await client.query("ROLLBACK")
          if (e instanceof PaymentSettlementFailure) {
            return { error: mapBankAccountDepositSettlementError(e.code) as string }
          }
          throw e
        }
      }

      if (direction === "withdraw") {
        await client.query("BEGIN")
        try {
          const withdrawal = await recordBankAccountWithdraw({
            client,
            actor: actorForBranch,
            sourceAccount: {
              id: String(oldRow.id),
              branch_id: branchId,
              third_party_agent_id: String(oldRow.third_party_agent_id || ""),
              bank_name: String(oldRow.bank_name || ""),
              bank_account_number: String(oldRow.bank_account_number || ""),
            },
            amount,
            charges,
            destinationMode: mode!,
            date: dateOnly,
            ledgerReferenceNumber: inflowReferenceNumber!,
            destinationReferenceNumber: sourceReferenceNumber,
            destinationBankAccountId: sourceBankAccountId,
          })

          await auditBankAccountUpdate(
            client,
            actor,
            accountId,
            bankAccountSnapshot(oldRow),
            {
              ...bankAccountSnapshot({
                ...oldRow,
                total_amount: withdrawal.totalAmount,
              }),
              _action: "withdraw",
              _delta: -amount,
              _transfer_transaction_id: withdrawal.transactionId,
            },
            branchId,
          )

          await client.query("COMMIT")

          return {
            id: accountId,
            total_amount: withdrawal.totalAmount,
            direction,
            transaction_id: withdrawal.transactionId,
            transaction_number: withdrawal.transactionNumber,
            charges_expense_id: withdrawal.chargesExpenseId,
            charges_transaction_id: withdrawal.chargesTransactionId,
          }
        } catch (e: unknown) {
          await client.query("ROLLBACK")
          if (e instanceof PaymentSettlementFailure) {
            const mapped = mapBankAccountDepositSettlementError(e.code)
            if (mapped === "insufficient_bank_balance") {
              return {
                error: "insufficient_balance" as const,
                message:
                  `Withdrawal and charges exceed the current balance (${Number(oldRow.total_amount || 0).toFixed(2)}).` as const,
              }
            }
            return { error: mapped as string }
          }
          throw e
        }
      }

      return { error: "invalid_direction" as const }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const code = String(result.error || "")
      const status =
        code === "not_found" || code === "bank_account_not_found"
          ? 404
          : code === "insufficient_balance" ||
              code === "balance_changed" ||
              code === "insufficient_bank_balance" ||
              code === "insufficient_cash_balance" ||
              code === "insufficient_mobile_money_balance"
            ? 409
            : code === "invalid_amount" ||
                code === "invalid_direction" ||
                code === "invalid_date" ||
                code === "invalid_mode" ||
                code === "invalid_transaction_charges" ||
                code === "invalid_bank_account" ||
                code === "reference_number_required" ||
                code === "mode_reference_number_required" ||
                code === "bank_account_required"
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
