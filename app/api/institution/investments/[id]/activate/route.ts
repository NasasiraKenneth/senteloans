import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  assertInvestmentWriteAccess,
  investmentRouteDenialResponse,
} from "@/lib/api/investment-access"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import {
  mapPaymentSettlementFailure,
  recordInvestmentCashflowPayment,
} from "@/lib/investments/investment-cashflow-settlement"
import { recordInvestmentValuation } from "@/lib/investments/investment-valuation"
import { notifyInvestmentDevelopmentStarted } from "@/lib/notifications/investment-events"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

function amountsMatchDb(a: number, b: number): boolean {
  const x = Math.round(Number(a) * 100)
  const y = Math.round(Number(b) * 100)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id } = await params
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const startDate = String(body.start_date ?? "").trim().slice(0, 10)
  const maturityDate = String(body.maturity_date ?? "").trim().slice(0, 10)
  const mode = String(body.mode ?? body.payment_mode ?? "").trim()
  const description = String(body.description ?? "").trim() || null
  const principalAmount = Number(body.principal_amount ?? 0)
  const reference_number = String(body.reference_number ?? body.referenceNumber ?? "").trim()
  const bank_account_id = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()
  const transactionChargesRaw = body.transaction_charges
  const transactionCharges =
    transactionChargesRaw == null || transactionChargesRaw === ""
      ? 0
      : Number(transactionChargesRaw)

  if (!isDateOnly(startDate)) return NextResponse.json({ error: "invalid_start_date" }, { status: 400 })
  if (!isDateOnly(maturityDate)) return NextResponse.json({ error: "invalid_maturity_date" }, { status: 400 })
  if (maturityDate < startDate) return NextResponse.json({ error: "maturity_before_start" }, { status: 400 })
  if (!(PAYMENT_MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
  }
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
  }
  if (!Number.isFinite(transactionCharges) || transactionCharges < 0) {
    return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
  }
  if (mode === "Cash" && transactionCharges > 0) {
    return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
  }

  const paymentModeError = validatePaymentModeInput({
    mode,
    referenceNumber: reference_number,
    bankAccountId: bank_account_id,
  })
  if (paymentModeError) {
    return NextResponse.json({ error: paymentModeError }, { status: 400 })
  }

  const result = await runWithAuth(session.user.authUserId, async (client) => {
    const access = await assertInvestmentWriteAccess(
      client,
      session.user.authUserId as string,
      "edit_investment_status",
    )
    if (!access.ok) {
      const { status, body: denialBody } = investmentRouteDenialResponse(access)
      return { denied: true as const, status, body: denialBody }
    }
    const { actor } = access

    const invRes = await client.query(
      `SELECT id, institution_id, branch_id, provider_id, investment_number, investment_name, initial_amount, current_value, status, start_date, maturity_date
       FROM investments
       WHERE id = $1 AND institution_id = $2 AND branch_id = $3
       LIMIT 1`,
      [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) {
      return { error: "investment_not_found" as const }
    }

    const inv = invRes.rows[0] as {
      id: string
      institution_id: string
      branch_id: string
      provider_id: string | null
      investment_number: string | null
      investment_name: string | null
      initial_amount: string | number
      current_value: string | number | null
      status: string
      start_date: string | null
      maturity_date: string | null
    }
    const currentStatus = String(inv.status || "").toLowerCase()
    if (currentStatus !== "approved") {
      return { error: "investment_must_be_approved_first" as const }
    }

    const initialNum = Number(inv.initial_amount)
    if (!amountsMatchDb(principalAmount, initialNum)) {
      return { error: "principal_must_match_initial_amount" as const }
    }

    const amount = principalAmount
    const settlementCharges = transactionCharges > 0 ? transactionCharges : 0
    const investmentBranchId = String(inv.branch_id)
    const investmentLabel = String(inv.investment_number || inv.id).trim()
    const cashflowDescription =
      description || `Investment development start deposit (${investmentLabel})`
    const openingValue = amount
    const closingValue = amount

    let txCommitted = false
    await client.query("BEGIN")
    try {
      let transactionId: string
      try {
        const payment = await recordInvestmentCashflowPayment({
          client,
          actor,
          investment: inv,
          type: "inflow",
          category: "capital",
          amount,
          charges: settlementCharges,
          mode,
          date: startDate,
          description: cashflowDescription,
          referenceNumber: reference_number,
          bankAccountId: bank_account_id,
        })
        transactionId = payment.transactionId
      } catch (e: unknown) {
        if (e instanceof PaymentSettlementFailure) {
          return { error: mapPaymentSettlementFailure(e) as string }
        }
        const msg = (e as Error)?.message || ""
        if (msg === "transaction_insert_failed") {
          return { error: "transaction_number_generation_failed" as const }
        }
        throw e
      }

      const insertRes = await client.query(
        `INSERT INTO investment_cashflows (investment_id, transaction_id, type, category, amount, description, date)
         VALUES ($1, $2, 'inflow', 'capital', $3, $4, $5::date)
         RETURNING id`,
        [id, transactionId, amount, cashflowDescription, startDate],
      )
      const cashflowId = String(insertRes.rows[0]?.id || "")
      if (!cashflowId) {
        return { error: "cashflow_insert_failed" as const }
      }

      await auditLogger.logInsert(
        "investment_cashflows",
        cashflowId,
        {
          investment_id: id,
          transaction_id: transactionId,
          type: "inflow",
          category: "capital",
          amount,
          description: cashflowDescription,
          date: startDate,
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
        valuationDate: startDate,
        openingValue,
        closingValue,
        previousCurrentValue: Number(inv.current_value || 0),
      })

      await client.query(
        `UPDATE investments
         SET status = 'under_development',
             start_date = $1::date,
             maturity_date = $2::date,
             modified_by = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [startDate, maturityDate, actor.id, id],
      )

      await auditLogger.logUpdate(
        "investments",
        id,
        {
          status: inv.status,
          start_date: inv.start_date,
          maturity_date: inv.maturity_date,
        },
        {
          status: "under_development",
          start_date: startDate,
          maturity_date: maturityDate,
        },
        inv.institution_id,
        actor.id,
        { branch_id: inv.branch_id },
        client,
      )

      await client.query("COMMIT")
      txCommitted = true

      return {
        ok: true as const,
        transaction_id: transactionId,
        cashflow_id: cashflowId,
        valuation_id: valuation.id,
        opening_value: openingValue,
        closing_value: closingValue,
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: investmentBranchId,
          investment: {
            id,
            investment_name: inv.investment_name,
            investment_number: inv.investment_number,
            principal_amount: principalAmount,
            start_date: startDate,
            maturity_date: maturityDate,
          },
        },
      }
    } catch (e) {
      if (!txCommitted) await client.query("ROLLBACK")
      throw e
    }
  })

  if (result && "denied" in result && result.denied) {
    return NextResponse.json(result.body, { status: result.status })
  }

  if (result && "error" in result) {
    const err = result.error
    const statusCode =
      err === "investment_not_found"
        ? 404
        : err === "investment_must_be_approved_first"
          ? 409
          : err === "bank_account_insufficient_funds" ||
              err === "insufficient_cash_balance" ||
              err === "insufficient_mobile_money_balance"
            ? 400
            : 400
    return NextResponse.json({ error: err }, { status: statusCode })
  }

  const ctx = result && "postCommit" in result ? result.postCommit : null
  if (ctx) {
    try {
      const notifyRes = await runWithoutAuth((notifyClient) =>
        notifyInvestmentDevelopmentStarted({
          client: notifyClient,
          actor: {
            id: ctx.actorId,
            institution_id: ctx.institutionId,
            branch_id: ctx.branchId,
          },
          investment: ctx.investment,
        }),
      )
      apiLog(
        notifyRes.ok ? "info" : "warn",
        notifyRes.ok
          ? "investments.activate.notifications_dispatched"
          : "investments.activate.notifications_partial",
        {
          method: "POST",
          apiPath,
          status: 200,
          investmentId: id,
          staffNotifications: notifyRes.staffNotifications,
          ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
        },
      )
    } catch (notifyErr) {
      apiLog("error", "investments.activate.notifications_failed", {
        method: "POST",
        apiPath,
        status: 200,
        investmentId: id,
        error: (notifyErr as Error)?.message || "notify_failed",
      })
    }
  }

  const { postCommit: _postCommit, ...payload } = result
  return NextResponse.json(payload, { status: 200 })
}
