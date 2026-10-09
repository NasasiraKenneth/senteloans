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
import { applyDailyFinanceEntry } from "@/lib/finances/daily-finance"
import { getBranchBankAccount, adjustBankAccountBalance, type BankAccountRow } from "@/lib/finances/bank-account"
import {
  findOpenMemberMembershipInvoice,
  recordInvoicePayment,
  syncInvoiceStatusFromPayments,
} from "@/lib/invoices/invoice-payments"
import { notifyMembershipFeePayment } from "@/lib/notifications/fee-events"
import { enqueueMembershipFeeEmails } from "@/lib/email/fee-emails"

// Bank-routed payment modes settle into a branch bank account.
const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]

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

      // Payment history from invoice_payments (linking transactions and invoices for partial payments)
      // with fallback to membership_fees for seed/legacy records.
      const paymentsRes = await client.query(
        `SELECT
            ip.id::text AS id,
            t.transaction_number,
            ip.amount::numeric AS amount,
            COALESCE(t.mode, 'Cash') AS mode,
            COALESCE(t.description, 'Membership fee payment') AS description,
            COALESCE(t.reference_number, '') AS reference_number,
            ip.payment_date AS transaction_date,
            'Completed'::transaction_status AS status
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
            mf.id::text AS id,
            'SEED-' || upper(substr(mf.id::text, 1, 8)) AS transaction_number,
            mf.amount_paid::numeric AS amount,
            'Cash' AS mode,
            'Membership fee payment' AS description,
            '' AS reference_number,
            mf.payment_date AS transaction_date,
            'Completed'::transaction_status AS status
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

    // Optional transaction charges (e.g. bank/mobile-money fees). Recorded on the
    // transaction only; must be a non-negative number.
    const transactionChargesRaw = body?.transaction_charges
    const transactionCharges =
      transactionChargesRaw == null || transactionChargesRaw === ""
        ? 0
        : Number(transactionChargesRaw)
    if (Number.isNaN(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }

    // Resolve payment date (defaults to now). Reject obviously bad input and
    // future dates so the audit trail / ledger stays sane.
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

      // Reusable branch gate: block fee payments against inactive branches.
      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      // Bank-routed payments settle into a branch bank account, which we credit
      // with the fee amount. Validate the selected account up-front.
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

        // Shared transaction writer: collision-safe number + audit log.
        const tx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          memberId,
          bankAccountId: bankAccount?.id ?? null,
          type: "Fee Payment",
          amount,
          mode,
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

        // Credit the selected branch bank account for bank-routed payments.
        if (bankAccount) {
          await adjustBankAccountBalance(client, {
            account: bankAccount,
            amount,
            actor,
          })
        }

        // Roll the fee payment into the branch's daily finance ledger for the
        // actual posting day (today). Backdated payments still post to today's
        // row so the running cash position stays accurate.
        await applyDailyFinanceEntry(client, {
          institutionId: actor.institution_id,
          branchId: memberRow.branch_id,
          amount,
          mode,
          actor,
        })

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
        result.error === "branch_not_found" ||
        result.error === "member_inactive"
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

    // Post-commit side-effects: notifications + emails. Best-effort — never
    // raise back to the client (the payment is already persisted).
    const ctx = postCommit as MembershipFeePostCommit | null
    if (ctx) {
      try {
        // Fresh client so staff fan-out can query users/roles.
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
    const err = e as Error
    apiLog("error", "member.membership_fee.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
