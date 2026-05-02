import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const reportPeriod = String(body.report_period || "").trim().toLowerCase()
  const openingValue = Number(body.opening_value || 0)
  const capitalAdded = Number(body.capital_added || 0)
  const income = Number(body.income || 0)
  const expenses = Number(body.expenses || 0)
  const closingValue = Number(body.closing_value || 0)
  const notes = String(body.notes || "").trim() || null
  const cashflowIds = Array.isArray(body.cashflow_ids) ? body.cashflow_ids.map((v) => String(v || "").trim()).filter(Boolean) : []

  if (!/^[a-z]+-\d{4}$/.test(reportPeriod)) return NextResponse.json({ error: "invalid_report_period" }, { status: 400 })
  if ([openingValue, capitalAdded, income, expenses, closingValue].some((n) => Number.isNaN(n) || n < 0)) {
    return NextResponse.json({ error: "invalid_report_values" }, { status: 400 })
  }

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "record_monthly_report")
    if (!allowed) return NextResponse.json({ error: "missing_permission:record_monthly_report" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, current_value
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
      const previousCurrentValue = invRes.rows[0]?.current_value

      let adjustmentInflow = 0
      let adjustmentOutflow = 0
      if (cashflowIds.length > 0) {
        const selectedCashflowsRes = await client.query(
          `SELECT id, type, category, amount, report_id
           FROM senteloans_investment_cashflows
           WHERE investment_id = $1
             AND id = ANY($2::uuid[])`,
          [id, cashflowIds],
        )
        if (selectedCashflowsRes.rowCount !== cashflowIds.length) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "invalid_cashflow_selection" }, { status: 400 })
        }
        const alreadyReported = selectedCashflowsRes.rows.some((r) => r.report_id != null)
        if (alreadyReported) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "cashflow_already_reported" }, { status: 409 })
        }

        adjustmentInflow = selectedCashflowsRes.rows
          .filter((r) => String(r.category) === "adjustment" && String(r.type) === "inflow")
          .reduce((sum, r) => sum + Number(r.amount || 0), 0)
        adjustmentOutflow = selectedCashflowsRes.rows
          .filter((r) => String(r.category) === "adjustment" && String(r.type) === "outflow")
          .reduce((sum, r) => sum + Number(r.amount || 0), 0)
      }

      const expected = openingValue + capitalAdded + income - expenses + adjustmentInflow - adjustmentOutflow
      if (Math.abs(closingValue - expected) > 0.01) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "invalid_closing_value" }, { status: 400 })
      }

      const reportNumber = `RPT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      let reportId: string
      try {
        const reportRes = await client.query(
          `INSERT INTO senteloans_investment_reports (
             investment_id, report_number, report_period, opening_value, capital_added, income, expenses, closing_value,
             notes, created_by, modified_by, updated_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,NOW())
           RETURNING id`,
          [id, reportNumber, reportPeriod, openingValue, capitalAdded, income, expenses, closingValue, notes, actor.id],
        )
        reportId = String(reportRes.rows[0]?.id || "")
      } catch (e: any) {
        if (String(e?.code) === "23505") {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "report_period_exists" }, { status: 409 })
        }
        throw e
      }

      await auditLogger.logInsert(
        "senteloans_investment_reports",
        reportId,
        {
          investment_id: id,
          report_number: reportNumber,
          report_period: reportPeriod,
          opening_value: openingValue,
          capital_added: capitalAdded,
          income,
          expenses,
          closing_value: closingValue,
          notes,
          linked_cashflow_ids: cashflowIds,
        },
        actor.institution_id,
        actor.id,
        undefined,
        client,
      )

      if (cashflowIds.length > 0) {
        await client.query(
          `UPDATE senteloans_investment_cashflows
           SET report_id = $1
           WHERE investment_id = $2
             AND id = ANY($3::uuid[])`,
          [reportId, id, cashflowIds],
        )
      }

      const valIns = await client.query(
        `INSERT INTO senteloans_investment_valuations (investment_id, valuation_date, value, notes)
         VALUES ($1, CURRENT_DATE, $2, $3)
         RETURNING id, valuation_date`,
        [id, closingValue, `${reportPeriod} report valuation`],
      )
      const valRow = valIns.rows[0] as { id: string; valuation_date: string } | undefined
      const valuationId = String(valRow?.id || "")
      if (valuationId) {
        await auditLogger.logInsert(
          "senteloans_investment_valuations",
          valuationId,
          {
            investment_id: id,
            valuation_date: valRow?.valuation_date,
            value: closingValue,
            notes: `${reportPeriod} report valuation`,
          },
          actor.institution_id,
          actor.id,
          undefined,
          client,
        )
      }

      await client.query(
        `UPDATE senteloans_investments
         SET current_value = $1,
             modified_by = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [closingValue, actor.id, id],
      )
      await auditLogger.logUpdate(
        "senteloans_investments",
        id,
        { current_value: previousCurrentValue },
        { current_value: closingValue },
        actor.institution_id,
        actor.id,
        undefined,
        client,
      )

      await client.query("COMMIT")
      return NextResponse.json({ ok: true, id: reportId }, { status: 201 })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    }
  })
}

