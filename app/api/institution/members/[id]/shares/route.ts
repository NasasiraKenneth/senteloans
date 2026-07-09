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
import { getBranchBankAccount, adjustBankAccountBalance, type BankAccountRow } from "@/lib/finances/bank-account"
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice"
import { recordInvoicePayment } from "@/lib/invoices/invoice-payments"
import { notifySharePurchase } from "@/lib/notifications/share-events"
import { enqueueSharePurchaseEmails } from "@/lib/email/share-emails"

type SharePurchasePostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  member: { id: string; full_name: string; member_number: string; email: string }
  shares: { numberOfShares: number; totalValue: number }
  transaction: { id: string; transaction_number: string; amount: number }
  invoice: { id: string; invoice_number: string; total_amount: number }
}

const SHARES_GET_STATUS_GROUPS: MemberRouteHttpStatusGroups = {
  forbidden: ["missing_permission:view_members", "forbidden", "no_app_user_profile"],
  notFound: ["member_not_found"],
  defaultStatus: 400,
}

const SHARES_POST_STATUS_GROUPS: MemberRouteHttpStatusGroups = {
  forbidden: ["forbidden", "no_app_user", "missing_permission:edit_shares", SUPER_ADMIN_WRITE_BLOCKED],
  notFound: ["member_not_found", "institution_not_found"],
  badRequest: [
    "shares_transaction_account_missing",
    "reference_number_required",
    "bank_account_required",
    "bank_account_not_found",
    "invalid_mode",
    "invoice_payments_table_missing",
    "invoices_table_missing",
    "shares_disabled",
    "share_value_not_configured",
  ],
  serverError: ["shares_transaction_failed"],
  defaultStatus: 400,
}

function sharesRouteDenialResponse(
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id FROM members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "forbidden" as const }

      const res = await client.query(
        `SELECT id, number_of_shares, share_value, total_value, purchase_date, created_at FROM member_shares WHERE member_id = $1 ORDER BY created_at DESC`,
        [memberId]
      )
      return { shares: res.rows }
    })

    if (result && "error" in result) {
      return sharesRouteDenialResponse(result as Record<string, unknown>, SHARES_GET_STATUS_GROUPS)
    }
    apiLog("info", "member.shares.list.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const body = (await req.json()) as {
      numberOfShares?: number
      mode?: string
      description?: string
      paymentDate?: string
      referenceNumber?: string
      reference_number?: string
      transaction_charges?: number | string
      bank_account_id?: string
    }
    const numberOfShares = Number(body?.numberOfShares)
    if (!Number.isInteger(numberOfShares) || numberOfShares <= 0) {
      return NextResponse.json({ error: "invalid_number_of_shares" }, { status: 400 })
    }

    // Optional transaction charges (e.g. bank/mobile-money fees). Must be a
    // non-negative number; ignored when absent or zero.
    const transactionChargesRaw = body?.transaction_charges
    const transactionCharges =
      transactionChargesRaw == null || transactionChargesRaw === ""
        ? 0
        : Number(transactionChargesRaw)
    if (Number.isNaN(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }

    // Resolve optional payment date (defaults to today). Reject future dates so
    // the share ledger always reflects real-world settlement.
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const paymentDateRaw = typeof body.paymentDate === "string" ? body.paymentDate.trim() : ""
    let resolvedPaymentDate = new Date()
    if (paymentDateRaw) {
      const parsed = new Date(paymentDateRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
      }
      if (parsed.getTime() > today.getTime()) {
        return NextResponse.json({ error: "payment_date_in_future" }, { status: 400 })
      }
      resolvedPaymentDate = parsed
    }

    const referenceNumberInput =
      typeof body.referenceNumber === "string"
        ? body.referenceNumber.trim()
        : typeof body.reference_number === "string"
          ? body.reference_number.trim()
          : ""

    const bankAccountIdInput =
      typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.shares.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    let postCommit: SharePurchasePostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_shares")
      if (!allowed) return { error: "missing_permission:edit_shares" as const }

      const gate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (gate.ok === false) {
        return memberWriteGateRouteError(gate)!
      }
      const memberRow = gate.member

      const cfgRes = await client.query(
        `SELECT shares, share_value, minimum_shares, maximum_shares, currency, invoice_overdue_period
         FROM config
         WHERE branch_id = $1
         LIMIT 1`,
        [memberRow.branch_id]
      )
      const cfg = cfgRes.rows[0]
      if (!cfg) return { error: "institution_not_found" as const }

      const sharesEnabled = String(cfg.shares ?? "false").toLowerCase() === "true"
      const valuePerShare = Number(cfg.share_value ?? 0)
      const minShares = cfg.minimum_shares != null ? Number(cfg.minimum_shares) : undefined
      const maxShares = cfg.maximum_shares != null ? Number(cfg.maximum_shares) : undefined
      const currency = (cfg.currency as string) || "UGX"
      const invoiceDueDays = Number(cfg.invoice_overdue_period || 30)

      if (!sharesEnabled) return { error: "shares_disabled" as const }
      if (!valuePerShare || Number.isNaN(valuePerShare) || valuePerShare <= 0) {
        return { error: "share_value_not_configured" as const }
      }

      // Limits apply to the resulting holding, not just this single purchase.
      const currentSharesRes = await client.query(
        `SELECT COALESCE(SUM(number_of_shares), 0)::int AS total_shares FROM member_shares WHERE member_id = $1`,
        [memberId]
      )
      const currentShares = Number(currentSharesRes.rows[0]?.total_shares || 0)
      const projectedShares = currentShares + numberOfShares
      if (typeof minShares === "number" && minShares > 0 && projectedShares < minShares) {
        return { error: `minimum_shares_${minShares}` as const }
      }
      if (typeof maxShares === "number" && maxShares > 0 && projectedShares > maxShares) {
        return { error: `maximum_shares_${maxShares}` as const }
      }

      const purchaseDate = resolvedPaymentDate.toISOString().slice(0, 10)
      const purchaseValue = numberOfShares * valuePerShare
      const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
      // Default to Cash when absent, but reject an explicit unsupported mode
      // instead of silently mis-recording the payment channel.
      const requestedMode = typeof body.mode === "string" && body.mode.trim() ? body.mode.trim() : "Cash"
      if (!validModes.includes(requestedMode)) {
        return { error: "invalid_mode" as const }
      }
      const mode = requestedMode
      if (mode !== "Cash" && !referenceNumberInput) {
        return { error: "reference_number_required" as const }
      }
      const description = typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : `Shares purchase: ${numberOfShares} share(s) @ ${valuePerShare.toLocaleString()} each`

      // Bank-routed payments settle into a branch bank account, which we credit
      // with the purchase value. Validate the selected account up-front.
      const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]
      let bankAccount: BankAccountRow | null = null
      if (BANK_ROUTED_MODES.includes(mode)) {
        if (!bankAccountIdInput) return { error: "bank_account_required" as const }
        bankAccount = await getBranchBankAccount(client, {
          bankAccountId: bankAccountIdInput,
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
        })
        if (!bankAccount) return { error: "bank_account_not_found" as const }
      }

      try {
        await client.query("BEGIN")

        // Lock the member row so two concurrent purchases can't both pass the
        // holding-limit check and push the total past maximum_shares.
        await client.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [memberId])

        // Authoritative holding recompute under the lock (the pre-check above is
        // only for fast failure before we start writing).
        const lockedSharesRes = await client.query(
          `SELECT COALESCE(SUM(number_of_shares), 0)::int AS total_shares FROM member_shares WHERE member_id = $1`,
          [memberId]
        )
        const lockedProjected = Number(lockedSharesRes.rows[0]?.total_shares || 0) + numberOfShares
        if (typeof minShares === "number" && minShares > 0 && lockedProjected < minShares) {
          throw new Error(`minimum_shares_${minShares}`)
        }
        if (typeof maxShares === "number" && maxShares > 0 && lockedProjected > maxShares) {
          throw new Error(`maximum_shares_${maxShares}`)
        }

        // Track running share value balance for this member
        const shareBalRes = await client.query(
          `SELECT COALESCE(SUM(total_value), 0)::numeric AS total_share_value FROM member_shares WHERE member_id = $1`,
          [memberId]
        )
        const balanceBefore = Number(shareBalRes.rows[0]?.total_share_value || 0)
        const balanceAfter = balanceBefore + purchaseValue

        const insRes = await client.query(
          `INSERT INTO member_shares (member_id, number_of_shares, share_value, purchase_date) VALUES ($1, $2, $3, $4) RETURNING id`,
          [memberId, numberOfShares, valuePerShare, purchaseDate]
        )
        const row = insRes.rows[0]
        if (row?.id) {
          await auditLogger.logInsert(
            "member_shares",
            row.id,
            {
              member_id: memberId,
              number_of_shares: numberOfShares,
              share_value: valuePerShare,
              purchase_date: purchaseDate,
            },
            actor.institution_id,
            actor.id,
            { branch_id: memberRow.branch_id },
            client
          )
        }

        // Use Shares Purchase when enum exists, fallback to Deposit to avoid runtime enum errors.
        const enumRes = await client.query(
          `SELECT 1
           FROM pg_enum
           WHERE enumlabel = 'Shares Purchase'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
           LIMIT 1`
        )
        const hasSharesPurchaseType = Number(enumRes.rowCount || 0) > 0
        const txType = hasSharesPurchaseType ? "Shares Purchase" : "Deposit"

        // If enum migration is not yet applied, fallback to Deposit requires an account_id
        // due to transaction reference constraints.
        let fallbackAccountId: string | null = null
        if (!hasSharesPurchaseType) {
          const accRes = await client.query(
            `SELECT id
             FROM savings_accounts
             WHERE institution_id = $1 AND member_id = $2
             ORDER BY CASE WHEN account_type = 'Shares' THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [actor.institution_id, memberId]
          )
          fallbackAccountId = accRes.rows[0]?.id || null
          if (!fallbackAccountId) {
            throw new Error("shares_transaction_account_missing")
          }
        }

        // Shared transaction writer: collision-safe number + audit log.
        const tx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          memberId,
          accountId: fallbackAccountId,
          bankAccountId: bankAccount?.id ?? null,
          type: txType,
          amount: purchaseValue,
          mode,
          description,
          // Store the reference number captured on the form. Empty (e.g. Cash
          // payments) is persisted as NULL rather than a fallback.
          referenceNumber: referenceNumberInput || null,
          balanceBefore,
          balanceAfter,
          charges: transactionCharges,
          processedBy: actor.id,
          // Payment date from the form drives the transaction date.
          transactionDate: resolvedPaymentDate.toISOString(),
        })
        const txNumber = tx.transactionNumber

        // Credit the selected branch bank account for bank-routed payments.
        if (bankAccount) {
          await adjustBankAccountBalance(client, {
            account: bankAccount,
            amount: purchaseValue,
            actor,
          })
        }

        // Roll the purchase into the branch's daily finance ledger for the
        // actual posting day (today). Backdated purchases still post to today's
        // row so the running cash position stays accurate.
        await applyDailyFinanceEntry(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount: purchaseValue,
          mode,
          actor,
        })

        // Auto-generate a paid invoice for the share purchase.
        const due = new Date(`${purchaseDate}T00:00:00Z`)
        due.setUTCDate(due.getUTCDate() + Math.max(1, invoiceDueDays))
        const invoiceDue = due.toISOString().slice(0, 10)

        const invoice = await createInvoiceWithItems(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          createdBy: actor.id,
          // Invoice date follows the payment date so backdated purchases land
          // on the right accounting period (matches the transaction date).
          invoiceDate: purchaseDate,
          invoiceDue,
          invoiceType: "Auto",
          status: "fully paid",
          vat: 0,
          target: { member_id: memberId },
          items: [
            {
              unit: "Shares",
              description: "Share Purchase",
              quantity: numberOfShares,
              unit_price: valuePerShare,
              total_price: purchaseValue,
              vatinclusive: false,
            },
          ],
        })

        // Link the share transaction to the invoice via invoice_payments.
        await recordInvoicePayment(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          invoiceId: invoice.id,
          amount: purchaseValue,
          paymentDate: resolvedPaymentDate,
          processedBy: actor.id,
          transactionId: tx.id,
        })

        // Resolve institution name for post-commit notifications/emails.
        const instRes = await client.query<{ name: string }>(
          `SELECT name FROM institutions WHERE id = $1`,
          [actor.institution_id],
        )
        const institutionName = instRes.rows[0]?.name || ""

        // Stash context for best-effort notifications + emails after COMMIT.
        postCommit = {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          institutionName,
          currency,
          member: {
            id: String(memberRow.id),
            full_name: String(memberRow.full_name || ""),
            member_number: String(memberRow.member_number || ""),
            email: memberRow.email ? String(memberRow.email) : "",
          },
          shares: { numberOfShares, totalValue: purchaseValue },
          transaction: {
            id: tx.id,
            transaction_number: tx.transactionNumber,
            amount: purchaseValue,
          },
          invoice: {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            total_amount: invoice.total_amount,
          },
        }

        await client.query("COMMIT")
        return { ok: true, id: row?.id, transaction_number: txNumber, invoice_number: invoice.invoice_number }
      } catch (e: unknown) {
        await client.query("ROLLBACK")
        const err = e as Error & { code?: string }
        const msg = err?.message || ""
        apiLog("error", "member.shares.transaction_rollback", {
          method: "POST",
          apiPath,
          memberId,
          error: msg,
          ...(err?.code ? { pgCode: err.code } : {}),
        })
        if (msg === "shares_transaction_account_missing") {
          return { error: "shares_transaction_account_missing" as const }
        }
        // Holding-limit violations detected under the row lock surface as the
        // same coded errors the pre-check uses (mapped to 400 by the client).
        if (msg.startsWith("minimum_shares_") || msg.startsWith("maximum_shares_")) {
          return { error: msg as `minimum_shares_${number}` | `maximum_shares_${number}` }
        }
        if (/relation "invoice_payments" does not exist/i.test(msg)) {
          return { error: "invoice_payments_table_missing" as const }
        }
        if (/relation "invoices" does not exist/i.test(msg)) {
          return { error: "invoices_table_missing" as const }
        }
        return { error: "shares_transaction_failed" as const, detail: msg || undefined }
      }
    })

    if (result && "error" in result) {
      return sharesRouteDenialResponse(result as Record<string, unknown>, SHARES_POST_STATUS_GROUPS)
    }
    apiLog("info", "member.shares.create.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })

    // Post-commit side-effects: notifications + emails. Best-effort — never
    // raise back to the client (the purchase is already persisted).
    const ctx = postCommit as SharePurchasePostCommit | null
    if (ctx) {
      try {
        // Fresh client so staff fan-out can query users/roles.
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifySharePurchase({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            shares: ctx.shares,
            transaction: ctx.transaction,
            invoice: ctx.invoice,
            currency: ctx.currency,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.shares.notifications_dispatched" : "member.shares.notifications_partial",
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
        apiLog("error", "member.shares.notifications_failed", {
          method: "POST", apiPath, status: 200, memberId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueSharePurchaseEmails({
          member: ctx.member,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          shares: ctx.shares,
          transaction: ctx.transaction,
          invoice: ctx.invoice,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.shares.email_enqueue_partial", {
            method: "POST", apiPath, status: 200, memberId, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.shares.email_enqueue_failed", {
          method: "POST", apiPath, status: 200, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
