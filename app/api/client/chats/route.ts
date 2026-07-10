import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import { ensureMemberChatIdentity, ensureSystemChatIdentity } from "@/lib/chats/server/identity"
import { ensureMemberSupportConversation } from "@/lib/chats/server/ensure-member-support"
import { loadInbox } from "@/lib/chats/server/load-inbox"
import { normalizeInboxFilter } from "@/lib/chats/server/inbox-query"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    const url = new URL(req.url)
    const skipCache = url.searchParams.get("refresh") === "true"
    const filter = normalizeInboxFilter(url.searchParams.get("filter"))
    const search = url.searchParams.get("search") ?? ""

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const identity = await ensureMemberChatIdentity(client, memberId)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
      const systemIdentityId = await ensureSystemChatIdentity(client, identity.institutionId)

      await ensureMemberSupportConversation(client, {
        memberChatIdentityId: identity.id,
        memberId,
        institutionId: identity.institutionId,
        branchId: identity.branchId,
        systemIdentityId,
      })

      return loadInbox(client, {
        chatIdentityId: identity.id,
        institutionId: identity.institutionId,
        skipCache: true,
        query: {
          filter,
          search,
          publicMessagesOnly: true,
          viewerRole: "member",
        },
      })
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof ChatsDisabledError) {
      return chatsDisabledResponse()
    }
    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
