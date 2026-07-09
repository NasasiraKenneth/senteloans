import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertInvestmentWriteAccess,
  investmentRouteDenialResponse,
} from "@/lib/api/investment-access"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import {
  mapPaymentSettlementFailure,
  recordInvestmentCashflowPayment,
  type InvestmentCashflowCategory,
  type InvestmentCashflowDirection,
} from "@/lib/investments/investment-cashflow-settlement"
import {
  computeInvestmentValuationClosing,
  getLatestInvestmentClosingValue,
  recordInvestmentValuation,
} from "@/lib/investments/investment-valuation"
import { notifyInvestmentCashflowRecorded } from "@/lib/notifications/investment-events"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string, { activeOnly: false })
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasPermission(client, actor, "view_investments")
    if (!allowed) return NextResponse.json({ error: "missing_permission:view_investments" }, { status: 403 })

    const superAdmin = isSuperAdmin(actor)
    if (!superAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const invRes = await client.query(
      `SELECT id, current_value
       FROM investments
       WHERE id = $1 AND institution_id = $2
       ${superAdmin ? "" : "AND branch_id = $3"}
       LIMIT 1`,
      superAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
    const investmentCurrentValue = Number(invRes.rows[0]?.current_value || 0)

    const cashflowsRes = await client.query(
      `SELECT
         cf.id,
         cf.investment_id,
         cf.transaction_id,
         t.transaction_number,
         cf.type,
         cf.category,
         cf.amount,
         cf.description,
         cf.date,
         cf.created_at
       FROM investment_cashflows cf
       LEFT JOIN transactions t ON t.id = cf.transaction_id
       WHERE cf.investment_id = $1
       ORDER BY COALESCE(cf.date, cf.created_at::date) DESC NULLS LAST, cf.created_at DESC`,
      [id],
    )
    const previousValRes = await client.query(
      `SELECT closing_value
       FROM investment_valuations
       WHERE investment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id],
    )
    const previousAdjustmentValue = previousValRes.rowCount
      ? Number(previousValRes.rows[0]?.closing_value || 0)
      : investmentCurrentValue

    return NextResponse.json({ items: cashflowsRes.rows, meta: { previous_adjustment_value: previousAdjustmentValue } })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const type = String(body.type || "").trim().toLowerCase()
  const category = String(body.category || "").trim().toLowerCase()
  const amount = Number(body.amount || 0)
  const currentValue = Number(body.current_value ?? 0)
  const description = String(body.description || "").trim() || null
  const date = String(body.date || "").trim()
  const modeRaw = String(body.mode ?? body.payment_mode ?? "").trim()
  const mode = modeRaw || null
  const reference_number = String(body.reference_number ?? body.referenceNumber ?? "").trim()
  const bank_account_id = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()
  const transactionChargesRaw = body.transaction_charges ?? body.transactionCharges
  const transactionCharges =
    transactionChargesRaw == null || transactionChargesRaw === ""
      ? 0
      : Number(transactionChargesRaw)

  if (!["inflow", "outflow"].includes(type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  if (!["capital", "income", "expense", "adjustment"].includes(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 })
  }
  if (
    category !== "adjustment" &&
    ((type === "inflow" && category === "expense") || (type === "outflow" && category === "income"))
  ) {
    return NextResponse.json({ error: "invalid_type_category_combination" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 })
  if (category !== "adjustment") {
    if (!mode) return NextResponse.json({ error: "mode_required" }, { status: 400 })
    if (!(PAYMENT_MODES as readonly string[]).includes(mode)) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }
    if (!Number.isFinite(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }
    if (mode === "Cash" && transactionCharges > 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }
    if (category === "income" && transactionCharges > 0) {
      return NextResponse.json({ error: "transaction_charges_not_allowed" }, { status: 400 })
    }
    if (type === "outflow" && category === "capital" && transactionCharges > 0) {
      return NextResponse.json({ error: "transaction_charges_not_allowed" }, { status: 400 })
    }
    const paymentModeError = validatePaymentModeInput({
      mode,
      referenceNumber: reference_number,
      bankAccountId: bank_account_id,
    })
    if (paymentModeError) {
      return NextResponse.json({ error: paymentModeError }, { status: 400 })
    }
  }
  if (category !== "adjustment" && (Number.isNaN(amount) || amount <= 0)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }
  if (category === "adjustment" && (Number.isNaN(currentValue) || currentValue < 0)) {
    return NextResponse.json({ error: "invalid_current_value" }, { status: 400 })
  }

  const result = await runWithAuth(session.user.authUserId, async (client) => {
    const access = await assertInvestmentWriteAccess(
      client,
      session.user.authUserId as string,
      "record_cashflow",
    )
    if (!access.ok) {
      const { status, body } = investmentRouteDenialResponse(access)
      return NextResponse.json(body, { status })
    }
    const { actor } = access

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, institution_id, branch_id, provider_id, investment_number, investment_name, status, current_value
         FROM investments
         WHERE id = $1 AND institution_id = $2 AND branch_id = $3
         LIMIT 1`,
        [id, actor.institution_id, actor.branch_id],
      )
      if (invRes.rowCount === 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
      }
      const inv = invRes.rows[0] as {
        id: string
        institution_id: string
        branch_id: string
        provider_id: string | null
        investment_number: string | null
        investment_name: string | null
        status: string | null
        current_value: string | number | null
      }
      const invStatus = String(inv.status || "").trim().toLowerCase()
      if (invStatus !== "active" && invStatus !== "under_development") {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "investment_not_in_operation" }, { status: 409 })
      }

      const settlementCharges = transactionCharges > 0 ? transactionCharges : null
      let effectiveAmount = amount
      let closingValue = 0

      const openingValue = await getLatestInvestmentClosingValue(
        client,
        id,
        Number(inv.current_value || 0),
      )

      let transactionId: string | null = null
      if (category === "adjustment") {
        if (type === "inflow") {
          if (!(currentValue > openingValue)) {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "adjustment_inflow_requires_higher_current_value" }, { status: 400 })
          }
          effectiveAmount = currentValue - openingValue
          closingValue = currentValue
        } else {
          if (!(currentValue < openingValue)) {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "adjustment_outflow_requires_lower_current_value" }, { status: 400 })
          }
          effectiveAmount = openingValue - currentValue
          closingValue = currentValue
        }
      } else {
        closingValue = computeInvestmentValuationClosing(
          openingValue,
          type as InvestmentCashflowDirection,
          category as InvestmentCashflowCategory,
          effectiveAmount,
        )
      }

      effectiveAmount = Math.abs(effectiveAmount)
      if (!(effectiveAmount > 0)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "adjustment_difference_must_be_positive" }, { status: 400 })
      }
      if (closingValue < 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "negative_closing_value" }, { status: 400 })
      }
      if (category !== "adjustment") {
        try {
          const payment = await recordInvestmentCashflowPayment({
            client,
            actor,
            investment: inv,
            type: type as InvestmentCashflowDirection,
            category: category as InvestmentCashflowCategory,
            amount: effectiveAmount,
            charges: settlementCharges ?? 0,
            mode: mode!,
            date,
            description,
            referenceNumber: reference_number,
            bankAccountId: bank_account_id,
          })
          transactionId = payment.transactionId
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: mapPaymentSettlementFailure(e) }, { status: 400 })
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "transaction_number_generation_failed" }, { status: 500 })
          }
          throw e
        }
      }

      const insertRes = await client.query(
        `INSERT INTO investment_cashflows (investment_id, transaction_id, type, category, amount, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [id, transactionId, type, category, effectiveAmount, description, date],
      )
      const cashflowId = String(insertRes.rows[0]?.id || "")
      await auditLogger.logInsert(
        "investment_cashflows",
        cashflowId,
        {
          investment_id: id,
          transaction_id: transactionId,
          type,
          category,
          amount: effectiveAmount,
          description,
          date,
        },
        inv.institution_id,
        actor.id,
        { branch_id: inv.branch_id },
        client,
      )

      const valuation = await recordInvestmentValuation({
        client,
        investmentId: id,
        institutionId: inv.institution_id,
        branchId: inv.branch_id,
        actorId: actor.id,
        valuationDate: date,
        openingValue,
        closingValue,
        previousCurrentValue: Number(inv.current_value || 0),
      })

      await client.query("COMMIT")
      return {
        ok: true as const,
        id: cashflowId,
        transaction_id: transactionId,
        valuation_id: valuation.id,
        opening_value: openingValue,
        closing_value: closingValue,
        postCommit: {
          actorId: actor.id,
          institutionId: inv.institution_id,
          branchId: inv.branch_id,
          investment: {
            id,
            investment_name: inv.investment_name,
            investment_number: inv.investment_number,
          },
          cashflow: {
            id: cashflowId,
            type,
            category,
            amount: effectiveAmount,
            date,
          },
          valuation: {
            opening_value: openingValue,
            closing_value: closingValue,
          },
          transactionId,
        },
      }
    } catch (e: any) {
      await client.query("ROLLBACK")
      throw e
    }
  })

  if (result instanceof Response) return result

  const ctx = result && "postCommit" in result ? result.postCommit : null
  if (ctx) {
    try {
      const notifyRes = await runWithoutAuth((notifyClient) =>
        notifyInvestmentCashflowRecorded({
          client: notifyClient,
          actor: {
            id: ctx.actorId,
            institution_id: ctx.institutionId,
            branch_id: ctx.branchId,
          },
          investment: ctx.investment,
          cashflow: ctx.cashflow,
          valuation: ctx.valuation,
          transactionId: ctx.transactionId,
        }),
      )
      apiLog(
        notifyRes.ok ? "info" : "warn",
        notifyRes.ok
          ? "investments.cashflows.create.notifications_dispatched"
          : "investments.cashflows.create.notifications_partial",
        {
          method: "POST",
          apiPath,
          status: 201,
          investmentId: id,
          cashflowId: result.id,
          staffNotifications: notifyRes.staffNotifications,
          ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
        },
      )
    } catch (notifyErr) {
      apiLog("error", "investments.cashflows.create.notifications_failed", {
        method: "POST",
        apiPath,
        status: 201,
        investmentId: id,
        cashflowId: result.id,
        error: (notifyErr as Error)?.message || "notify_failed",
      })
    }
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      transaction_id: result.transaction_id,
      valuation_id: result.valuation_id,
      opening_value: result.opening_value,
      closing_value: result.closing_value,
    },
    { status: 201 },
  )
}
