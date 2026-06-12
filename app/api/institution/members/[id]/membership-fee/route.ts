import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import { resolveActorContext, hasPermission } from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
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
        `SELECT membership_fee FROM config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
         FROM membership_fees
         WHERE institution_id = $1 AND member_id = $2`,
        [actor.institution_id, memberId]
      )
      const membershipFeePaid = Number(paidRes.rows[0]?.total_paid ?? 0)

      // Payment history from the domain table (seed rows have no transaction_number).
      const paymentsRes = await client.query(
        `SELECT
            mf.id,
            COALESCE(t.transaction_number, 'SEED-' || substr(mf.id::text, 1, 8)) AS transaction_number,
            mf.amount_paid AS amount,
            mf.mode,
            mf.description,
            mf.reference_number,
            mf.payment_date AS transaction_date,
            'Completed'::transaction_status AS status
         FROM membership_fees mf
         LEFT JOIN transactions t ON t.id = mf.transaction_id
         WHERE mf.institution_id = $1 AND mf.member_id = $2
         ORDER BY mf.payment_date DESC`,
        [actor.institution_id, memberId]
      )

      return {
        membershipFee,
        membershipFeePaid,
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

      // Reusable branch gate: block fee payments against inactive branches.
      const branchCheck = await assertBranchActive(client, memberRow.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      // Non-cash payments require a reference number.
      if (mode !== "Cash" && !referenceNumber) {
        return { error: "reference_number_required" as const }
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
        `SELECT membership_fee, currency FROM config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)
      const currency = (cfgRes.rows[0]?.currency as string) || "UGX"

      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
         FROM membership_fees
         WHERE institution_id = $1 AND member_id = $2`,
        [actor.institution_id, memberId]
      )
      const currentPaid = Number(paidRes.rows[0]?.total_paid ?? 0)
      const remaining = membershipFee - currentPaid

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

        const feeRes = await client.query(
          `INSERT INTO membership_fees
            (institution_id, branch_id, member_id, amount_paid, total_membership_fee, balance_before, balance_after, mode, reference_number, description, transaction_id, processed_by, payment_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            actor.institution_id,
            memberRow.branch_id,
            memberId,
            amount,
            membershipFee,
            balanceBefore,
            balanceAfter,
            mode,
            referenceNumber || null,
            description,
            txRow.id,
            actor.id,
            txDate,
          ]
        )
        const feeRow = feeRes.rows[0]

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
            mode,
            reference_number: referenceNumber || null,
            description,
            transaction_id: txRow.id,
            processed_by: actor.id,
            payment_date: txDate,
          },
          actor.institution_id,
          actor.id,
          { branch_id: memberRow.branch_id },
          client
        )

        const openInvoice = await findOpenMemberMembershipInvoice(
          client,
          actor.institution_id,
          memberId,
        )
        let invoicePayment: {
          invoice_id: string
          status: string
          paid_amount: number
          outstanding: number
        } | null = null
        let postCommitInvoice: MembershipFeePostCommit["invoice"] = null
        if (openInvoice) {
          await recordInvoicePayment(client, {
            institutionId: actor.institution_id,
            branchId: memberRow.branch_id,
            invoiceId: openInvoice.id,
            amount,
            paymentDate: txDate,
            processedBy: actor.id,
            membershipFeeId: feeRow.id,
          })
          const synced = await syncInvoiceStatusFromPayments(client, openInvoice.id)
          invoicePayment = {
            invoice_id: openInvoice.id,
            status: synced.status,
            paid_amount: synced.paid_amount,
            outstanding: synced.outstanding,
          }
          postCommitInvoice = {
            id: openInvoice.id,
            invoice_number: openInvoice.invoice_number,
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
          invoice: ctx.invoice
            ? {
                id: ctx.invoice.id,
                invoice_number: ctx.invoice.invoice_number,
                fullySettled: ctx.invoice.fullySettled,
              }
            : null,
          context: { institutionId: ctx.institutionId, actorId: ctx.actorId },
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
