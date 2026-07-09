import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { assertNotSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import {
  ChatConversationError,
  createGroupConversation,
  createOrOpenDirectConversation,
} from "@/lib/chats/server/create-conversation"
import {
  ensureStaffChatIdentity,
  ensureSystemChatIdentity,
} from "@/lib/chats/server/identity"

type DirectBody = {
  type: "direct"
  targetChatIdentityId: string
}

type GroupBody = {
  type: "group"
  name: string
  description?: string
  participantChatIdentityIds: string[]
}

function mapConversationError(error: ChatConversationError) {
  switch (error.code) {
    case "same_participant":
    case "invalid_target":
    case "invalid_participants":
      return { status: 400, error: error.code, message: error.message }
    case "target_not_found":
      return { status: 404, error: error.code, message: error.message }
    case "forbidden":
      return { status: 403, error: error.code, message: error.message }
    default:
      return { status: 400, error: "invalid_request", message: error.message }
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json()) as Partial<DirectBody | GroupBody>
    if (!body?.type) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 })
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

      if (body.type === "direct") {
        const targetChatIdentityId = String(body.targetChatIdentityId ?? "").trim()
        if (!targetChatIdentityId) {
          return { kind: "bad_request" as const, message: "targetChatIdentityId is required" }
        }

        const created = await createOrOpenDirectConversation(client, {
          creatorChatIdentityId: identity.id,
          targetChatIdentityId,
          institutionId: identity.institutionId,
          branchId: identity.branchId,
        })

        return {
          kind: "direct" as const,
          conversation: created.conversation,
          created: created.created,
        }
      }

      if (body.type === "group") {
        const groupBody = body as GroupBody
        const conversation = await createGroupConversation(client, {
          creatorChatIdentityId: identity.id,
          institutionId: identity.institutionId,
          branchId: identity.branchId,
          name: groupBody.name ?? "",
          description: groupBody.description ?? "",
          participantChatIdentityIds: Array.isArray(groupBody.participantChatIdentityIds)
            ? groupBody.participantChatIdentityIds
            : [],
          systemIdentityId,
        })

        return { kind: "group" as const, conversation }
      }

      return { kind: "bad_request" as const, message: "Unsupported conversation type" }
    })

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: result.message }, { status: 403 })
    }
    if (result.kind === "bad_request") {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    if (result.kind === "direct") {
      return NextResponse.json({
        ok: true,
        conversation: result.conversation,
        created: result.created,
      })
    }

    return NextResponse.json({
      ok: true,
      conversation: result.conversation,
      created: true,
    })
  } catch (error: unknown) {
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
