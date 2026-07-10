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
import { ensureStaffChatIdentity, ensureSystemChatIdentity } from "@/lib/chats/server/identity"
import { loadInbox } from "@/lib/chats/server/load-inbox"
import { normalizeInboxFilter } from "@/lib/chats/server/inbox-query"
import { CHAT_PERMISSIONS } from "@/lib/chats/permissions"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const skipCache = url.searchParams.get("refresh") === "true"
    const filter = normalizeInboxFilter(url.searchParams.get("filter"))
    const search = url.searchParams.get("search") ?? ""

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return null

      const canView = await hasPermission(client, actor, CHAT_PERMISSIONS.viewChats)
      if (!canView) {
        return { forbidden: true as const }
      }

      const canManageSupport = await hasPermission(
        client,
        actor,
        CHAT_PERMISSIONS.manageSupportChatParticipants,
      )

      const identity = await ensureStaffChatIdentity(client, actor.id)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId ?? actor.branch_id,
      })
      await ensureSystemChatIdentity(client, identity.institutionId)

      return loadInbox(client, {
        chatIdentityId: identity.id,
        institutionId: identity.institutionId,
        skipCache: skipCache || canManageSupport,
        query: {
          filter,
          search,
          viewerRole: "staff",
          includeSupportQueue: canManageSupport,
          canManageSupportParticipants: canManageSupport,
          branchId: identity.branchId ?? actor.branch_id,
        },
      })
    })

    if (!result) {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }
    if ("forbidden" in result) {
      return NextResponse.json({ error: "missing_view_chats_permission" }, { status: 403 })
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
