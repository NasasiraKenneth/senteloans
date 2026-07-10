import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { hasPermission, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import { ensureStaffChatIdentity } from "@/lib/chats/server/identity"
import { CHAT_PERMISSIONS } from "@/lib/chats/permissions"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return null

      const canView = await hasPermission(client, actor, CHAT_PERMISSIONS.viewChats)
      if (!canView) {
        return { ok: true as const, totalUnread: 0, allowed: false }
      }

      const identity = await ensureStaffChatIdentity(client, actor.id)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId ?? actor.branch_id,
      })
      const unreadRes = await client.query(
        `SELECT COALESCE(SUM(unread_count), 0)::int AS total_unread
           FROM (
             SELECT (
               SELECT COUNT(*)::int
                 FROM messages msg
                WHERE msg.conversation_id = c.id
                  AND msg.is_deleted = FALSE
                  AND msg.sender_id <> $1
                  AND (
                    cp.last_read_message_id IS NULL
                    OR msg.created_at > (
                      SELECT m2.created_at
                        FROM messages m2
                       WHERE m2.id = cp.last_read_message_id
                    )
                  )
             ) AS unread_count
               FROM conversations c
              INNER JOIN conversation_participants cp
                 ON cp.conversation_id = c.id
                AND cp.chat_identity_id = $1
                AND cp.left_at IS NULL
           ) unread_counts`,
        [identity.id],
      )

      return {
        ok: true as const,
        totalUnread: unreadRes.rows[0]?.total_unread ?? 0,
        allowed: true,
        currentIdentityId: identity.id,
      }
    })

    if (!result) {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof ChatsDisabledError) {
      return chatsDisabledResponse()
    }
    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
