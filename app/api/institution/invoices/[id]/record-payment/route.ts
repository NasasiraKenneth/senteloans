import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { assertMemberActiveRow, type MemberStatus } from "@/lib/members/member-status"
import { applyDailyFinanceEntry } from "@/lib/finances/daily-finance"
import {
  adjustBankAccountBalance,
  getBranchBankAccount,
  type BankAccountRow,
} from "@/lib/finances/bank-account"
import {
  getInvoicePaymentSummary,
  recordInvoicePayment,
  syncInvoiceStatusFromPayments,
} from "@/lib/invoices/invoice-payments"
import {
  canRecordInvoicePayment,
  isPaidInvoiceStatus,
  normalizeInvoiceStatus,
} from "@/lib/invoices/status"
import { notifyInvoicePayment } from "@/lib/notifications/invoice-payment-events"
import { enqueueInvoicePaymentEmail } from "@/lib/email/invoice-payment-emails"
import { createTransaction } from "@/lib/transactions/create-transaction"

const BANK_ROUTED_MODES = ["Bank Transfer", "Cheque", "Card"]
const VALID_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

type InvoiceRecordPaymentPostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  member: {
    id: string
    full_name: string
    member_number: string
    email: string
  } | null
  thirdPartyAgent: { id: string; name: string } | null
  transaction: { id: string; transaction_number: string; amount: number }
  invoice: {
    id: string
    invoice_number: string
    amount: number
    fullySettled: boolean
    outstanding: number
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiPath = getApiPath(req)
  try {
    const { id: invoiceId } = await params
    if (!invoiceId) {
      return NextResponse.json({ error: "invoice_id_required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = Number(body.amount)
    const mode = typeof body.mode === "string" ? body.mode : ""
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : ""
    const referenceNumber =
      typeof body.reference_number === "string" ? body.reference_number.trim() : ""
    const paymentDateRaw =
      typeof body.payment_date === "string"
        ? body.payment_date.trim()
        : typeof body.paymentDate === "string"
          ? body.paymentDate.trim()
          : ""
    const bankAccountIdInput =
      typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!mode || !VALID_MODES.includes(mode)) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
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
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_invoice")
      if (!allowed) return { error: "missing_permission:edit_invoice" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const isSuperAdminActor = isSuperAdmin(actor)
      if (!isSuperAdminActor && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const invoiceRes = await client.query<{
        id: string
        institution_id: string
        branch_id: string
        member_id: string | null
        third_party_agent_id: string | null
        invoice_number: string
        total_amount: string | number
        status: string
      }>(
        `SELECT id, institution_id, branch_id, member_id, third_party_agent_id,
                invoice_number, total_amount, status
         FROM invoices
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdminActor ? "" : "AND branch_id = $3"}`,
        isSuperAdminActor
          ? [invoiceId, actor.institution_id]
          : [invoiceId, actor.institution_id, actor.branch_id],
      )
      const invoiceRow = invoiceRes.rows[0]
      if (!invoiceRow) return { error: "invoice_not_found" as const }

      const totalAmount = round2(Number(invoiceRow.total_amount || 0))
      const summary = await getInvoicePaymentSummary(client, invoiceId, totalAmount)

      if (
        !canRecordInvoicePayment({
          status: invoiceRow.status,
          total_amount: totalAmount,
          paid_amount: summary.paid_amount,
          outstanding: summary.outstanding,
        })
      ) {
        const status = normalizeInvoiceStatus(invoiceRow.status)
        if (status === "draft" || status === "cancelled") {
          return { error: "invoice_not_payable" as const }
        }
        if (isPaidInvoiceStatus(status) || summary.outstanding <= 0) {
          return { error: "invoice_fully_paid" as const }
        }
        return { error: "invoice_not_payable" as const }
      }

      if (amount > summary.outstanding + 0.01) {
        return {
          error: "amount_exceeds_outstanding" as const,
          outstanding: summary.outstanding,
        }
      }

      const branchCheck = await assertBranchActive(client, invoiceRow.branch_id)
      if (!branchCheck.ok) {
        return { error: branchCheck.error as "branch_not_found" | "branch_inactive" }
      }

      if (mode !== "Cash" && !referenceNumber) {
        return { error: "reference_number_required" as const }
      }

      let bankAccount: BankAccountRow | null = null
      if (BANK_ROUTED_MODES.includes(mode)) {
        if (!bankAccountIdInput) return { error: "bank_account_required" as const }
        bankAccount = await getBranchBankAccount(client, {
          bankAccountId: bankAccountIdInput,
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
        })
        if (!bankAccount) return { error: "bank_account_not_found" as const }
      }

      let memberRow: {
        id: string
        full_name: string
        member_number: string
        email: string | null
        status: MemberStatus
      } | null = null
      let thirdPartyAgentRow: { id: string; name: string } | null = null

      if (invoiceRow.member_id) {
        const memberRes = await client.query<{
          id: string
          full_name: string
          member_number: string
          email: string | null
          status: MemberStatus
        }>(
          `SELECT id, full_name, member_number, email, status
           FROM members WHERE id = $1 AND institution_id = $2`,
          [invoiceRow.member_id, actor.institution_id],
        )
        memberRow = memberRes.rows[0] ?? null
        if (!memberRow) return { error: "member_not_found" as const }
        const memberCheck = assertMemberActiveRow(memberRow)
        if (!memberCheck.ok) return { error: "member_inactive" as const }
      } else if (invoiceRow.third_party_agent_id) {
        const agentRes = await client.query<{ id: string; name: string }>(
          `SELECT id, name FROM third_party_agents
           WHERE id = $1 AND institution_id = $2`,
          [invoiceRow.third_party_agent_id, actor.institution_id],
        )
        thirdPartyAgentRow = agentRes.rows[0] ?? null
        if (!thirdPartyAgentRow) return { error: "third_party_agent_not_found" as const }
      }

      const currencyRes = await client.query<{ currency: string | null }>(
        `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
        [invoiceRow.branch_id],
      )
      const currency = currencyRes.rows[0]?.currency || "UGX"

      const balanceBefore = summary.outstanding
      const balanceAfter = round2(Math.max(summary.outstanding - amount, 0))
      const txDate = resolvedPaymentDate.toISOString()
      const txDescription =
        description ||
        `Invoice payment — ${invoiceRow.invoice_number}`

      try {
        await client.query("BEGIN")

        const tx = await createTransaction(client, {
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
          memberId: memberRow?.id ?? null,
          thirdPartyAgentId: thirdPartyAgentRow?.id ?? null,
          bankAccountId: bankAccount?.id ?? null,
          type: "Invoice Payment",
          amount,
          mode,
          description: txDescription,
          referenceNumber: referenceNumber || null,
          balanceBefore,
          balanceAfter,
          processedBy: actor.id,
          transactionDate: txDate,
        })

        if (bankAccount) {
          await adjustBankAccountBalance(client, {
            account: bankAccount,
            amount,
            actor,
          })
        }

        await applyDailyFinanceEntry(client, {
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
          amount,
          mode,
          actor,
        })

        await recordInvoicePayment(client, {
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
          invoiceId,
          amount,
          paymentDate: txDate,
          processedBy: actor.id,
          transactionId: tx.id,
        })

        const synced = await syncInvoiceStatusFromPayments(client, invoiceId, {
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
          userId: actor.id,
        })

        const instRes = await client.query<{ name: string }>(
          `SELECT name FROM institutions WHERE id = $1`,
          [actor.institution_id],
        )

        const postCommit: InvoiceRecordPaymentPostCommit = {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: invoiceRow.branch_id,
          institutionName: instRes.rows[0]?.name || "",
          currency,
          member: memberRow
            ? {
                id: memberRow.id,
                full_name: String(memberRow.full_name || ""),
                member_number: String(memberRow.member_number || ""),
                email: memberRow.email ? String(memberRow.email) : "",
              }
            : null,
          thirdPartyAgent: thirdPartyAgentRow,
          transaction: {
            id: tx.id,
            transaction_number: tx.transactionNumber,
            amount,
          },
          invoice: {
            id: invoiceId,
            invoice_number: invoiceRow.invoice_number,
            amount,
            fullySettled: synced.status === "fully paid",
            outstanding: synced.outstanding,
          },
        }

        await client.query("COMMIT")

        return {
          ok: true,
          transaction_id: tx.id,
          transaction_number: tx.transactionNumber,
          invoice_id: invoiceId,
          invoice_number: invoiceRow.invoice_number,
          paid_amount: synced.paid_amount,
          outstanding: synced.outstanding,
          status: synced.status,
          postCommit,
        }
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "invoice_not_found" ||
        errorCode === "member_not_found" ||
        errorCode === "third_party_agent_not_found"
          ? 404
          : errorCode === "user_not_linked" ||
              errorCode === "missing_permission:edit_invoice" ||
              errorCode === "super_admin_write_blocked" ||
              errorCode === "branch_inactive" ||
              errorCode === "member_inactive"
            ? 403
            : 400

      apiLog("warn", "invoice.record_payment.denied", {
        method: "POST",
        apiPath,
        status: statusCode,
        error: result.error,
        invoiceId,
        authUserId: session.user.authUserId,
      })

      const payload: Record<string, unknown> = { error: result.error }
      if ("message" in result && result.message) payload.message = result.message
      if ("outstanding" in result) payload.outstanding = (result as { outstanding?: number }).outstanding
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "invoice.record_payment.success", {
      method: "POST",
      apiPath,
      status: 201,
      invoiceId,
      authUserId: session.user.authUserId,
    })

    const ctx = "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyInvoicePayment({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            member: ctx.member
              ? {
                  id: ctx.member.id,
                  full_name: ctx.member.full_name,
                  member_number: ctx.member.member_number,
                }
              : null,
            thirdPartyAgent: ctx.thirdPartyAgent,
            transaction: ctx.transaction,
            invoice: ctx.invoice,
            currency: ctx.currency,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "invoice.record_payment.notifications_dispatched"
            : "invoice.record_payment.notifications_partial",
          {
            method: "POST",
            apiPath,
            invoiceId,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "invoice.record_payment.notifications_failed", {
          method: "POST",
          apiPath,
          invoiceId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      if (ctx.member) {
        try {
          const emailRes = await enqueueInvoicePaymentEmail({
            member: ctx.member,
            institutionName: ctx.institutionName,
            currency: ctx.currency,
            payment: {
              amount: ctx.invoice.amount,
              outstanding: ctx.invoice.outstanding,
              fullySettled: ctx.invoice.fullySettled,
            },
            invoice: {
              id: ctx.invoice.id,
              invoice_number: ctx.invoice.invoice_number,
            },
            transaction: ctx.transaction,
            context: {
              institutionId: ctx.institutionId,
              branchId: ctx.branchId,
              actorId: ctx.actorId,
            },
          })
          apiLog(
            emailRes.errors.length ? "warn" : "info",
            emailRes.errors.length
              ? "invoice.record_payment.email_enqueue_partial"
              : "invoice.record_payment.email_enqueued",
            {
              method: "POST",
              apiPath,
              invoiceId,
              enqueued: emailRes.enqueued,
              skipped: emailRes.skipped,
              ...(emailRes.errors.length ? { errors: emailRes.errors } : {}),
            },
          )
        } catch (emailErr) {
          apiLog("error", "invoice.record_payment.email_enqueue_failed", {
            method: "POST",
            apiPath,
            invoiceId,
            error: (emailErr as Error)?.message || "email_enqueue_failed",
          })
        }
      }
    }

    const { postCommit: _postCommit, ...responseBody } = result
    return NextResponse.json(responseBody, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "invoice.record_payment.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    )
  }
}
