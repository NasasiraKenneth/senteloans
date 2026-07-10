import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import {
  ChatConversationError,
  createOrOpenDirectConversation,
} from "@/lib/chats/server/create-conversation"
import { ensureMemberChatIdentity } from "@/lib/chats/server/identity"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    const body = (await req.json()) as { targetChatIdentityId?: string }
    const targetChatIdentityId = String(body.targetChatIdentityId ?? "").trim()
    if (!targetChatIdentityId) {
      return NextResponse.json({ error: "targetChatIdentityId is required" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const identity = await ensureMemberChatIdentity(client, memberId)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
      return createOrOpenDirectConversation(client, {
        creatorChatIdentityId: identity.id,
        targetChatIdentityId,
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
    })

    return NextResponse.json({
      ok: true,
      conversation: result.conversation,
      created: result.created,
    })
  } catch (error: unknown) {
    if (error instanceof ChatsDisabledError) {
      return chatsDisabledResponse()
    }
    if (error instanceof ChatConversationError) {
      const status =
        error.code === "target_not_found"
          ? 404
          : error.code === "forbidden"
            ? 403
            : 400
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }

    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
