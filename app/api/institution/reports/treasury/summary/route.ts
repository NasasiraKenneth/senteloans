import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  hasPermission,
  isSuperAdmin,
  requireStaffSession,
  resolveActorContext,
  scopeWhere,
} from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/reports/treasury/summary
 *
 * Returns the top-level KPI numbers for the treasury report.
 *
 * Currently scoped to compute Total Assets per the formula:
 *
 *   totalAssets =
 *       SUM(senteloans_daily_finances.total_amount)        -- yesterday's day-end balance
 *     + SUM(senteloans_loans.outstanding_balance)          -- only positive balances
 *     + SUM(senteloans_investments.initial_amount)
 *     + SUM(senteloans_investment_cashflows.amount)        -- WHERE category = 'capital'
 *     + SUM(senteloans_expense_cashflows.amount)           -- WHERE linked expense.type='Capital-expenses' AND cashflow.status='Completed'
 *
 * And Total Liabilities per the formula:
 *
 *   totalLiabilities =
 *       SUM(senteloans_institution_loans.outstanding_balance)  -- only positive balances
 *     + SUM(senteloans_unclaimed_deposits.amount)              -- status != 'claimed'
 *
 * The endpoint will be extended tab-by-tab as we wire additional KPIs
 * (equity, accumulated profit, etc.).
 *
 * Query params:
 *   - branch: single branch id, or "all" / empty for institution-wide totals.
 */
export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const branch = (url.searchParams.get("branch") || "").trim()
    const selectedBranchIds = branch && branch !== "all" ? [branch] : []

    const payload = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) {
        return { error: "user_not_linked" as const }
      }

      const allowed = await hasPermission(client, actor, "generate_treasury_reports")
      if (!allowed) {
        return { error: "missing_permission:generate_treasury_reports" as const }
      }

      if (!isSuperAdmin(actor) && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const dailyScope = scopeWhere({ tableAlias: "df", actor, selectedBranchIds })
      const loansScope = scopeWhere({ tableAlias: "l", actor, selectedBranchIds })
      const invScope = scopeWhere({ tableAlias: "i", actor, selectedBranchIds })
      const expScope = scopeWhere({ tableAlias: "e", actor, selectedBranchIds })
      const saccoLoansScope = scopeWhere({ tableAlias: "sl", actor, selectedBranchIds })
      const unclaimedScope = scopeWhere({ tableAlias: "ud", actor, selectedBranchIds })

      // 1. Daily finance day-end balance for yesterday (one row per branch per day).
      const dailyRes = await client.query(
        `SELECT
           COALESCE(SUM(df.total_amount), 0)::numeric AS daily_total,
           MAX(df.created_at::date) AS as_of
         FROM senteloans_daily_finances df
         WHERE ${dailyScope.where}
           AND df.total_amount > 0
           AND df.created_at::date = (CURRENT_DATE - INTERVAL '1 day')::date`,
        dailyScope.values,
      )

      // 2. Outstanding member loans.
      const loansRes = await client.query(
        `SELECT COALESCE(SUM(l.outstanding_balance), 0)::numeric AS loans_outstanding
         FROM senteloans_loans l
         WHERE ${loansScope.where}
           AND l.outstanding_balance > 0`,
        loansScope.values,
      )

      // 3a. Investment principal (initial_amount across all investments in scope).
      const invInitialRes = await client.query(
        `SELECT COALESCE(SUM(i.initial_amount), 0)::numeric AS initial_total
         FROM senteloans_investments i
         WHERE ${invScope.where}`,
        invScope.values,
      )

      // 3b. Cashflows recorded against those investments, capital category.
      const invCapitalRes = await client.query(
        `SELECT COALESCE(SUM(ic.amount), 0)::numeric AS capital_total
         FROM senteloans_investment_cashflows ic
         JOIN senteloans_investments i ON i.id = ic.investment_id
         WHERE ${invScope.where}
           AND lower(trim(ic.category)) = 'capital'`,
        invScope.values,
      )

      // 4. Capital expense cashflows that have been completed.
      const capexRes = await client.query(
        `SELECT COALESCE(SUM(ec.amount), 0)::numeric AS capex_total
         FROM senteloans_expense_cashflows ec
         JOIN senteloans_expenses e ON e.id = ec.expense_id
         WHERE ${expScope.where}
           AND lower(trim(e.type)) = 'capital-expenses'
           AND lower(trim(ec.status)) = 'completed'`,
        expScope.values,
      )

      // 5. Sacco loans the institution owes (outstanding only).
      const saccoLoansRes = await client.query(
        `SELECT COALESCE(SUM(sl.outstanding_balance), 0)::numeric AS sacco_outstanding
         FROM senteloans_institution_loans sl
         WHERE ${saccoLoansScope.where}
           AND sl.outstanding_balance > 0`,
        saccoLoansScope.values,
      )

      // 6. Unclaimed deposits we still owe back (anything that hasn't been claimed).
      const unclaimedRes = await client.query(
        `SELECT COALESCE(SUM(ud.amount), 0)::numeric AS unclaimed_total
         FROM senteloans_unclaimed_deposits ud
         WHERE ${unclaimedScope.where}
           AND lower(trim(coalesce(ud.status, 'unclaimed'))) <> 'claimed'`,
        unclaimedScope.values,
      )

      const dailyTotal = Number(dailyRes.rows[0]?.daily_total || 0)
      const loansOutstanding = Number(loansRes.rows[0]?.loans_outstanding || 0)
      const investmentsInitial = Number(invInitialRes.rows[0]?.initial_total || 0)
      const investmentsCapital = Number(invCapitalRes.rows[0]?.capital_total || 0)
      const investments = investmentsInitial + investmentsCapital
      const capitalExpenses = Number(capexRes.rows[0]?.capex_total || 0)

      const saccoLoansOutstanding = Number(
        saccoLoansRes.rows[0]?.sacco_outstanding || 0,
      )
      const unclaimedDeposits = Number(unclaimedRes.rows[0]?.unclaimed_total || 0)

      const totalAssets =
        dailyTotal + loansOutstanding + investments + capitalExpenses
      const totalLiabilities = saccoLoansOutstanding + unclaimedDeposits

      return {
        totalAssets,
        totalLiabilities,
        breakdown: {
          dailyTotal,
          loansOutstanding,
          investments,
          investmentsInitial,
          investmentsCapital,
          capitalExpenses,
          saccoLoansOutstanding,
          unclaimedDeposits,
        },
        asOf: {
          dailyFinanceDate: dailyRes.rows[0]?.as_of
            ? String(dailyRes.rows[0].as_of).slice(0, 10)
            : null,
        },
      }
    })

    if (payload && "error" in payload) {
      const statusCode =
        payload.error === "actor_branch_missing"
          ? 400
          : payload.error === "user_not_linked"
            ? 403
            : payload.error.startsWith("missing_permission:")
              ? 403
              : 500
      apiLog("warn", "reports.treasury.summary.denied", {
        method: "GET",
        apiPath,
        status: statusCode,
        error: payload.error,
      })
      return NextResponse.json({ error: payload.error }, { status: statusCode })
    }

    apiLog("info", "reports.treasury.summary.success", {
      method: "GET",
      apiPath,
      status: 200,
    })
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "reports.treasury.summary.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    )
  }
}
