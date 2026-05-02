import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
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
    [authUserId],
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
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
}

function formatDateOnly(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  if (!s) return null
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10)
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.branch.denied", { method: "GET", apiPath, status: 401 })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const row = await runWithAuth(session.user.authUserId, async (client) => {
      const res = await client.query(
        `SELECT b.id, b.name, b.address, b.phone_number, b.email, b.established_date, b.branch_code, b.status::text AS status
         FROM senteloans_users u
         JOIN senteloans_branches b ON b.id = u.branch_id
         WHERE u.supabase_user_id = $1
         LIMIT 1`,
        [session.user.authUserId],
      )
      return res.rows[0] || null
    })

    if (!row) {
      apiLog("warn", "institution.branch.not_found", { method: "GET", apiPath, status: 404 })
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const payload = {
      id: row.id,
      name: row.name || "",
      address: row.address || "",
      phone_number: row.phone_number || "",
      email: row.email || "",
      established_date: formatDateOnly(row.established_date),
      branch_code: row.branch_code || "",
      status: row.status || "",
    }
    apiLog("info", "institution.branch.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.branch.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json()) as Record<string, unknown>
    const name = typeof body.name === "string" ? body.name.trim() : undefined
    const address = typeof body.address === "string" ? body.address.trim() : undefined
    const phone_number = typeof body.phone_number === "string" ? body.phone_number.trim() : undefined
    const email = typeof body.email === "string" ? body.email.trim() : undefined
    let established_date: string | null | undefined = undefined
    if ("established_date" in body) {
      const raw = body.established_date
      if (raw === null || raw === "") established_date = null
      else if (typeof raw === "string") {
        const t = raw.trim()
        established_date = t === "" ? null : t
      } else {
        return NextResponse.json({ error: "invalid_established_date" }, { status: 400 })
      }
    }

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "branch_name_required" }, { status: 400 })
    }

    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_branch_email" }, { status: 400 })
    }

    if (established_date !== undefined && established_date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(established_date)) {
        return NextResponse.json({ error: "invalid_established_date" }, { status: 400 })
      }
    }

    const updated = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_profile" as const }
      const canEdit = await hasPermission(client, actor, "edit_branch_info")
      if (!canEdit) return { error: "missing_permission:edit_branch_info" as const }

      const meRes = await client.query(
        `SELECT u.branch_id, u.institution_id FROM senteloans_users u WHERE u.supabase_user_id = $1 LIMIT 1`,
        [session.user.authUserId],
      )
      const me = meRes.rows[0]
      if (!me?.branch_id) return { error: "no_branch" as const }

      const updates: string[] = []
      const values: unknown[] = []
      let i = 1
      if (name !== undefined) {
        updates.push(`name = $${i++}`)
        values.push(name)
      }
      if (address !== undefined) {
        updates.push(`address = $${i++}`)
        values.push(address || null)
      }
      if (phone_number !== undefined) {
        updates.push(`phone_number = $${i++}`)
        values.push(phone_number || null)
      }
      if (email !== undefined) {
        updates.push(`email = $${i++}`)
        values.push(email || null)
      }
      if (established_date !== undefined) {
        updates.push(`established_date = $${i++}::date`)
        values.push(established_date)
      }

      if (updates.length === 0) return { error: "no_changes" as const }

      updates.push(`updated_at = NOW()`)
      const idPlaceholder = i
      const instPlaceholder = i + 1
      values.push(me.branch_id, me.institution_id)

      await client.query(
        `UPDATE senteloans_branches SET ${updates.join(", ")}
         WHERE id = $${idPlaceholder} AND institution_id = $${instPlaceholder}`,
        values,
      )

      const out = await client.query(
        `SELECT b.id, b.name, b.address, b.phone_number, b.email, b.established_date, b.branch_code, b.status::text AS status
         FROM senteloans_branches b
         WHERE b.id = $1`,
        [me.branch_id],
      )
      return out.rows[0]
    })

    if (!updated || "error" in updated) {
      const code = updated && "error" in updated ? updated.error : "not_found"
      const status =
        code === "no_changes" || code === "no_branch"
          ? 400
          : code === "missing_permission:edit_branch_info"
            ? 403
            : 404
      return NextResponse.json({ error: code }, { status })
    }

    const row = updated as Record<string, unknown>
    const payload = {
      id: row.id,
      name: row.name || "",
      address: row.address || "",
      phone_number: row.phone_number || "",
      email: row.email || "",
      established_date: formatDateOnly(row.established_date),
      branch_code: row.branch_code || "",
      status: row.status || "",
    }
    apiLog("info", "institution.branch.updated", { method: "PUT", apiPath, status: 200 })
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.branch.error", { method: "PUT", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
