import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { assertNotSuperAdmin, hasPermission, resolveActorContext } from "@/lib/api/rbac"
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
import { ensureStaffChatIdentity } from "@/lib/chats/server/identity"
import { listMessages } from "@/lib/chats/server/list-messages"
import { sendMessage } from "@/lib/chats/server/send-message"
import { CHAT_PERMISSIONS } from "@/lib/chats/permissions"
import type { MessageType } from "@/lib/chats/types"

const ALLOWED_MESSAGE_TYPES = new Set<MessageType>([
  "TEXT",
  "IMAGE",
  "FILE",
  "AUDIO",
  "VIDEO",
])

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const { id: conversationId } = await params
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get("limit") ?? "")
    const before = url.searchParams.get("before") ?? undefined
    const after = url.searchParams.get("after") ?? undefined
    const search = url.searchParams.get("search") ?? undefined
    const markReadParam = url.searchParams.get("markRead")
    const markRead =
      markReadParam === null ? undefined : markReadParam !== "false" && markReadParam !== "0"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return null

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
      return listMessages(client, conversationId, identity.id, {
        limit: Number.isFinite(limit) ? limit : undefined,
        before,
        after,
        search,
        markRead,
        hasManageSupportParticipants: canManageSupport,
      })
    })

    if (!result) {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }

    return NextResponse.json(result)
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
    const body = (await req.json()) as {
      body?: string
      messageType?: MessageType
      replyToMessageId?: string
      clientMessageId?: string
      forwardedFromMessageId?: string
      metadata?: Record<string, unknown>
      visibility?: "PUBLIC" | "INTERNAL"
      attachment?: {
        fileName?: string
        fileUrl?: string
        mimeType?: string
        fileSize?: number
        storageKey?: string
      }
    }

    const messageType = body.messageType ?? "TEXT"
    if (!ALLOWED_MESSAGE_TYPES.has(messageType)) {
      return NextResponse.json({ error: "invalid_request", message: "Unsupported message type" }, { status: 400 })
    }

    const attachment =
      body.attachment?.fileUrl && body.attachment?.fileName
        ? {
            fileName: String(body.attachment.fileName),
            fileUrl: String(body.attachment.fileUrl),
            mimeType: body.attachment.mimeType,
            fileSize: body.attachment.fileSize,
            storageKey: body.attachment.storageKey,
          }
        : undefined

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return { kind: "not_found" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { kind: "forbidden" as const, message: writeGuard.message }
      }

      const canSend = await hasPermission(client, actor, CHAT_PERMISSIONS.sendMessages)
      if (!canSend) {
        return { kind: "forbidden" as const, message: "Missing send_chat_messages permission" }
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
      const message = await sendMessage(client, {
        conversationId,
        senderChatIdentityId: identity.id,
        body: String(body.body ?? ""),
        messageType,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
        forwardedFromMessageId: body.forwardedFromMessageId,
        metadata: body.metadata,
        attachment,
        visibility: body.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC",
        hasManageSupportParticipants: canManageSupport,
      })

      return { kind: "ok" as const, message }
    })

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: result.message }, { status: 403 })
    }

    return NextResponse.json(result.message)
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
