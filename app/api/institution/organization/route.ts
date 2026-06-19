import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

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
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
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
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const row = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT u.institution_id, i.id AS inst_id, i.name, i.type,
                i.license_number, i.registration_number, i.website, i.logo
         FROM users u
         JOIN institutions i ON i.id = u.institution_id
         WHERE u.auth_id = $1`,
        [session!.user!.authUserId]
      )
      return userRes.rows[0]
    })

    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

    return NextResponse.json({
      id: row.inst_id,
      name: row.name,
      type: row.type,
      license_number: row.license_number || "",
      registration_number: row.registration_number || "",
      website: row.website || "",
      logo: row.logo || "",
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

function isValidUrl(url: string) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json()) as Record<string, unknown>
    const {
      license_number,
      registration_number,
      website,
      logo,
    } = body || {}

    if (typeof website === "string" && website && !isValidUrl(website)) {
      return NextResponse.json({ error: "invalid_website" }, { status: 400 })
    }
    if (typeof logo === "string" && logo && !isValidUrl(logo)) {
      return NextResponse.json({ error: "invalid_logo" }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1
    if (license_number !== undefined) {
      updates.push(`license_number = $${i++}`)
      values.push(license_number)
    }
    if (registration_number !== undefined) {
      updates.push(`registration_number = $${i++}`)
      values.push(registration_number)
    }
    if (website !== undefined) {
      updates.push(`website = $${i++}`)
      values.push(website)
    }
    if (logo !== undefined) {
      updates.push(`logo = $${i++}`)
      values.push(logo)
    }
    if (updates.length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return null
      const canEdit = await hasPermission(client, actor, "edit_institution_info")
      if (!canEdit) return { error: "missing_permission:edit_institution_info" as const }

      const meRes = await client.query(
        `SELECT institution_id FROM users WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const me = meRes.rows[0]
      if (!me) return null
      values.push(me.institution_id)
      await client.query(
        `UPDATE institutions SET ${updates.join(", ")} WHERE id = $${i}`,
        values
      )
      const instRes = await client.query(
        `SELECT id, name, type, license_number, registration_number, website, logo
         FROM institutions WHERE id = $1`,
        [me.institution_id]
      )
      return instRes.rows[0]
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
