import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import * as crypto from "crypto"
import { AUTH_USER_TYPE_MEMBER, getUniqueUsername } from "@/lib/auth-users"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"

function isElevated(role?: string | null) {
  return role === "institution_admin" || role === "manager"
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.auth.enable.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.auth.enable.denied", { method: "POST", apiPath, status: 403, error: "user_not_linked" })
      return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    }
    if (!isElevated(session.user.role)) {
      apiLog("warn", "member.auth.enable.denied", { method: "POST", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { email?: string; password?: string }
    const email = String(body?.email || "").trim().toLowerCase()
    let password = String(body?.password || "").trim()
    if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 })
    if (!password) {
      password = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c] || c)).slice(0, 16)
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT id, institution_id FROM users WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }
      const memberRes = await client.query(
        `SELECT id, institution_id, auth_id FROM members WHERE id = $1`,
        [id]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }

      const passwordHash = await hash(password, 10)

      if (memberRow.auth_id) {
        await client.query(
          `UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, memberRow.auth_id]
        )
        await auditLogger.logUpdate(
          "members",
          memberRow.id,
          { auth_id: memberRow.auth_id },
          { login_enabled: true, password_reset: true },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
        return { ok: true, email, password }
      }

      const authId = crypto.randomUUID()
      const username = await getUniqueUsername(client, email)
      await client.query(
        `INSERT INTO app_auth_users (id, user_type, username, email, password_hash) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
        [authId, AUTH_USER_TYPE_MEMBER, username, email, passwordHash]
      )
      const existingRes = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [email])
      const linkId = existingRes.rows[0]?.id ?? authId
      await client.query(
        `UPDATE members SET auth_id = $1 WHERE id = $2`,
        [linkId, memberRow.id]
      )
      await auditLogger.logInsert(
        "members",
        memberRow.id,
        { auth_id: linkId, login_enabled: true },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )
      return { ok: true, email, password }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "member_not_found" ? 404 : 400
      apiLog("warn", "member.auth.enable.denied", { method: "POST", apiPath, status: statusCode, error: result.error, memberId: id, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "member_not_found" ? 404 : 400 })
    }
    apiLog("info", "member.auth.enable.success", { method: "POST", apiPath, status: 200, memberId: id, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.auth.enable.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
