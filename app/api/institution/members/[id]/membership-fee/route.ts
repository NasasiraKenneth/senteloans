import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { resolveActorContext, hasPermission } from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertMemberActiveRow, type MemberStatus } from "@/lib/members/member-status"
import { createTransaction } from "@/lib/transactions/create-transaction"
import {
  settlePaymentByMode,
  PaymentSettlementFailure,
} from "@/lib/finances/settle-payment-mode"
import {
  findOpenMemberMembershipInvoice,
  recordInvoicePayment,
  cancelInvoicePaymentByTransactionId,
  syncInvoiceStatusFromPayments,
} from "@/lib/invoices/invoice-payments"
import { notifyMembershipFeePayment } from "@/lib/notifications/fee-events"
import { enqueueMembershipFeeEmails } from "@/lib/email/fee-emails"

type MembershipFeePostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  member: { id: string; full_name: string; member_number: string; email: string }
  fee: { amount: number; remaining: number }
  transaction: { id: string; transaction_number: string; amount: number }
  invoice: { id: string; invoice_number: string; amount: number; fullySettled: boolean } | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.membership_fee.get.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.membership_fee.get.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT id, branch_id FROM members WHERE institution_id = $1 AND id = $2`,
        [actor.institution_id, memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      const cfgRes = await client.query(
        `SELECT membership_fee, membership_fee_payment, financial_year FROM config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const cfgRow = cfgRes.rows[0]
      const cfgMembershipFee = Number(cfgRow?.membership_fee ?? 0)
      const membershipFeePayment = String(cfgRow?.membership_fee_payment || "annual").trim()
      const isOneTime = membershipFeePayment === "one_time" || membershipFeePayment === "one time"
      const financialYear = String(cfgRow?.financial_year || new Date().getFullYear()).trim()

      const openInvoice = await findOpenMemberMembershipInvoice(
        client,
        actor.institution_id,
        memberId,
      )

      const existingFeeRes = await client.query<{ total_membership_fee: number }>(
        `SELECT total_membership_fee FROM membership_fees
         WHERE institution_id = $1 AND member_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [actor.institution_id, memberId]
      )
      const existingTotal = Number(existingFeeRes.rows[0]?.total_membership_fee ?? 0)

      const membershipFee = openInvoice?.total_amount || existingTotal || cfgMembershipFee

      const paidQuery = isOneTime
        ? `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
           FROM membership_fees
           WHERE institution_id = $1 AND member_id = $2`
        : `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
           FROM membership_fees
           WHERE institution_id = $1 AND member_id = $2
             AND (period = $3 OR EXTRACT(YEAR FROM payment_date)::text = $3)`

      const paidParams = isOneTime
        ? [actor.institution_id, memberId]
        : [actor.institution_id, memberId, financialYear]

      const paidRes = await client.query(paidQuery, paidParams)
      const membershipFeePaid = Number(paidRes.rows[0]?.total_paid ?? 0)

      // Payment history: invoice_payments + direct fee payment transactions + seed membership_fees
      const paymentsRes = await client.query(
        `SELECT
            ip.id::text AS id,
            t.id::text AS transaction_id,
            t.transaction_number,
            ip.amount::numeric AS amount,
            COALESCE(t.mode, 'Cash') AS mode,
            COALESCE(t.description, 'Membership fee payment') AS description,
            COALESCE(t.reference_number, '') AS reference_number,
            t.bank_account_id::text AS bank_account_id,
            COALESCE(t.charges, 0)::numeric AS transaction_charges,
            ip.payment_date AS transaction_date,
            COALESCE(ip.status, t.status::text, 'Completed') AS status
         FROM invoice_payments ip
         JOIN transactions t ON t.id = ip.transaction_id
         JOIN invoices inv ON inv.id = ip.invoice_id
         WHERE inv.institution_id = $1 AND inv.member_id = $2
           AND EXISTS (
             SELECT 1 FROM invoice_items it
              WHERE it.invoice_id = inv.id
                AND LOWER(it.description) LIKE '%membership fee%'
           )
         UNION ALL
         SELECT
            t.id::text AS id,
            t.id::text AS transaction_id,
            t.transaction_number,
            t.amount::numeric AS amount,
            COALESCE(t.mode, 'Cash') AS mode,
            COALESCE(t.description, 'Membership fee payment') AS description,
            COALESCE(t.reference_number, '') AS reference_number,
            t.bank_account_id::text AS bank_account_id,
            COALESCE(t.charges, 0)::numeric AS transaction_charges,
            t.transaction_date AS transaction_date,
            t.status::text AS status
         FROM transactions t
         WHERE t.institution_id = $1 AND t.member_id = $2
           AND t.type = 'Fee Payment'
           AND NOT EXISTS (
             SELECT 1 FROM invoice_payments ip3
             WHERE ip3.transaction_id = t.id
           )
         UNION ALL
         SELECT
            mf.id::text AS id,
            NULL::text AS transaction_id,
            'SEED-' || upper(substr(mf.id::text, 1, 8)) AS transaction_number,
            mf.amount_paid::numeric AS amount,
            'Cash' AS mode,
            'Membership fee payment' AS description,
            '' AS reference_number,
            NULL::text AS bank_account_id,
            0::numeric AS transaction_charges,
            mf.payment_date AS transaction_date,
            'Completed' AS status
         FROM membership_fees mf
         WHERE mf.institution_id = $1 AND mf.member_id = $2
           AND mf.amount_paid > 0
           AND NOT EXISTS (
             SELECT 1 FROM invoice_payments ip2
             JOIN invoices inv2 ON inv2.id = ip2.invoice_id
             WHERE inv2.member_id = mf.member_id
               AND EXISTS (
                 SELECT 1 FROM invoice_items it2
                  WHERE it2.invoice_id = inv2.id
                    AND LOWER(it2.description) LIKE '%membership fee%'
               )
           )
           AND NOT EXISTS (
             SELECT 1 FROM transactions t2
             WHERE t2.institution_id = mf.institution_id
               AND t2.member_id = mf.member_id
               AND t2.type = 'Fee Payment'
           )
         ORDER BY transaction_date DESC`,
        [actor.institution_id, memberId]
      )

      return {
        membershipFee,
        membershipFeePaid,
        membershipFeePayment,
        financialYear,
        payments: paymentsRes.rows,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:view_members" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.membership_fee.get.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.membership_fee.get.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.membership_fee.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.membership_fee.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : "Membership fee payment"
    const referenceNumber = typeof body.reference_number === "string" ? body.reference_number.trim() : ""
    const paymentDateRaw = typeof body.paymentDate === "string" ? body.paymentDate.trim() : ""
    const bankAccountIdInput =
      typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }

    const transactionChargesRaw = body?.transaction_charges
    const transactionCharges =
      transactionChargesRaw == null || transactionChargesRaw === ""
        ? 0
        : Number(transactionChargesRaw)
    if (Number.isNaN(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }

    let resolvedPaymentDate = new Date()
    if (paymentDateRaw) {
      const parsed = new Date(paymentDateRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
      }
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)
      if (parsed.getTime() > endOfToday.getTime()) {
        return NextResponse.json({ error: "payment_date_in_future" }, { status: 400 })
      }
      resolvedPaymentDate = parsed
    }

    let postCommit: MembershipFeePostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_membership_fee")
      if (!allowed) return { error: "missing_permission:edit_membership_fee" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, status, full_name, member_number, email FROM members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const memberCheck = assertMemberActiveRow(memberRow)
      if (!memberCheck.ok) {
        return {
          error: memberCheck.error as "member_inactive",
          memberStatus: memberCheck.status as MemberStatus,
        }
      }

      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const cfgRes = await client.query(
        `SELECT membership_fee, membership_fee_payment, financial_year, currency FROM config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const cfgRow = cfgRes.rows[0]
      const cfgMembershipFee = Number(cfgRow?.membership_fee ?? 0)
      const currency = (cfgRow?.currency as string) || "UGX"
      const membershipFeePayment = String(cfgRow?.membership_fee_payment || "annual").trim()
      const isOneTime = membershipFeePayment === "one_time" || membershipFeePayment === "one time"
      const financialYear = String(cfgRow?.financial_year || resolvedPaymentDate.getFullYear().toString()).trim()
      const periodYear = resolvedPaymentDate.getFullYear().toString()

      const openInvoiceForIns = await findOpenMemberMembershipInvoice(
        client,
        actor.institution_id,
        memberId,
      )

      const existingFeeRes = await client.query<{ id: string; amount_paid: number; invoice_id: string | null; total_membership_fee: number }>(
        `SELECT id, amount_paid, invoice_id, total_membership_fee FROM membership_fees
         WHERE institution_id = $1 AND member_id = $2 AND period = $3
         ORDER BY created_at DESC LIMIT 1`,
        [actor.institution_id, memberId, periodYear]
      )
      const existingFee = existingFeeRes.rows[0]
      const existingTotal = Number(existingFee?.total_membership_fee ?? 0)

      const membershipFee = openInvoiceForIns?.total_amount || existingTotal || cfgMembershipFee

      const paidQuery = isOneTime
        ? `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
           FROM membership_fees
           WHERE institution_id = $1 AND member_id = $2`
        : `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
           FROM membership_fees
           WHERE institution_id = $1 AND member_id = $2
             AND (period = $3 OR EXTRACT(YEAR FROM payment_date)::text = $3)`

      const paidParams = isOneTime
        ? [actor.institution_id, memberId]
        : [actor.institution_id, memberId, financialYear]

      const paidRes = await client.query(paidQuery, paidParams)
      const currentPaid = Number(paidRes.rows[0]?.total_paid ?? 0)
      const remaining = Math.max(0, membershipFee - currentPaid)

      if (membershipFee > 0 && amount > remaining + 0.01) {
        return { error: "amount_exceeds_remaining" as const, remaining }
      }

      const newPaid = currentPaid + amount
      const txDate = resolvedPaymentDate.toISOString()
      const balanceBefore = Math.max(membershipFee - currentPaid, 0)
      const balanceAfter = Math.max(membershipFee - newPaid, 0)

      try {
        await client.query("BEGIN")

        const effectiveMode =
          mode === "Cheque" || mode === "Card" ? "Bank Transfer" : mode

        // 1. Unified financial settlement using PaymentFlow "inflow"
        const { bankAccount } = await settlePaymentByMode(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount,
          charges: transactionCharges,
          mode: effectiveMode,
          flow: "inflow",
          actor,
          bankAccountId: bankAccountIdInput || null,
          referenceNumber: referenceNumber || null,
        })

        // 2. Shared transaction writer
        const tx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          memberId,
          bankAccountId: bankAccount?.id ?? null,
          type: "Fee Payment",
          amount,
          mode: effectiveMode,
          description,
          referenceNumber: referenceNumber || null,
          balanceBefore,
          balanceAfter,
          charges: transactionCharges,
          processedBy: actor.id,
          transactionDate: txDate,
        })
        const txRow = { id: tx.id }
        const transactionNumber = tx.transactionNumber

        let feeRowId: string
        const effectiveInvoiceId = openInvoiceForIns?.id || existingFee?.invoice_id || null

        if (existingFee) {
          const updatedAmountPaid = Number(existingFee.amount_paid || 0) + amount
          const feeRes = await client.query(
            `UPDATE membership_fees
             SET amount_paid = $1,
                 balance_before = $2,
                 balance_after = $3,
                 payment_date = $4,
                 modified_by = $5,
                 invoice_id = COALESCE(invoice_id, $6),
                 updated_at = NOW()
             WHERE id = $7
             RETURNING id`,
            [
              updatedAmountPaid,
              balanceBefore,
              balanceAfter,
              txDate,
              actor.id,
              effectiveInvoiceId,
              existingFee.id,
            ]
          )
          feeRowId = feeRes.rows[0].id
        } else {
          const feeRes = await client.query(
            `INSERT INTO membership_fees
              (institution_id, branch_id, member_id, amount_paid, total_membership_fee, balance_before, balance_after, period, invoice_id, processed_by, payment_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              actor.institution_id,
              memberRow.branch_id,
              memberId,
              amount,
              membershipFee,
              balanceBefore,
              balanceAfter,
              periodYear,
              effectiveInvoiceId,
              actor.id,
              txDate,
            ]
          )
          feeRowId = feeRes.rows[0].id
        }
        const feeRow = { id: feeRowId }

        await auditLogger.logInsert(
          "membership_fees",
          feeRow.id,
          {
            member_id: memberId,
            branch_id: memberRow.branch_id,
            amount_paid: amount,
            total_membership_fee: membershipFee,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            period: periodYear,
            invoice_id: effectiveInvoiceId,
            processed_by: actor.id,
            payment_date: txDate,
          },
          actor.institution_id,
          actor.id,
          { branch_id: memberRow.branch_id },
          client
        )

        let invoicePayment: {
          invoice_id: string
          status: string
          paid_amount: number
          outstanding: number
        } | null = null
        let postCommitInvoice: MembershipFeePostCommit["invoice"] = null
        if (effectiveInvoiceId) {
          await recordInvoicePayment(client, {
            institutionId: actor.institution_id,
            branchId: memberRow.branch_id,
            invoiceId: effectiveInvoiceId,
            amount,
            paymentDate: txDate,
            processedBy: actor.id,
            transactionId: txRow.id,
          })
          const synced = await syncInvoiceStatusFromPayments(client, effectiveInvoiceId, {
            institutionId: actor.institution_id,
            branchId: memberRow.branch_id,
            userId: actor.id,
          })
          invoicePayment = {
            invoice_id: effectiveInvoiceId,
            status: synced.status,
            paid_amount: synced.paid_amount,
            outstanding: synced.outstanding,
          }
          postCommitInvoice = {
            id: effectiveInvoiceId,
            invoice_number: openInvoiceForIns?.invoice_number || "",
            amount,
            fullySettled: synced.status === "fully paid",
          }
        }

        const instRes = await client.query<{ name: string }>(
          `SELECT name FROM institutions WHERE id = $1`,
          [actor.institution_id],
        )
        const institutionName = instRes.rows[0]?.name || ""

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
          fee: { amount, remaining: balanceAfter },
          transaction: {
            id: txRow.id,
            transaction_number: transactionNumber,
            amount,
          },
          invoice: postCommitInvoice,
        }

        await client.query("COMMIT")

        return {
          ok: true,
          transactionId: txRow.id,
          transactionNumber,
          membershipFeeId: feeRow.id,
          membershipFeePaid: newPaid,
          membershipFee,
          invoice: invoicePayment,
        }
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_forbidden" ||
        result.error === "missing_permission:edit_membership_fee" ||
        result.error === "branch_inactive" ||
        result.error === "branch_not_found"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      const body: Record<string, unknown> = { error: result.error }
      if ("remaining" in result) body.remaining = (result as any).remaining
      if ("branchStatus" in result && (result as { branchStatus?: BranchStatus }).branchStatus) {
        body.branch_status = (result as { branchStatus?: BranchStatus }).branchStatus
      }
      if ("memberStatus" in result && (result as { memberStatus?: MemberStatus }).memberStatus) {
        body.member_status = (result as { memberStatus?: MemberStatus }).memberStatus
      }
      return NextResponse.json(body, { status })
    }
    apiLog("info", "member.membership_fee.create.success", { method: "POST", apiPath, status: 201, memberId, authUserId: session.user.authUserId })

    const ctx = postCommit as MembershipFeePostCommit | null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyMembershipFeePayment({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            fee: ctx.fee,
            transaction: ctx.transaction,
            invoice: ctx.invoice,
            currency: ctx.currency,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.membership_fee.notifications_dispatched" : "member.membership_fee.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            memberId,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.membership_fee.notifications_failed", {
          method: "POST", apiPath, status: 201, memberId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueMembershipFeeEmails({
          member: ctx.member,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          fee: ctx.fee,
          transaction: ctx.transaction,
          invoice: ctx.invoice
            ? {
                id: ctx.invoice.id,
                invoice_number: ctx.invoice.invoice_number,
                fullySettled: ctx.invoice.fullySettled,
              }
            : null,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.membership_fee.email_enqueue_partial", {
            method: "POST", apiPath, status: 201, memberId, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.membership_fee.email_enqueue_failed", {
          method: "POST", apiPath, status: 201, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    if (e instanceof PaymentSettlementFailure) {
      return NextResponse.json({ error: e.code }, { status: 400 })
    }
    const err = e as Error
    apiLog("error", "member.membership_fee.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * PATCH: Edit / replace an existing membership fee payment.
 * Implements Approach A (Void & Re-issue):
 * 1. Outflow settlement reverses original transaction funds via settlePaymentByMode.
 * 2. Marks original transaction as status = 'Cancelled'.
 * 3. Marks linked invoice_payments row as status = 'Cancelled' and re-syncs invoice.
 * 4. Inflow settlement applies new payment funds via settlePaymentByMode.
 * 5. Creates replacement transaction row.
 * 6. Records new invoice_payments row and re-syncs invoice.
 * 7. Recalculates and updates membership_fees running totals.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const transactionId = typeof body.transaction_id === "string" ? body.transaction_id.trim() : ""
    const newAmount = Number(body.amount)
    const newMode = body.mode as string
    const reason = typeof body.reason === "string" ? body.reason.trim() : "Edited by staff"
    const referenceNumber = typeof body.reference_number === "string" ? body.reference_number.trim() : ""
    const paymentDateRaw = typeof body.paymentDate === "string" ? body.paymentDate.trim() : ""
    const bankAccountIdInput = typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""

    if (!transactionId) {
      return NextResponse.json({ error: "missing_transaction_id" }, { status: 400 })
    }
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!newMode || !validModes.includes(String(newMode))) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }

    const newCharges = body?.transaction_charges == null || body?.transaction_charges === ""
      ? 0
      : Number(body.transaction_charges)
    if (Number.isNaN(newCharges) || newCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }

    let resolvedPaymentDate = new Date()
    if (paymentDateRaw) {
      const parsed = new Date(paymentDateRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
      }
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)
      if (parsed.getTime() > endOfToday.getTime()) {
        return NextResponse.json({ error: "payment_date_in_future" }, { status: 400 })
      }
      resolvedPaymentDate = parsed
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_membership_fee")
      if (!allowed) return { error: "missing_permission:edit_membership_fee" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, status, full_name, member_number, email FROM members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const memberCheck = assertMemberActiveRow(memberRow)
      if (!memberCheck.ok) {
        return {
          error: memberCheck.error as "member_inactive",
          memberStatus: memberCheck.status as MemberStatus,
        }
      }

      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      // Fetch original transaction
      const txRes = await client.query<{
        id: string
        institution_id: string
        branch_id: string
        member_id: string
        amount: string
        charges: string | null
        mode: string
        reference_number: string | null
        bank_account_id: string | null
        status: string
        description: string | null
        transaction_number: string
        transaction_date: string
      }>(
        `SELECT id, institution_id, branch_id, member_id, amount, charges, mode,
                reference_number, bank_account_id, status, description, transaction_number, transaction_date
         FROM transactions
         WHERE id = $1 AND institution_id = $2 AND member_id = $3 AND type = 'Fee Payment'`,
        [transactionId, actor.institution_id, memberId]
      )
      const originalTx = txRes.rows[0]
      if (!originalTx) return { error: "transaction_not_found" as const }
      if (originalTx.status === "Cancelled" || originalTx.status === "Reversed") {
        return { error: "transaction_already_cancelled" as const }
      }

      // Find linked invoice id
      const invPayRes = await client.query<{ id: string; invoice_id: string }>(
        `SELECT id, invoice_id FROM invoice_payments WHERE transaction_id = $1`,
        [originalTx.id]
      )
      const linkedInvoiceId = invPayRes.rows[0]?.invoice_id || null

      const originalAmount = Number(originalTx.amount)
      const originalCharges = originalTx.charges ? Number(originalTx.charges) : 0

      // Check remaining fee limit
      const feeRes = await client.query<{ id: string; amount_paid: string; total_membership_fee: string; balance_after: string; invoice_id: string | null }>(
        `SELECT id, amount_paid, total_membership_fee, balance_after, invoice_id
         FROM membership_fees
         WHERE institution_id = $1 AND member_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [actor.institution_id, memberId]
      )
      const feeRow = feeRes.rows[0]
      const totalMembershipFee = Number(feeRow?.total_membership_fee || 0)
      const currentPaid = Number(feeRow?.amount_paid || 0)
      const paidWithoutOld = Math.max(0, currentPaid - originalAmount)
      const remainingForEdit = Math.max(0, totalMembershipFee - paidWithoutOld)

      if (totalMembershipFee > 0 && newAmount > remainingForEdit + 0.01) {
        return { error: "amount_exceeds_remaining" as const, remaining: remainingForEdit }
      }

      const txDate = resolvedPaymentDate.toISOString()
      const newPaid = paidWithoutOld + newAmount
      const newBalanceBefore = totalMembershipFee
      const newBalanceAfter = Math.max(0, totalMembershipFee - newPaid)

      try {
        await client.query("BEGIN")

        const originalMode =
          originalTx.mode === "Cheque" || originalTx.mode === "Card"
            ? "Bank Transfer"
            : originalTx.mode

        // 1. Outflow settlement for original transaction
        await settlePaymentByMode(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount: originalAmount,
          charges: originalCharges,
          mode: originalMode,
          flow: "outflow",
          actor,
          bankAccountId: originalTx.bank_account_id,
          referenceNumber: originalTx.reference_number,
        })

        // 2. Mark original transaction as Cancelled
        const updatedOldDesc = `${originalTx.description || "Fee payment"} (Replaced by new payment: ${reason})`
        await client.query(
          `UPDATE transactions
              SET status = 'Cancelled',
                  description = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [updatedOldDesc, originalTx.id]
        )

        // 3. Mark original invoice_payments row as Cancelled and re-sync invoice
        await cancelInvoicePaymentByTransactionId(client, originalTx.id, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          userId: actor.id,
        })

        const effectiveNewMode =
          newMode === "Cheque" || newMode === "Card" ? "Bank Transfer" : newMode

        // 4. Inflow settlement for replacement payment
        const { bankAccount: settledBankAccount } = await settlePaymentByMode(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount: newAmount,
          charges: newCharges,
          mode: effectiveNewMode,
          flow: "inflow",
          actor,
          bankAccountId: bankAccountIdInput || null,
          referenceNumber: referenceNumber || null,
        })

        // 5. Create replacement transaction
        const newTx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          memberId,
          bankAccountId: settledBankAccount?.id ?? null,
          type: "Fee Payment",
          amount: newAmount,
          mode: effectiveNewMode,
          description: `Fee payment (replaces ${originalTx.transaction_number}: ${reason})`,
          referenceNumber: referenceNumber || null,
          balanceBefore: newBalanceBefore,
          balanceAfter: newBalanceAfter,
          charges: newCharges,
          processedBy: actor.id,
          transactionDate: txDate,
        })

        // 6. Record replacement invoice_payment if linked to invoice
        const effectiveInvoiceId = linkedInvoiceId || feeRow?.invoice_id || null
        if (effectiveInvoiceId) {
          await recordInvoicePayment(client, {
            institutionId: actor.institution_id,
            branchId: memberRow.branch_id,
            invoiceId: effectiveInvoiceId,
            amount: newAmount,
            paymentDate: txDate,
            processedBy: actor.id,
            transactionId: newTx.id,
          })
          await syncInvoiceStatusFromPayments(client, effectiveInvoiceId, {
            institutionId: actor.institution_id,
            branchId: memberRow.branch_id,
            userId: actor.id,
          })
        }

        // 7. Update membership_fees running totals
        if (feeRow) {
          await client.query(
            `UPDATE membership_fees
                SET amount_paid = $1,
                    balance_before = $2,
                    balance_after = $3,
                    modified_by = $4,
                    updated_at = NOW()
              WHERE id = $5`,
            [newPaid, newBalanceBefore, newBalanceAfter, actor.id, feeRow.id]
          )

          await auditLogger.logUpdate(
            "membership_fees",
            feeRow.id,
            { amount_paid: currentPaid, balance_after: Number(feeRow.balance_after) },
            { amount_paid: newPaid, balance_after: newBalanceAfter, reason },
            actor.institution_id,
            actor.id,
            { branch_id: memberRow.branch_id },
            client
          )
        }

        await auditLogger.logUpdate(
          "transactions",
          originalTx.id,
          { status: originalTx.status },
          { status: "Cancelled", replaced_by: newTx.id, reason },
          actor.institution_id,
          actor.id,
          { branch_id: memberRow.branch_id },
          client
        )

        await client.query("COMMIT")

        return {
          ok: true,
          oldTransactionId: originalTx.id,
          newTransactionId: newTx.id,
          newTransactionNumber: newTx.transactionNumber,
          membershipFeePaid: newPaid,
        }
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_forbidden" ||
        result.error === "missing_permission:edit_membership_fee" ||
        result.error === "branch_inactive" ||
        result.error === "branch_not_found"
          ? 403
          : result.error === "member_not_found" || result.error === "transaction_not_found"
            ? 404
            : 400
      const body: Record<string, unknown> = { error: result.error }
      if ("remaining" in result) body.remaining = (result as any).remaining
      return NextResponse.json(body, { status })
    }

    apiLog("info", "member.membership_fee.patch.success", { method: "PATCH", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result, { status: 200 })
  } catch (e: unknown) {
    if (e instanceof PaymentSettlementFailure) {
      return NextResponse.json({ error: e.code }, { status: 400 })
    }
    const err = e as Error
    apiLog("error", "member.membership_fee.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * DELETE: Cancel / void an existing membership fee payment.
 * 1. Outflow settlement reverses transaction funds via settlePaymentByMode.
 * 2. Marks transaction row as status = 'Cancelled'.
 * 3. Marks linked invoice_payments row as status = 'Cancelled' and re-syncs invoice.
 * 4. Recalculates and updates membership_fees running totals.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const transactionId = typeof body.transaction_id === "string" ? body.transaction_id.trim() : ""
    const reason = typeof body.reason === "string" ? body.reason.trim() : "Cancelled by staff"

    if (!transactionId) {
      return NextResponse.json({ error: "missing_transaction_id" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_membership_fee")
      if (!allowed) return { error: "missing_permission:edit_membership_fee" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, status, full_name, member_number, email FROM members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      // Fetch transaction
      const txRes = await client.query<{
        id: string
        institution_id: string
        branch_id: string
        member_id: string
        amount: string
        charges: string | null
        mode: string
        reference_number: string | null
        bank_account_id: string | null
        status: string
        description: string | null
        transaction_number: string
        transaction_date: string
      }>(
        `SELECT id, institution_id, branch_id, member_id, amount, charges, mode,
                reference_number, bank_account_id, status, description, transaction_number, transaction_date
         FROM transactions
         WHERE id = $1 AND institution_id = $2 AND member_id = $3 AND type = 'Fee Payment'`,
        [transactionId, actor.institution_id, memberId]
      )
      const tx = txRes.rows[0]
      if (!tx) return { error: "transaction_not_found" as const }
      if (tx.status === "Cancelled" || tx.status === "Reversed") {
        return { error: "transaction_already_cancelled" as const }
      }

      const txAmount = Number(tx.amount)
      const txCharges = tx.charges ? Number(tx.charges) : 0

      try {
        await client.query("BEGIN")

        const txMode =
          tx.mode === "Cheque" || tx.mode === "Card" ? "Bank Transfer" : tx.mode

        // 1. Outflow settlement reverses branch float / bank account
        await settlePaymentByMode(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount: txAmount,
          charges: txCharges,
          mode: txMode,
          flow: "outflow",
          actor,
          bankAccountId: tx.bank_account_id,
          referenceNumber: tx.reference_number,
        })

        // 2. Mark transaction as Cancelled
        const updatedDesc = `${tx.description || "Fee payment"} (Cancelled: ${reason})`
        await client.query(
          `UPDATE transactions
              SET status = 'Cancelled',
                  description = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [updatedDesc, tx.id]
        )

        // 3. Mark linked invoice_payments row as Cancelled and re-sync invoice
        await cancelInvoicePaymentByTransactionId(client, tx.id, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          userId: actor.id,
        })

        // 4. Update membership_fees balance
        const feeRes = await client.query<{ id: string; amount_paid: string; total_membership_fee: string; balance_after: string }>(
          `SELECT id, amount_paid, total_membership_fee, balance_after
           FROM membership_fees
           WHERE institution_id = $1 AND member_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [actor.institution_id, memberId]
        )
        const feeRow = feeRes.rows[0]
        if (feeRow) {
          const currentPaid = Number(feeRow.amount_paid || 0)
          const totalFee = Number(feeRow.total_membership_fee || 0)
          const newPaid = Math.max(0, currentPaid - txAmount)
          const newBalanceAfter = Math.max(0, totalFee - newPaid)
          const newBalanceBefore = totalFee

          await client.query(
            `UPDATE membership_fees
                SET amount_paid = $1,
                    balance_before = $2,
                    balance_after = $3,
                    modified_by = $4,
                    updated_at = NOW()
              WHERE id = $5`,
            [newPaid, newBalanceBefore, newBalanceAfter, actor.id, feeRow.id]
          )

          await auditLogger.logUpdate(
            "membership_fees",
            feeRow.id,
            { amount_paid: currentPaid, balance_after: Number(feeRow.balance_after) },
            { amount_paid: newPaid, balance_after: newBalanceAfter, reason },
            actor.institution_id,
            actor.id,
            { branch_id: memberRow.branch_id },
            client
          )
        }

        await auditLogger.logUpdate(
          "transactions",
          tx.id,
          { status: tx.status },
          { status: "Cancelled", reason },
          actor.institution_id,
          actor.id,
          { branch_id: memberRow.branch_id },
          client
        )

        await client.query("COMMIT")

        return {
          ok: true,
          cancelledTransactionId: tx.id,
          transactionNumber: tx.transaction_number,
        }
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_forbidden" ||
        result.error === "missing_permission:edit_membership_fee" ||
        result.error === "branch_inactive" ||
        result.error === "branch_not_found" ||
        result.error === "member_inactive"
          ? 403
          : result.error === "member_not_found" || result.error === "transaction_not_found"
            ? 404
            : 400
      const body: Record<string, unknown> = { error: result.error }
      return NextResponse.json(body, { status })
    }

    apiLog("info", "member.membership_fee.delete.success", { method: "DELETE", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result, { status: 200 })
  } catch (e: unknown) {
    if (e instanceof PaymentSettlementFailure) {
      return NextResponse.json({ error: e.code }, { status: 400 })
    }
    const err = e as Error
    apiLog("error", "member.membership_fee.delete.error", { method: "DELETE", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
