import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { insertTransactionInsertAuditLog } from "@/lib/audit/transaction-insert-audit"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"
import {
  hasInvestmentPermission,
  resolveInvestmentActor,
} from "@/lib/api/investment-rbac"

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

function amountsMatchDb(a: number, b: number): boolean {
  const x = Math.round(Number(a) * 100)
  const y = Math.round(Number(b) * 100)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const startDate = String(body.start_date || "").trim()
  const maturityDate = String(body.maturity_date || "").trim()
  const mode = String(body.mode || "").trim()
  const description = String(body.description || "").trim() || null
  const principalAmount = Number(body.principal_amount ?? 0)

  if (!isDateOnly(startDate)) return NextResponse.json({ error: "invalid_start_date" }, { status: 400 })
  if (!isDateOnly(maturityDate)) return NextResponse.json({ error: "invalid_maturity_date" }, { status: 400 })
  if (!["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].includes(mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
  }
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
  }

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment_status")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment_status" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, institution_id, branch_id, provider_id, investment_number, initial_amount, status, start_date, maturity_date
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
        initial_amount: string | number
        status: string
        start_date: string | null
        maturity_date: string | null
      }
      const currentStatus = String(inv.status || "").toLowerCase()
      if (currentStatus !== "approved") {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "investment_must_be_approved_first" }, { status: 409 })
      }

      const initialNum = Number(inv.initial_amount)
      if (!amountsMatchDb(principalAmount, initialNum)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "principal_must_match_initial_amount" }, { status: 400 })
      }

      const amount = principalAmount
      const txDate = `${startDate}T00:00:00.000Z`
      const txDesc =
        description || `Investment development start deposit (${inv.investment_number || inv.id})`
      const inserted = await insertWithTransactionNumberRetry(
        (transactionNumber) =>
          client.query(
            `INSERT INTO senteloans_transactions (
               institution_id, branch_id, client_id, transaction_number, type, amount, mode, description,
               reference_number, processed_by, transaction_date, status
             )
             VALUES ($1,$2,$3,$4,'Investment Deposit',$5,$6,$7,$8,$9,$10,'Completed')
             RETURNING id`,
            [
              inv.institution_id,
              inv.branch_id,
              inv.provider_id,
              transactionNumber,
              amount,
              mode,
              txDesc,
              transactionNumber,
              actor.id,
              txDate,
            ],
          ),
        { prefix: "TXN", client },
      )
      if (!inserted) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "transaction_number_generation_failed" }, { status: 500 })
      }
      const transactionNumber = inserted.transactionNumber
      await insertTransactionInsertAuditLog(client, {
        institutionId: inv.institution_id,
        branchId: inv.branch_id,
        userId: actor.id,
        transactionId: inserted.row.id,
        newValues: {
          transaction_number: transactionNumber,
          type: "Investment Deposit",
          amount,
          mode,
          client_id: inv.provider_id,
          investment_id: id,
          source: "investment_start_development",
        },
      })

      await client.query(
        `UPDATE senteloans_investments
         SET status = 'under_development',
             start_date = $1::date,
             maturity_date = $2::date,
             modified_by = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [startDate, maturityDate, actor.id, id],
      )

      await auditLogger.logUpdate(
        "senteloans_investments",
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
      return NextResponse.json({
        ok: true,
        transaction_id: inserted.row.id,
        transaction_number: transactionNumber,
      })
    } catch (e: any) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: e?.message || "activation_failed" }, { status: 500 })
    }
  })
}
