import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { assertNotSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import {
  ChatMessageError,
  mapChatMessageError,
} from "@/lib/chats/server/chat-message-error"
import { forwardMessages } from "@/lib/chats/server/forward-messages"
import { ensureStaffChatIdentity } from "@/lib/chats/server/identity"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
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
        { error: "invalid_request", message: "sourceConversationId, sourceMessageId, and targetConversationIds are required" },
        { status: 400 },
      )
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return { kind: "not_found" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { kind: "forbidden" as const, message: writeGuard.message }
      }

      const identity = await ensureStaffChatIdentity(client, actor.id)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId ?? actor.branch_id,
      })
      const payload = await forwardMessages(client, {
        sourceConversationId,
        sourceMessageId,
        targetConversationIds,
        senderChatIdentityId: identity.id,
        caption: body.caption ?? "",
      })

      return { kind: "ok" as const, payload }
    })

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: result.message }, { status: 403 })
    }

    return NextResponse.json(result.payload)
  } catch (error: unknown) {
    if (error instanceof ChatsDisabledError) {
      return chatsDisabledResponse()
    }
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
