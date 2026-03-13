import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import * as crypto from "crypto"
import { auditLogger } from "@/lib/audit/audit-logger"

function isElevated(role?: string | null) {
  return role === "institution_admin" || role === "manager"
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    if (!isElevated(session.user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { email?: string; password?: string }
    const email = String(body?.email || "").trim().toLowerCase()
    let password = String(body?.password || "").trim()
    if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 })
    if (!password) {
      password = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c] || c)).slice(0, 16)
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }
      const memberRes = await client.query(
        `SELECT id, institution_id, supabase_user_id FROM senteloans_members WHERE id = $1`,
        [id]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }

      const passwordHash = await hash(password, 10)

      if (memberRow.supabase_user_id) {
        await client.query(
          `UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, memberRow.supabase_user_id]
        )
        await auditLogger.logUpdate(
          "senteloans_members",
          memberRow.id,
          { supabase_user_id: memberRow.supabase_user_id },
          { login_enabled: true, password_reset: true },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
        return { ok: true, email, password }
      }

      const authId = crypto.randomUUID()
      await client.query(
        `INSERT INTO app_auth_users (id, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
        [authId, email, passwordHash]
      )
      const existingRes = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [email])
      const linkId = existingRes.rows[0]?.id ?? authId
      await client.query(
        `UPDATE senteloans_members SET supabase_user_id = $1 WHERE id = $2`,
        [linkId, memberRow.id]
      )
      await auditLogger.logInsert(
        "senteloans_members",
        memberRow.id,
        { supabase_user_id: linkId, login_enabled: true },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )
      return { ok: true, email, password }
    })

    if (result && "error" in result)
      return NextResponse.json({ error: result.error }, { status: result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "member_not_found" ? 404 : 400 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
