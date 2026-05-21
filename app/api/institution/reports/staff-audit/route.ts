import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

type AuditRow = {
  id: string
  created_at: string
  branch_id: string
  branch_name: string | null
  user_id: string | null
  staff_name: string | null
  category: string
  operation: "INSERT" | "UPDATE" | "DELETE"
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  old_values_resolved?: Record<string, unknown> | null
  new_values_resolved?: Record<string, unknown> | null
}

type IdKeySpec = {
  key: string
  label: string
  source: "clients" | "members" | "users" | "branches" | "loans" | "sacco_loans" | "investments" | "roles" | "loan_products" | "savings_accounts" | "transactions"
}

const ID_KEY_SPECS: IdKeySpec[] = [
  { key: "provider_id", label: "provider", source: "clients" },
  { key: "client_id", label: "client", source: "clients" },
  { key: "member_id", label: "member", source: "members" },
  { key: "user_id", label: "user", source: "users" },
  { key: "branch_id", label: "branch", source: "branches" },
  { key: "loan_id", label: "loan", source: "loans" },
  { key: "sacco_loan_id", label: "sacco_loan", source: "sacco_loans" },
  { key: "investment_id", label: "investment", source: "investments" },
  { key: "role_id", label: "role", source: "roles" },
  { key: "loan_product_id", label: "loan_product", source: "loan_products" },
  { key: "account_id", label: "account", source: "savings_accounts" },
  { key: "transaction_id", label: "transaction", source: "transactions" },
  { key: "created_by", label: "created_by_name", source: "users" },
  { key: "modified_by", label: "modified_by_name", source: "users" },
  { key: "processed_by", label: "processed_by_name", source: "users" },
  { key: "reviewed_by", label: "reviewed_by_name", source: "users" },
  { key: "approved_by", label: "approved_by_name", source: "users" },
  { key: "disbursed_by", label: "disbursed_by_name", source: "users" },
]

function isUuidLike(value: unknown): value is string {
  const s = String(value || "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

async function resolveEntityMap(client: any, source: IdKeySpec["source"], ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map<string, string>()
  const uniq = Array.from(new Set(ids))
  let query = ""
  switch (source) {
    case "clients":
      query = `SELECT id::text AS id, name::text AS label FROM senteloans_clients WHERE id = ANY($1::uuid[])`
      break
    case "members":
      query = `SELECT id::text AS id, full_name::text AS label FROM senteloans_members WHERE id = ANY($1::uuid[])`
      break
    case "users":
      query = `SELECT id::text AS id, full_name::text AS label FROM senteloans_users WHERE id = ANY($1::uuid[])`
      break
    case "branches":
      query = `SELECT id::text AS id, name::text AS label FROM senteloans_branches WHERE id = ANY($1::uuid[])`
      break
    case "loans":
      query = `SELECT id::text AS id, application_id::text AS label FROM senteloans_loans WHERE id = ANY($1::uuid[])`
      break
    case "sacco_loans":
      query = `SELECT id::text AS id, COALESCE(NULLIF(loan_product, ''), id::text) AS label FROM senteloans_institution_loans WHERE id = ANY($1::uuid[])`
      break
    case "investments":
      query = `SELECT id::text AS id, COALESCE(NULLIF(investment_number, ''), id::text) AS label FROM senteloans_investments WHERE id = ANY($1::uuid[])`
      break
    case "roles":
      query = `SELECT id::text AS id, name::text AS label FROM senteloans_roles WHERE id = ANY($1::uuid[])`
      break
    case "loan_products":
      query = `SELECT id::text AS id, product_name::text AS label FROM senteloans_loan_products WHERE id = ANY($1::uuid[])`
      break
    case "savings_accounts":
      query = `SELECT id::text AS id, account_number::text AS label FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`
      break
    case "transactions":
      query = `SELECT id::text AS id, transaction_number::text AS label FROM senteloans_transactions WHERE id = ANY($1::uuid[])`
      break
  }
  const res = await client.query(query, [uniq])
  const out = new Map<string, string>()
  for (const row of res.rows) out.set(String(row.id), String(row.label || row.id))
  return out
}

async function withResolvedValues(client: any, rows: AuditRow[]): Promise<AuditRow[]> {
  const sourceToIds = new Map<IdKeySpec["source"], Set<string>>()
  ID_KEY_SPECS.forEach((s) => sourceToIds.set(s.source, new Set<string>()))

  for (const row of rows) {
    for (const payload of [row.old_values, row.new_values]) {
      if (!payload) continue
      for (const spec of ID_KEY_SPECS) {
        const value = payload[spec.key]
        if (isUuidLike(value)) sourceToIds.get(spec.source)?.add(value)
      }
    }
  }

  const sourceMaps = new Map<IdKeySpec["source"], Map<string, string>>()
  for (const spec of ID_KEY_SPECS) {
    if (sourceMaps.has(spec.source)) continue
    const ids = Array.from(sourceToIds.get(spec.source) || [])
    sourceMaps.set(spec.source, await resolveEntityMap(client, spec.source, ids))
  }

  const resolvePayload = (payload: Record<string, unknown> | null): Record<string, unknown> | null => {
    if (!payload) return null
    const resolved: Record<string, unknown> = { ...payload }
    for (const spec of ID_KEY_SPECS) {
      const value = payload[spec.key]
      if (!isUuidLike(value)) continue
      const label = sourceMaps.get(spec.source)?.get(value)
      if (label) {
        resolved[spec.label] = label
        delete resolved[spec.key]
      }
    }
    return resolved
  }

  return rows.map((row) => ({
    ...row,
    old_values_resolved: resolvePayload(row.old_values),
    new_values_resolved: resolvePayload(row.new_values),
  }))
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "staff_audit_reports.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "staff_audit_reports.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const staffIdsRaw = (url.searchParams.get("staff_ids") || "").trim()
    const selectedStaffIds = staffIdsRaw ? staffIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const operation = (url.searchParams.get("operation") || "").trim().toUpperCase()
    const category = (url.searchParams.get("category") || "").trim().toLowerCase()
    const dateStart = (url.searchParams.get("dateStart") || "").trim()
    const dateEnd = (url.searchParams.get("dateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "500", 10) || 500, 1), 5000)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_users")
      if (!allowed) return { error: "missing_permission:view_users" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "a.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (!isSuperAdmin) {
        where += ` AND a.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND a.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }

      if (selectedStaffIds.length > 0) {
        where += ` AND a.user_id = ANY($${idx++}::uuid[])`
        params.push(selectedStaffIds)
      }
      if (operation && ["INSERT", "UPDATE", "DELETE"].includes(operation)) {
        where += ` AND a.operation = $${idx++}`
        params.push(operation)
      }
      if (category) {
        const normalizedCategory = category.replace(/[^a-z0-9]+/g, " ").trim()
        if (normalizedCategory === "sacco loans") {
          where += ` AND regexp_replace(lower(trim(a.category)), '[^a-z0-9]+', ' ', 'g') = ANY($${idx++}::text[])`
          params.push(["sacco loans", "sacco laons"])
        } else if (normalizedCategory === "investment" || normalizedCategory === "investments") {
          where += ` AND regexp_replace(lower(trim(a.category)), '[^a-z0-9]+', ' ', 'g') = ANY($${idx++}::text[])`
          params.push(["investment", "investments"])
        } else {
          where += ` AND regexp_replace(lower(trim(a.category)), '[^a-z0-9]+', ' ', 'g') = $${idx++}`
          params.push(normalizedCategory)
        }
      }
      if (dateStart) {
        where += ` AND a.created_at >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::timestamptz)`
        params.push(`${dateStart} 00:00:00`)
        idx++
      }
      if (dateEnd) {
        where += ` AND a.created_at <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::timestamptz)`
        params.push(`${dateEnd} 23:59:59`)
        idx++
      }

      const rowsRes = await client.query<AuditRow>(
        `SELECT
           a.id,
           a.created_at,
           a.branch_id,
           b.name AS branch_name,
           a.user_id,
           u.full_name AS staff_name,
           a.category,
           a.operation,
           a.old_values,
           a.new_values
         FROM senteloans_audit_logs a
         LEFT JOIN senteloans_branches b ON b.id = a.branch_id
         LEFT JOIN senteloans_users u ON u.id = a.user_id
         WHERE ${where}
         ORDER BY a.created_at DESC
         LIMIT $${idx}`,
        [...params, pageSize]
      )

      const summaryRes = await client.query(
        `SELECT
           COUNT(*)::int AS total_logs,
           COUNT(*) FILTER (WHERE operation = 'INSERT')::int AS inserts,
           COUNT(*) FILTER (WHERE operation = 'UPDATE')::int AS updates,
           COUNT(*) FILTER (WHERE operation = 'DELETE')::int AS deletes
         FROM senteloans_audit_logs a
         WHERE ${where}`,
        params
      )

      const resolvedRows = await withResolvedValues(client, rowsRes.rows)

      return {
        items: resolvedRows,
        summary: summaryRes.rows[0] || { total_logs: 0, inserts: 0, updates: 0, deletes: 0 },
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "user_not_linked" || result.error === "actor_branch_missing" ? 403 :
        String(result.error).startsWith("missing_permission:") ? 403 :
        400
      apiLog("warn", "staff_audit_reports.denied", { method: "GET", apiPath, status, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "staff_audit_reports.success", {
      method: "GET",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
      count: result.items.length,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff_audit_reports.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
