import { NextResponse } from "next/server"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import {
  assertExpenseReadAccess,
  assertExpenseWriteAccess,
  mapExpenseMutationErrorResponse,
  mapExpenseReadErrorResponse,
} from "@/lib/api/expense-access"
import { createExpense } from "@/lib/expenses/create-expense"
import { isValidExpenseType } from "@/lib/expenses/expense-types"
import { notifyExpenseCreated } from "@/lib/notifications/expense-events"

function buildExpenseWhere(params: {
  actor: Awaited<ReturnType<typeof resolveActorContext>>
  selectedBranchIds: string[]
  q: string
  status: string
  type: string
}): { where: string; values: unknown[] } {
  const actor = params.actor!
  const scoped = scopeWhere({ tableAlias: "e", actor, selectedBranchIds: params.selectedBranchIds, startIndex: 1 })
  let where = scoped.where
  const values: unknown[] = [...scoped.values]
  let idx = scoped.nextIndex

  if (params.q) {
    where += ` AND (
      e.expense_number ILIKE $${idx}
      OR e.name ILIKE $${idx}
      OR COALESCE(e.description, '') ILIKE $${idx}
    )`
    values.push(`%${params.q}%`)
    idx++
  }
  if (params.status) {
    where += ` AND lower(trim(e.status)) = lower(trim($${idx}::text))`
    values.push(params.status)
    idx++
  }
  if (params.type) {
    where += ` AND lower(trim(e.type)) = lower(trim($${idx}::text))`
    values.push(params.type)
    idx++
  }

  return { where, values }
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.list.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const offset = (page - 1) * pageSize
    const q = (url.searchParams.get("q") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const type = (url.searchParams.get("type") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseReadAccess(client, sess.authUserId, "view_expenses")
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
        }
      }
      const { actor } = access
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = buildExpenseWhere({ actor, selectedBranchIds, q, status, type })

      const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM expenses e WHERE ${where}`, values)
      const total = Number(countRes.rows[0]?.n || 0)

      const summaryRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE lower(trim(e.status)) = 'pending')::int AS pending_count,
           COALESCE(SUM((
             SELECT COALESCE(SUM(s.amount), 0)
             FROM expense_funding_sources s
             WHERE s.expense_id = e.id
           )), 0)::numeric AS funding_total,
           COALESCE(SUM((
             SELECT COALESCE(SUM(cf.amount), 0)
             FROM expense_cashflows cf
             WHERE cf.expense_id = e.id
           )), 0)::numeric AS cashflows_total
         FROM expenses e
         WHERE ${where}`,
        values,
      )
      const pendingCount = Number(summaryRes.rows[0]?.pending_count || 0)
      const fundingTotal = Number(summaryRes.rows[0]?.funding_total || 0)
      const cashflowsTotal = Number(summaryRes.rows[0]?.cashflows_total || 0)

      const listRes = await client.query(
        `SELECT
           e.id,
           e.expense_number,
           e.name,
           e.description,
           e.status,
           e.type,
           e.created_at,
           e.approved_at,
           e.branch_id,
           b.name AS branch_name,
           u.full_name AS created_by_name,
           ua.full_name AS approved_by_name,
           (SELECT COALESCE(SUM(amount), 0) FROM expense_funding_sources WHERE expense_id = e.id) AS funding_total,
           (SELECT COALESCE(SUM(amount), 0) FROM expense_cashflows WHERE expense_id = e.id) AS cashflows_total
         FROM expenses e
         JOIN users u ON u.id = e.created_by
         LEFT JOIN users ua ON ua.id = e.approved_by
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      )

      const items = listRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        expense_number: String(row.expense_number || ""),
        name: String(row.name || ""),
        description: row.description != null ? String(row.description) : null,
        status: String(row.status || "Pending"),
        type: String(row.type || ""),
        created_at: row.created_at != null ? String(row.created_at) : "",
        approved_at: row.approved_at != null ? String(row.approved_at) : null,
        branch_id: row.branch_id != null ? String(row.branch_id) : "",
        branch_name: String(row.branch_name || ""),
        created_by_name: String(row.created_by_name || ""),
        approved_by_name: row.approved_by_name != null ? String(row.approved_by_name) : null,
        funding_total: Number(row.funding_total || 0),
        cashflows_total: Number(row.cashflows_total || 0),
      }))
      return {
        items,
        total,
        page,
        pageSize,
        summary: { pendingCount, fundingTotal, cashflowsTotal },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      if (code === "staff_inactive" || code.startsWith("missing_permission:") || code === "user_not_linked") {
        const { status, body } = mapExpenseReadErrorResponse({
          error: code,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
        })
        apiLog("warn", "expenses.list.denied", { method: "GET", apiPath, status, error: code })
        return NextResponse.json(body, { status })
      }
      const statusCode =
        code === "actor_branch_missing" ? 400
        : 400
      apiLog("warn", "expenses.list.denied", { method: "GET", apiPath, status: statusCode, error: code })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "expenses.list.success", { method: "GET", apiPath, status: 200, total: result?.total })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.create.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }

    const name = String(body.name ?? "").trim()
    const descriptionRaw = body.description
    const description =
      descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
        ? null
        : String(descriptionRaw).trim()
    const expense_type = String(body.type ?? "").trim()

    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 })
    }
    if (!expense_type) {
      return NextResponse.json({ error: "type_required" }, { status: 400 })
    }
    if (!isValidExpenseType(expense_type)) {
      return NextResponse.json({ error: "invalid_type" }, { status: 400 })
    }
    if (expense_type.length > 30) {
      return NextResponse.json({ error: "type_too_long" }, { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "create_expense")
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access
      const branch_id = actor.branch_id

      await client.query("BEGIN")
      let committed = false
      try {
        const created = await createExpense(
          client,
          {
            institutionId: actor.institution_id,
            branchId: branch_id,
            createdBy: actor.id,
            name,
            type: expense_type,
            description,
          },
          { actor, branchId: branch_id },
        )
        await client.query("COMMIT")
        committed = true
        return {
          id: created.id,
          expense_number: created.expenseNumber,
          name: created.name,
          status: created.status,
          type: created.type,
          created_at: created.createdAt ?? "",
          postCommit: {
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: actor.branch_id,
            expense: {
              id: created.id,
              name: created.name,
              expense_number: created.expenseNumber,
              type: created.type,
              status: created.status,
            },
          },
        }
      } catch (e: unknown) {
        const msg = (e as Error)?.message || ""
        if (msg === "expense_number_generation_failed") {
          return { error: "expense_number_generation_failed" as const }
        }
        throw e
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const { status, body } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        { expense_number_generation_failed: 500 },
      )
      apiLog("warn", "expenses.create.denied", { method: "POST", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.create.success", { method: "POST", apiPath, status: 200 })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyExpenseCreated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            expense: ctx.expense,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "expenses.create.notifications_dispatched"
            : "expenses.create.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 200,
            expenseId: result.id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "expenses.create.notifications_failed", {
          method: "POST",
          apiPath,
          status: 200,
          expenseId: result.id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    const { postCommit: _postCommit, ...payload } = result
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
