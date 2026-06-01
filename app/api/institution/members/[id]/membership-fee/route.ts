import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  findOpenMemberMembershipInvoice,
  recordInvoicePayment,
  syncInvoiceStatusFromPayments,
} from "@/lib/invoices/invoice-payments"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
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
        `SELECT id, branch_id FROM senteloans_members WHERE institution_id = $1 AND id = $2`,
        [actor.institution_id, memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      const cfgRes = await client.query(
        `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
         FROM senteloans_membership_fees
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
         FROM senteloans_membership_fees mf
         LEFT JOIN senteloans_transactions t ON t.id = mf.transaction_id
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
    const referenceNumber = typeof body.reference_number === "string" ? body.reference_number : ""
    const paymentDateRaw = typeof body.paymentDate === "string" ? body.paymentDate.trim() : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
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

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_membership_fee")
      if (!allowed) return { error: "missing_permission:edit_membership_fee" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, status FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const cfgRes = await client.query(
        `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
         FROM senteloans_membership_fees
         WHERE institution_id = $1 AND member_id = $2`,
        [actor.institution_id, memberId]
      )
      const currentPaid = Number(paidRes.rows[0]?.total_paid ?? 0)
      const remaining = membershipFee - currentPaid

      if (membershipFee > 0 && amount > remaining + 0.01) {
        return { error: "amount_exceeds_remaining" as const, remaining }
      }

      const newPaid = currentPaid + amount
      const transactionNumber = `FEE-${Date.now()}`
      const txDate = resolvedPaymentDate.toISOString()
      const balanceBefore = Math.max(membershipFee - currentPaid, 0)
      const balanceAfter = Math.max(membershipFee - newPaid, 0)

      try {
        await client.query("BEGIN")

        const txRes = await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, branch_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, NULL, $4, 'Fee Payment', $5, $6, $7, $8, $9, $10, $11, $12, 'Completed')
           RETURNING id`,
          [
            actor.institution_id,
            memberRow.branch_id,
            memberId,
            transactionNumber,
            amount,
            mode,
            description,
            referenceNumber,
            balanceBefore,
            balanceAfter,
            actor.id,
            txDate,
          ]
        )
        const txRow = txRes.rows[0]
        if (!txRow) {
          await client.query("ROLLBACK")
          return { error: "insert_failed" as const }
        }

        const feeRes = await client.query(
          `INSERT INTO senteloans_membership_fees
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
          "senteloans_transactions",
          txRow.id,
          {
            member_id: memberId,
            branch_id: memberRow.branch_id,
            transaction_number: transactionNumber,
            type: "Fee Payment",
            amount,
            mode,
            description,
            reference_number: referenceNumber,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            processed_by: actor.id,
            transaction_date: txDate,
            status: "Completed",
          },
          actor.institution_id,
          actor.id,
          { branch_id: memberRow.branch_id },
          client
        )
        await auditLogger.logInsert(
          "senteloans_membership_fees",
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
        result.error === "cross_tenant_forbidden" || result.error === "missing_permission:edit_membership_fee" ? 403 :
        result.error === "member_not_found" ? 404 :
        400
      const body: Record<string, unknown> = { error: result.error }
      if ("remaining" in result) body.remaining = (result as any).remaining
      return NextResponse.json(body, { status })
    }
    apiLog("info", "member.membership_fee.create.success", { method: "POST", apiPath, status: 201, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.membership_fee.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
