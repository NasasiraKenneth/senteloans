import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  ChatMessageError,
  mapChatMessageError,
} from "@/lib/chats/server/chat-message-error"
import { forwardMessages } from "@/lib/chats/server/forward-messages"
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

    const body = (await req.json()) as {
      sourceConversationId?: string
      sourceMessageId?: string
      targetConversationIds?: string[]
      caption?: string
    }

    const sourceConversationId = String(body.sourceConversationId ?? "").trim()
    const sourceMessageId = String(body.sourceMessageId ?? "").trim()
    const targetConversationIds = Array.isArray(body.targetConversationIds)
      ? body.targetConversationIds.map((id) => String(id).trim()).filter(Boolean)
      : []

    if (!sourceConversationId || !sourceMessageId || targetConversationIds.length === 0) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "sourceConversationId, sourceMessageId, and targetConversationIds are required",
        },
        { status: 400 },
      )
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const identity = await ensureMemberChatIdentity(client, memberId)
      return forwardMessages(client, {
        sourceConversationId,
        sourceMessageId,
        targetConversationIds,
        senderChatIdentityId: identity.id,
        caption: body.caption ?? "",
      })
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof ChatMessageError) {
      const mapped = mapChatMessageError(error)
      return NextResponse.json(
        { error: mapped.error, message: mapped.message },
        { status: mapped.status },
      )
    }

    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
