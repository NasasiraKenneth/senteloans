import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  resolveActorContext,
  hasPermission,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { enqueueEmail } from "@/queues/email.queue"

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { to?: string }
    const toOverride = typeof body.to === "string" ? body.to.trim() : ""

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id || !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_branch_financial_info")
      if (!allowed) return { error: "missing_permission:edit_branch_financial_info" as const }

      const staffRes = await client.query<{ email: string; full_name: string }>(
        `SELECT email, full_name FROM users WHERE id = $1 LIMIT 1`,
        [actor.id],
      )
      const staff = staffRes.rows[0]
      const to = toOverride || String(staff?.email || "").trim()
      if (!to) return { error: "recipient_email_required" as const }

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1 LIMIT 1`,
        [actor.institution_id],
      )
      const institutionName = instRes.rows[0]?.name || "Your institution"

      await enqueueEmail({
        to,
        subject: `Test email from ${institutionName}`,
        template: "email.test",
        kind: "template",
        data: { institutionName, memberName: staff?.full_name || "Staff" },
        context: {
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          actorId: actor.id,
        },
      })

      return { ok: true as const, to }
    })

    if (result && "error" in result) {
      const err = result.error
      const status =
        err === SUPER_ADMIN_WRITE_BLOCKED || err === "missing_permission:edit_branch_financial_info"
          ? 403
          : 400
      const errorText = "message" in result && result.message ? result.message : err
      return NextResponse.json({ error: errorText, code: err }, { status })
    }

    apiLog("info", "institution.email_settings.test.success", {
      method: "POST",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
      to: result.to,
    })
    return NextResponse.json({ ok: true, to: result.to })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.email_settings.test.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
