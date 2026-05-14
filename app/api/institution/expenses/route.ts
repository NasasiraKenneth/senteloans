import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"

function buildExpenseWhere(params: {
  actor: Awaited<ReturnType<typeof resolveActorContext>>
  selectedBranchIds: string[]
  q: string
  status: string
  categoryId: string
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
  if (params.categoryId) {
    where += ` AND e.category_id = $${idx}::uuid`
    values.push(params.categoryId)
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
    const categoryId = (url.searchParams.get("category_id") || "").trim()
    const type = (url.searchParams.get("type") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_expenses")
      if (!allowed) return { error: "missing_permission:view_expenses" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = buildExpenseWhere({ actor, selectedBranchIds, q, status, categoryId, type })

      const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM senteloans_expenses e WHERE ${where}`, values)
      const total = Number(countRes.rows[0]?.n || 0)

      const summaryRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE lower(trim(e.status)) = 'pending')::int AS pending_count,
           COALESCE(SUM((
             SELECT COALESCE(SUM(s.amount), 0)
             FROM senteloans_expense_funding_sources s
             WHERE s.expense_id = e.id
           )), 0)::numeric AS funding_total,
           COALESCE(SUM((
             SELECT COALESCE(SUM(cf.amount), 0)
             FROM senteloans_expense_cashflows cf
             WHERE cf.expense_id = e.id
           )), 0)::numeric AS cashflows_total
         FROM senteloans_expenses e
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
           c.id AS category_id,
           c.category AS category_name,
           u.full_name AS created_by_name,
           ua.full_name AS approved_by_name,
           (SELECT COALESCE(SUM(amount), 0) FROM senteloans_expense_funding_sources WHERE expense_id = e.id) AS funding_total,
           (SELECT COALESCE(SUM(amount), 0) FROM senteloans_expense_cashflows WHERE expense_id = e.id) AS cashflows_total
         FROM senteloans_expenses e
         JOIN senteloans_expense_categories c ON c.id = e.category_id
         JOIN senteloans_users u ON u.id = e.created_by
         LEFT JOIN senteloans_users ua ON ua.id = e.approved_by
         LEFT JOIN senteloans_branches b ON b.id = e.branch_id
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      )

      const catRes = await client.query(
        `SELECT id, category FROM senteloans_expense_categories ORDER BY category ASC`,
      )

      const items = listRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        expense_number: String(row.expense_number || ""),
        name: String(row.name || ""),
        description: row.description != null ? String(row.description) : null,
        status: String(row.status || "Pending"),
        type: String(row.type || "Short-term"),
        created_at: row.created_at != null ? String(row.created_at) : "",
        approved_at: row.approved_at != null ? String(row.approved_at) : null,
        branch_id: row.branch_id != null ? String(row.branch_id) : "",
        branch_name: String(row.branch_name || ""),
        category_id: String(row.category_id || ""),
        category_name: String(row.category_name || ""),
        created_by_name: String(row.created_by_name || ""),
        approved_by_name: row.approved_by_name != null ? String(row.approved_by_name) : null,
        funding_total: Number(row.funding_total || 0),
        cashflows_total: Number(row.cashflows_total || 0),
      }))

      const categories = catRes.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        category: String(r.category || ""),
      }))

      return {
        items,
        total,
        page,
        pageSize,
        summary: { pendingCount, fundingTotal, cashflowsTotal },
        categories,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:view_expenses" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
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
    const category_id = String(body.category_id ?? "").trim()
    const branch_id_input = body.branch_id != null && String(body.branch_id).trim() !== "" ? String(body.branch_id).trim() : null
    const typeRaw = body.type != null ? String(body.type).trim() : ""
    const expense_type = typeRaw || "Short-term"

    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 })
    }
    if (!category_id) {
      return NextResponse.json({ error: "category_id_required" }, { status: 400 })
    }
    if (expense_type.length > 30) {
      return NextResponse.json({ error: "type_too_long" }, { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "create_expense")
      if (!allowed) return { error: "missing_permission:create_expense" as const }

      let branch_id: string | null = null
      if (isSuperAdmin(actor)) {
        if (!branch_id_input) return { error: "branch_id_required" as const }
        const br = await client.query(
          `SELECT id FROM senteloans_branches
           WHERE id = $1::uuid AND institution_id = $2::uuid
           LIMIT 1`,
          [branch_id_input, actor.institution_id],
        )
        if ((br.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }
        branch_id = branch_id_input
      } else {
        if (!actor.branch_id) return { error: "actor_branch_missing" as const }
        branch_id = actor.branch_id
      }

      const cat = await client.query(`SELECT id FROM senteloans_expense_categories WHERE id = $1::uuid LIMIT 1`, [category_id])
      if ((cat.rowCount ?? 0) === 0) return { error: "invalid_category" as const }

      type ExpenseInsertRow = {
        id: string
        expense_number: string
        name: string
        status: string
        type: string
        created_at: string
      }

      const inserted = await insertWithTransactionNumberRetry<ExpenseInsertRow>(
        (expenseNumber) =>
          client.query<ExpenseInsertRow>(
            `INSERT INTO senteloans_expenses (
               institution_id, branch_id, category_id, expense_number, name, status, type, description, created_by
             )
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'Pending', $6, $7, $8::uuid)
             RETURNING id, expense_number, name, status, type, created_at`,
            [actor.institution_id, branch_id, category_id, expenseNumber, name, expense_type, description, actor.id],
          ),
        { prefix: "EXP" },
      )
      if (!inserted) return { error: "expense_number_generation_failed" as const }

      const row = inserted.row
      return {
        id: String(row.id),
        expense_number: String(row.expense_number || inserted.transactionNumber),
        name: String(row.name || ""),
        status: String(row.status || "Pending"),
        type: String(row.type || expense_type),
        created_at: row.created_at != null ? String(row.created_at) : "",
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:create_expense" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "branch_id_required" || code === "invalid_branch" || code === "invalid_category" ? 400
        : code === "expense_number_generation_failed" ? 500
        : 400
      apiLog("warn", "expenses.create.denied", { method: "POST", apiPath, status: statusCode, error: code })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "expenses.create.success", { method: "POST", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
