import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { canViewAnyFinanceModule } from "@/lib/finances/permissions"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const payload = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await canViewAnyFinanceModule(client, actor)
      if (!allowed) return { error: "missing_permission:view_finances" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const bankScope = scopeWhere({ tableAlias: "ba", actor, selectedBranchIds })
      const unclaimedScope = scopeWhere({ tableAlias: "ud", actor, selectedBranchIds })
      const grantsScope = scopeWhere({ tableAlias: "g", actor, selectedBranchIds })
      const floatScope = scopeWhere({ tableAlias: "f", actor, selectedBranchIds })

      const bankRes = await client.query(
        `SELECT
           COALESCE(SUM(ba.total_amount), 0)::numeric AS bank_total,
           COUNT(*)::int AS bank_count
         FROM senteloans_bank_accounts ba
         WHERE ${bankScope.where}`,
        bankScope.values,
      )

      const unclaimedRes = await client.query(
        `SELECT
           COALESCE(SUM(ud.amount) FILTER (WHERE lower(trim(ud.status)) = 'unclaimed'), 0)::numeric AS open_amount,
           COUNT(*) FILTER (WHERE lower(trim(ud.status)) = 'unclaimed')::int AS open_count,
           COUNT(*)::int AS total_count
         FROM senteloans_unclaimed_deposits ud
         WHERE ${unclaimedScope.where}`,
        unclaimedScope.values,
      )

      const grantsRes = await client.query(
        `SELECT
           COALESCE(SUM(g.available_balance), 0)::numeric AS grants_available,
           COALESCE(SUM(g.total_amount), 0)::numeric AS grants_total,
           COUNT(*)::int AS grant_count
         FROM senteloans_grants g
         WHERE ${grantsScope.where}`,
        grantsScope.values,
      )

      const floatRes = await client.query(
        `SELECT
           COALESCE(SUM(f.cash_amount), 0)::numeric AS cash,
           COALESCE(SUM(f.mobile_money_amount), 0)::numeric AS mobile_money,
           COALESCE(SUM(f.bank_total_amount), 0)::numeric AS bank,
           COALESCE(SUM(f.available_balance), 0)::numeric AS available
         FROM senteloans_finances f
         WHERE ${floatScope.where}`,
        floatScope.values,
      )

      const bankTotal = Number(bankRes.rows[0]?.bank_total || 0)
      const bankCount = Number(bankRes.rows[0]?.bank_count || 0)
      const unclaimedOpenAmount = Number(unclaimedRes.rows[0]?.open_amount || 0)
      const unclaimedOpenCount = Number(unclaimedRes.rows[0]?.open_count || 0)
      const unclaimedTotalCount = Number(unclaimedRes.rows[0]?.total_count || 0)
      const grantsAvailable = Number(grantsRes.rows[0]?.grants_available || 0)
      const grantsTotalAllocated = Number(grantsRes.rows[0]?.grants_total || 0)
      const grantCount = Number(grantsRes.rows[0]?.grant_count || 0)
      const grantsUnclaimed = Math.max(0, grantsTotalAllocated - grantsAvailable)

      return {
        summary: {
          bankTotal,
          bankAccountCount: bankCount,
          unclaimedOpenAmount,
          unclaimedOpenCount,
          unclaimedTotalCount,
          grantsAvailable,
          grantsTotalAllocated,
          grantsUnclaimed,
          grantCount,
          float: {
            cash: Number(floatRes.rows[0]?.cash || 0),
            mobileMoney: Number(floatRes.rows[0]?.mobile_money || 0),
            bank: Number(floatRes.rows[0]?.bank || 0),
            available: Number(floatRes.rows[0]?.available || 0),
          },
        },
        tabCounts: {
          bank: bankCount,
          unclaimed: unclaimedTotalCount,
          unclaimedOpen: unclaimedOpenCount,
          grants: grantCount,
        },
      }
    })

    if (payload && "error" in payload) {
      const statusCode = payload.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: payload.error }, { status: statusCode })
    }

    apiLog("info", "finances.summary.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.summary.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
