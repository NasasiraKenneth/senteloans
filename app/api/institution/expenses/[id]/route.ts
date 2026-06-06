import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditExpenseUpdate, expenseSnapshot } from "@/lib/audit/expense-audit"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

function singleExpenseWhere(actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>, expenseId: string): { where: string; values: unknown[] } {
  let where = `e.id = $1::uuid AND e.institution_id = $2::uuid`
  const values: unknown[] = [expenseId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND e.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.detail.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const canView = await hasPermission(client, actor, "view_expenses")
      const canEditExpense = await hasPermission(client, actor, "edit_expense")
      if (!canView && !canEditExpense) return { error: "missing_permission:view_expenses" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const res = await client.query(
        `SELECT
           e.id,
           e.expense_number,
           e.name,
           e.description,
           e.type,
           e.status,
           e.category_id,
           c.category AS category_name,
           e.branch_id,
           b.name AS branch_name,
           e.created_at,
           e.updated_at,
           e.approved_at,
           u.full_name AS created_by_name
         FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         LEFT JOIN branches b ON b.id = e.branch_id
         JOIN users u ON u.id = e.created_by
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      const row = res.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "not_found" as const }

      const statusRaw = String(row.status || "")
      const pending = String(statusRaw).trim().toLowerCase() === "pending"
      const canEditRecord = canEditExpense && pending

      const fundingRes = await client.query(
        `SELECT id, source_type, loan_id, amount::float, created_at
         FROM expense_funding_sources
         WHERE expense_id = $1::uuid
         ORDER BY created_at DESC`,
        [expenseId],
      )
      const funding = fundingRes.rows.map((f: Record<string, unknown>) => ({
        id: String(f.id),
        source_type: String(f.source_type || ""),
        loan_id: f.loan_id != null ? String(f.loan_id) : null,
        amount: Number(f.amount || 0),
        created_at: f.created_at != null ? String(f.created_at) : "",
      }))

      const cashRes = await client.query(
        `SELECT
           cf.id,
           cf.amount::float,
           cf.description,
           cf.status,
           cf.date::text AS date,
           cf.payment_method::text AS payment_method,
           cf.created_at,
           cf.staff_id,
           cf.client_id,
           cf.completed_by,
           cf.completed_at,
           su.full_name AS staff_name,
           c.name AS client_name,
           u.full_name AS completed_by_name
         FROM expense_cashflows cf
         LEFT JOIN users su ON su.id = cf.staff_id
         LEFT JOIN clients c ON c.id = cf.client_id
         LEFT JOIN users u ON u.id = cf.completed_by
         WHERE cf.expense_id = $1::uuid
         ORDER BY cf.created_at DESC`,
        [expenseId],
      )
      const cashflows = cashRes.rows.map((cf: Record<string, unknown>) => {
        const staffId = cf.staff_id != null ? String(cf.staff_id) : null
        const clientId = cf.client_id != null ? String(cf.client_id) : null
        const staffName = cf.staff_name != null ? String(cf.staff_name).trim() : ""
        const clientName = cf.client_name != null ? String(cf.client_name).trim() : ""
        let assigned_type: "staff" | "client" | null = null
        let assigned_name: string | null = null
        if (staffId) {
          assigned_type = "staff"
          assigned_name = staffName || "Staff"
        } else if (clientId) {
          assigned_type = "client"
          assigned_name = clientName || "Client"
        }
        return {
          id: String(cf.id),
          amount: Number(cf.amount || 0),
          description: cf.description != null ? String(cf.description) : null,
          status: String(cf.status || "Pending"),
          date: cf.date != null ? String(cf.date) : null,
          payment_method: cf.payment_method != null ? String(cf.payment_method) : null,
          created_at: cf.created_at != null ? String(cf.created_at) : "",
          staff_id: staffId,
          client_id: clientId,
          assigned_type,
          assigned_name,
          completed_by: cf.completed_by != null ? String(cf.completed_by) : null,
          completed_at: cf.completed_at != null ? String(cf.completed_at) : null,
          completed_by_name: cf.completed_by_name != null ? String(cf.completed_by_name).trim() : null,
        }
      })

      const fundingTotal = funding.reduce((s, r) => s + r.amount, 0)
      const cashflowsTotal = cashflows.reduce((s, r) => s + r.amount, 0)

      return {
        expense: {
          id: String(row.id),
          expense_number: String(row.expense_number || ""),
          name: String(row.name || ""),
          description: row.description != null ? String(row.description) : null,
          type: String(row.type || "Short-term"),
          status: statusRaw,
          category_id: String(row.category_id || ""),
          category_name: String(row.category_name || ""),
          branch_id: row.branch_id != null ? String(row.branch_id) : "",
          branch_name: String(row.branch_name || ""),
          created_at: row.created_at != null ? String(row.created_at) : "",
          updated_at: row.updated_at != null ? String(row.updated_at) : null,
          approved_at: row.approved_at != null ? String(row.approved_at) : null,
          created_by_name: String(row.created_by_name || ""),
          can_edit: canEditRecord,
          funding_total: fundingTotal,
          cashflows_total: cashflowsTotal,
        },
        funding,
        cashflows,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:view_expenses" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : 400
      apiLog("warn", "expenses.detail.denied", { method: "GET", apiPath, status: statusCode, error: code })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "expenses.detail.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
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
  const typeRaw = body.type != null ? String(body.type).trim() : ""
  const expense_type = typeRaw || "Short-term"
  const branch_id_input = body.branch_id != null && String(body.branch_id).trim() !== "" ? String(body.branch_id).trim() : null

  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 })
  }
  if (!category_id) {
    return NextResponse.json({ error: "category_id_required" }, { status: 400 })
  }
  if (expense_type.length > 30) {
    return NextResponse.json({ error: "type_too_long" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.update.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_expense")
      if (!allowed) return { error: "missing_permission:edit_expense" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const existing = await client.query(
        `SELECT e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const ex = existing.rows[0] as Record<string, unknown> | undefined
      if (!ex) return { error: "not_found" as const }
      if (String(ex.status || "").trim().toLowerCase() !== "pending") {
        return {
          error: "expense_not_editable" as const,
          message: "Only expenses in Pending status can be edited." as const,
        }
      }

      const cat = await client.query(`SELECT id FROM expense_categories WHERE id = $1::uuid LIMIT 1`, [category_id])
      if ((cat.rowCount ?? 0) === 0) return { error: "invalid_category" as const }

      let nextBranchId: string = String(ex.branch_id || "")
      if (isSuperAdmin(actor) && branch_id_input) {
        const br = await client.query(
          `SELECT id FROM branches WHERE id = $1::uuid AND institution_id = $2::uuid LIMIT 1`,
          [branch_id_input, actor.institution_id],
        )
        if ((br.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }
        nextBranchId = branch_id_input
      }

      const setParams: unknown[] = [name, description, category_id, expense_type, nextBranchId]
      let w = `e.id = $6::uuid AND e.institution_id = $7::uuid`
      setParams.push(expenseId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        w += ` AND e.branch_id = $8::uuid`
        setParams.push(actor.branch_id)
      }

      const upd = await client.query(
        `UPDATE expenses e
         SET name = $1,
             description = $2,
             category_id = $3::uuid,
             type = $4,
             branch_id = $5::uuid,
             updated_at = NOW()
         WHERE ${w}
         RETURNING e.id, e.expense_number, e.name, e.description, e.type, e.status, e.category_id, e.branch_id,
                   e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at, e.updated_at`,
        setParams,
      )

      const row = upd.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "update_failed" as const }

      await auditExpenseUpdate(
        client,
        actor,
        expenseId,
        expenseSnapshot(ex),
        expenseSnapshot(row),
        nextBranchId,
      )

      return {
        id: String(row.id),
        expense_number: String(row.expense_number || ""),
        name: String(row.name || ""),
        type: String(row.type || ""),
        status: String(row.status || ""),
        updated_at: row.updated_at != null ? String(row.updated_at) : "",
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:edit_expense" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "expense_not_editable" ? 409
        : code === "invalid_category" || code === "invalid_branch" ? 400
        : 400
      apiLog("warn", "expenses.update.denied", { method: "PATCH", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.update.success", { method: "PATCH", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
