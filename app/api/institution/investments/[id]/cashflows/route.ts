import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { insertTransactionInsertAuditLog } from "@/lib/audit/transaction-insert-audit"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "view_investments")
    if (!allowed) return NextResponse.json({ error: "missing_permission:view_investments" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const invRes = await client.query(
      `SELECT id
       FROM senteloans_investments
       WHERE id = $1 AND institution_id = $2
       ${isSuperAdmin ? "" : "AND branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })

    const cashflowsRes = await client.query(
      `SELECT
         cf.id,
         cf.investment_id,
         cf.transaction_id,
         t.transaction_number,
         cf.report_id,
         r.report_number,
         cf.type,
         cf.category,
         cf.amount,
         cf.description,
         cf.date,
         cf.created_at
       FROM senteloans_investment_cashflows cf
       LEFT JOIN senteloans_transactions t ON t.id = cf.transaction_id
       LEFT JOIN senteloans_investment_reports r ON r.id = cf.report_id
       WHERE cf.investment_id = $1
       ORDER BY COALESCE(cf.date, cf.created_at::date) DESC NULLS LAST, cf.created_at DESC`,
      [id],
    )
    const previousValRes = await client.query(
      `SELECT value
       FROM senteloans_investment_valuations
       WHERE investment_id = $1
       ORDER BY valuation_date DESC, created_at DESC
       LIMIT 1`,
      [id],
    )
    const previousAdjustmentValue = previousValRes.rowCount
      ? Number(previousValRes.rows[0]?.value || 0)
      : 0

    return NextResponse.json({ items: cashflowsRes.rows, meta: { previous_adjustment_value: previousAdjustmentValue } })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const modeRaw = String(body.mode || "").trim()
  const mode = modeRaw || null

  if (!["inflow", "outflow"].includes(type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  if (!["capital", "income", "expense", "adjustment"].includes(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 })
  if (category !== "adjustment" && !mode) return NextResponse.json({ error: "mode_required" }, { status: 400 })
  if (mode && !["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].includes(mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
  }
  if (category !== "adjustment" && (Number.isNaN(amount) || amount <= 0)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }
  if (category === "adjustment" && (Number.isNaN(currentValue) || currentValue < 0)) {
    return NextResponse.json({ error: "invalid_current_value" }, { status: 400 })
  }

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "record_cashflow")
    if (!allowed) return NextResponse.json({ error: "missing_permission:record_cashflow" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, institution_id, branch_id, provider_id, investment_number
         FROM senteloans_investments
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdmin ? "" : "AND branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
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
      }

      const txType = type === "inflow" ? "Deposit" : "Withdrawal"
      const txDate = `${date}T00:00:00.000Z`
      let effectiveAmount = amount

      let transactionId: string | null = null
      if (category === "adjustment") {
        const prevValRes = await client.query(
          `SELECT value
           FROM senteloans_investment_valuations
           WHERE investment_id = $1
           ORDER BY valuation_date DESC, created_at DESC
           LIMIT 1`,
          [id],
        )
        const previousValue = prevValRes.rowCount ? Number(prevValRes.rows[0]?.value || 0) : 0
        if (type === "inflow") {
          if (!(currentValue > previousValue)) {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "adjustment_inflow_requires_higher_current_value" }, { status: 400 })
          }
          effectiveAmount = currentValue - previousValue
        } else {
          if (!(currentValue < previousValue)) {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "adjustment_outflow_requires_lower_current_value" }, { status: 400 })
          }
          effectiveAmount = previousValue - currentValue
        }
      }
      // Safety guard: adjustment difference must always be a positive stored amount.
      if (category === "adjustment") {
        effectiveAmount = Math.abs(effectiveAmount)
        if (!(effectiveAmount > 0)) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "adjustment_difference_must_be_positive" }, { status: 400 })
        }
      }
      if (category !== "adjustment") {
        const desc =
          description || `Investment cashflow (${inv.investment_number || inv.id})`
        const inserted = await insertWithTransactionNumberRetry(
          (transactionNumber) =>
            client.query(
              `INSERT INTO senteloans_transactions (
                 institution_id, branch_id, client_id, transaction_number, type, amount, mode, description,
                 reference_number, processed_by, transaction_date, status
               )
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Completed')
               RETURNING id`,
              [
                inv.institution_id,
                inv.branch_id,
                inv.provider_id,
                transactionNumber,
                txType,
                effectiveAmount,
                mode,
                desc,
                transactionNumber,
                actor.id,
                txDate,
              ],
            ),
          { prefix: "INV-CF" },
        )
        if (!inserted) {
          await client.query("ROLLBACK")
          return NextResponse.json(
            { error: "transaction_number_generation_failed" },
            { status: 500 },
          )
        }
        transactionId = inserted.row.id
        await insertTransactionInsertAuditLog(client, {
          institutionId: inv.institution_id,
          branchId: inv.branch_id,
          userId: actor.id,
          transactionId: inserted.row.id,
          newValues: {
            transaction_number: inserted.transactionNumber,
            type: txType,
            amount: effectiveAmount,
            mode,
            client_id: inv.provider_id,
            investment_id: id,
            source: "investment_cashflow",
            cashflow_category: category,
          },
        })
      }

      if (category === "adjustment") {
        try {
          const valRes = await client.query(
            `INSERT INTO senteloans_investment_valuations (investment_id, valuation_date, value, notes)
             VALUES ($1, $2::date, $3, $4)
             RETURNING id`,
            [id, date, currentValue, description],
          )
          const valuationId = String(valRes.rows[0]?.id || "")
          if (valuationId) {
            await auditLogger.logInsert(
              "senteloans_investment_valuations",
              valuationId,
              { investment_id: id, valuation_date: date, value: currentValue, notes: description },
              inv.institution_id,
              actor.id,
              undefined,
              client,
            )
          }
        } catch (e: any) {
          if (String(e?.code) === "23505") {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "valuation_exists_for_date" }, { status: 409 })
          }
          throw e
        }
      }

      const insertRes = await client.query(
        `INSERT INTO senteloans_investment_cashflows (investment_id, transaction_id, report_id, type, category, amount, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [id, transactionId, null, type, category, effectiveAmount, description, date],
      )
      const cashflowId = String(insertRes.rows[0]?.id || "")
      await auditLogger.logInsert(
        "senteloans_investment_cashflows",
        cashflowId,
        {
          investment_id: id,
          transaction_id: transactionId,
          report_id: null,
          type,
          category,
          amount: effectiveAmount,
          description,
          date,
        },
        inv.institution_id,
        actor.id,
        undefined,
        client,
      )
      await client.query("COMMIT")
      return NextResponse.json({ ok: true, id: cashflowId, transaction_id: transactionId }, { status: 201 })
    } catch (e: any) {
      await client.query("ROLLBACK")
      throw e
    }
  })
}
