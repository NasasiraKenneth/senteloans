import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import * as crypto from "crypto"
import {
  AUTH_USER_TYPE_MEMBER,
  getUniqueUsername,
} from "@/lib/auth-users"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import {
  assertMemberAndBranchActive,
  isMemberRouteDenial,
  memberRouteDenialBody,
  memberRouteHttpStatus,
  memberWriteGateRouteError,
} from "@/lib/members/member-status"
import { ensureMemberChatIdentity, ensureSystemChatIdentity } from "@/lib/chats/server/identity"
import { ensureMemberSupportConversation } from "@/lib/chats/server/ensure-member-support"
import { isChatsModuleEnabled } from "@/lib/chats/server/assert-chats-enabled"
import { notifyMemberPortalLoginEnabled } from "@/lib/notifications/member-events"
import { enqueueMemberPortalCredentialsEmail } from "@/lib/email/member-emails"

function clientPortalLoginUrl(): string {
  const base = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/$/, "")
  return base ? `${base}/client-login` : "/client-login"
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

    const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
    const requestedEmail = String(body?.email || "").trim().toLowerCase()
    let password = String(body?.password || "").trim()
    if (!password) {
      password = crypto
        .randomBytes(12)
        .toString("base64")
        .replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c] || c))
        .slice(0, 16)
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_member")
      if (!allowed) return { error: "missing_permission:edit_member" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const gate = await assertMemberAndBranchActive(client, id, actor.institution_id)
      if (!gate.ok) return memberWriteGateRouteError(gate)!

      if (gate.member.branch_id !== actor.branch_id) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      const memberEmail = String(gate.member.email || "").trim().toLowerCase()
      if (!memberEmail) return { error: "email_required" as const }
      if (requestedEmail && requestedEmail !== memberEmail) {
        return { error: "email_mismatch" as const }
      }
      const email = memberEmail

      const institutionRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1 LIMIT 1`,
        [actor.institution_id]
      )
      const institutionName = institutionRes.rows[0]?.name || "Your institution"

      const memberAuthRes = await client.query<{ auth_id: string | null }>(
        `SELECT auth_id FROM members WHERE id = $1`,
        [id]
      )
      const existingAuthId = memberAuthRes.rows[0]?.auth_id ?? null
      const passwordReset = Boolean(existingAuthId)
      const passwordHash = await hash(password, 10)

      if (existingAuthId) {
        await client.query(
          `UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, existingAuthId]
        )
        await auditLogger.logUpdate(
          "members",
          gate.member.id,
          { auth_id: existingAuthId },
          { login_enabled: true, password_reset: true },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
      } else {
        const existingEmailRes = await client.query<{ id: string; user_type: string }>(
          `SELECT id, user_type FROM app_auth_users WHERE lower(email) = $1 LIMIT 1`,
          [email]
        )
        const existingAuth = existingEmailRes.rows[0]

        if (existingAuth) {
          if (existingAuth.user_type !== AUTH_USER_TYPE_MEMBER) {
            return { error: "email_in_use" as const }
          }

          const linkedRes = await client.query<{ id: string }>(
            `SELECT id FROM members WHERE auth_id = $1 AND id <> $2 LIMIT 1`,
            [existingAuth.id, gate.member.id]
          )
          if (linkedRes.rows[0]) {
            return { error: "email_already_linked" as const }
          }

          await client.query(
            `UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [passwordHash, existingAuth.id]
          )
          await client.query(`UPDATE members SET auth_id = $1 WHERE id = $2`, [
            existingAuth.id,
            gate.member.id,
          ])
          await auditLogger.logInsert(
            "members",
            gate.member.id,
            { auth_id: existingAuth.id, login_enabled: true },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        } else {
          const authId = crypto.randomUUID()
          const username = await getUniqueUsername(client, email)
          await client.query(
            `INSERT INTO app_auth_users (id, user_type, username, email, password_hash)
             VALUES ($1, $2, $3, $4, $5)`,
            [authId, AUTH_USER_TYPE_MEMBER, username, email, passwordHash]
          )
          await client.query(`UPDATE members SET auth_id = $1 WHERE id = $2`, [
            authId,
            gate.member.id,
          ])
          await auditLogger.logInsert(
            "members",
            gate.member.id,
            { auth_id: authId, login_enabled: true },
            actor.institution_id,
            actor.id,
            undefined,
            client
          )
        }
      }

      let supportCreated: boolean | null = null
      const chatsEnabled = await isChatsModuleEnabled(client, {
        institutionId: gate.member.institution_id,
        branchId: gate.member.branch_id,
      })
      if (chatsEnabled) {
        const memberIdentity = await ensureMemberChatIdentity(client, gate.member.id)
        const systemIdentityId = await ensureSystemChatIdentity(
          client,
          gate.member.institution_id
        )
        const support = await ensureMemberSupportConversation(client, {
          memberChatIdentityId: memberIdentity.id,
          memberId: gate.member.id,
          institutionId: gate.member.institution_id,
          branchId: gate.member.branch_id,
          systemIdentityId,
          memberDisplayName: gate.member.full_name,
        })
        supportCreated = support.created
      }

      return {
        ok: true as const,
        email,
        password,
        supportCreated,
        passwordReset,
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          institutionName,
          member: {
            id: gate.member.id,
            full_name: gate.member.full_name,
            member_number: gate.member.member_number,
            email,
          },
        },
      }
    })

    if (result && "error" in result && isMemberRouteDenial(result)) {
      const statusCode = memberRouteHttpStatus(result.error, {
        forbidden: [
          "missing_permission:edit_member",
          "cross_branch_operation_forbidden",
          SUPER_ADMIN_WRITE_BLOCKED,
          "actor_branch_missing",
          "user_not_linked",
        ],
        badRequest: [
          "email_required",
          "email_mismatch",
          "email_in_use",
          "email_already_linked",
        ],
        notFound: ["member_not_found", "branch_not_found"],
      })
      apiLog("warn", "member.auth.enable.denied", {
        method: "POST",
        apiPath,
        status: statusCode,
        error: result.error,
        memberId: id,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json(memberRouteDenialBody(result), { status: statusCode })
    }

    if (!result || !("ok" in result) || !result.ok) {
      apiLog("warn", "member.auth.enable.failed", {
        method: "POST",
        apiPath,
        status: 400,
        error: "enable_failed",
        memberId: id,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: "enable_failed" }, { status: 400 })
    }

    const ctx = result.postCommit

    try {
      const notifyRes = await runWithoutAuth((notifyClient) =>
        notifyMemberPortalLoginEnabled({
          client: notifyClient,
          actor: {
            id: ctx.actorId,
            institution_id: ctx.institutionId,
            branch_id: ctx.branchId,
          },
          member: {
            id: ctx.member.id,
            full_name: ctx.member.full_name,
            member_number: ctx.member.member_number,
          },
          institutionName: ctx.institutionName,
          passwordReset: result.passwordReset,
        }),
      )
      apiLog(
        notifyRes.ok ? "info" : "warn",
        notifyRes.ok
          ? "member.auth.enable.notifications_dispatched"
          : "member.auth.enable.notifications_partial",
        {
          method: "POST",
          apiPath,
          status: 200,
          memberId: id,
          memberNotifications: notifyRes.memberNotifications,
          staffNotifications: notifyRes.staffNotifications,
          ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
        },
      )
    } catch (notifyErr) {
      apiLog("error", "member.auth.enable.notifications_failed", {
        method: "POST",
        apiPath,
        status: 200,
        memberId: id,
        error: (notifyErr as Error)?.message || "notify_failed",
      })
    }

    try {
      const emailRes = await enqueueMemberPortalCredentialsEmail({
        member: {
          id: ctx.member.id,
          full_name: ctx.member.full_name,
          member_number: ctx.member.member_number,
          email: ctx.member.email,
        },
        institutionName: ctx.institutionName,
        loginEmail: result.email,
        temporaryPassword: result.password,
        loginUrl: clientPortalLoginUrl(),
        passwordReset: result.passwordReset,
        context: {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          actorId: ctx.actorId,
        },
      })
      if (emailRes.errors.length > 0) {
        apiLog("warn", "member.auth.enable.email_enqueue_partial", {
          method: "POST",
          apiPath,
          status: 200,
          memberId: id,
          enqueued: emailRes.enqueued,
          skipped: emailRes.skipped,
          errors: emailRes.errors,
        })
      } else {
        apiLog("info", "member.auth.enable.email_enqueued", {
          method: "POST",
          apiPath,
          status: 200,
          memberId: id,
          enqueued: emailRes.enqueued,
          skipped: emailRes.skipped,
        })
      }
    } catch (emailErr) {
      apiLog("error", "member.auth.enable.email_enqueue_failed", {
        method: "POST",
        apiPath,
        status: 200,
        memberId: id,
        error: (emailErr as Error)?.message || "email_enqueue_failed",
      })
    }

    apiLog("info", "member.auth.enable.success", {
      method: "POST",
      apiPath,
      status: 200,
      memberId: id,
      authUserId: session.user.authUserId,
      passwordReset: result.passwordReset,
    })
    return NextResponse.json({
      ok: true,
      email: result.email,
      password: result.password,
      supportCreated: result.supportCreated,
      passwordReset: result.passwordReset,
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.auth.enable.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
