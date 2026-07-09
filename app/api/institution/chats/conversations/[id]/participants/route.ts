import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { assertNotSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { addConversationParticipants } from "@/lib/chats/server/add-participants"
import {
  ChatConversationError,
} from "@/lib/chats/server/create-conversation"
import {
  ChatMessageError,
  mapChatMessageError,
} from "@/lib/chats/server/chat-message-error"
import {
  ensureStaffChatIdentity,
  ensureSystemChatIdentity,
} from "@/lib/chats/server/identity"

type RouteContext = { params: Promise<{ id: string }> }

function mapConversationError(error: ChatConversationError) {
  switch (error.code) {
    case "invalid_participants":
      return { status: 400, error: error.code, message: error.message }
    case "forbidden":
      return { status: 403, error: error.code, message: error.message }
    default:
      return { status: 400, error: error.code, message: error.message }
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const { id: conversationId } = await params
    const body = (await req.json()) as { participantChatIdentityIds?: string[] }
    const participantChatIdentityIds = Array.isArray(body.participantChatIdentityIds)
      ? body.participantChatIdentityIds.map((id) => String(id).trim()).filter(Boolean)
      : []

    if (participantChatIdentityIds.length === 0) {
      return NextResponse.json(
        { error: "invalid_request", message: "participantChatIdentityIds is required" },
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
      const systemIdentityId = await ensureSystemChatIdentity(client, identity.institutionId)
      const payload = await addConversationParticipants(client, {
        conversationId,
        actorChatIdentityId: identity.id,
        participantChatIdentityIds,
        systemIdentityId,
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
    if (error instanceof ChatMessageError) {
      const mapped = mapChatMessageError(error)
      return NextResponse.json(
        { error: mapped.error, message: mapped.message },
        { status: mapped.status },
      )
    }
    if (error instanceof ChatConversationError) {
      const mapped = mapConversationError(error)
      return NextResponse.json(
        { error: mapped.error, message: mapped.message },
        { status: mapped.status },
      )
    }

    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
