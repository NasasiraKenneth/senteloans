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
  ChatMessageError,
  mapChatMessageError,
} from "@/lib/chats/server/chat-message-error"
import { ensureMemberChatIdentity } from "@/lib/chats/server/identity"
import { listMessages } from "@/lib/chats/server/list-messages"
import { sendMessage } from "@/lib/chats/server/send-message"
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

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
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
      const identity = await ensureMemberChatIdentity(client, memberId)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
      return listMessages(client, conversationId, identity.id, {
        limit: Number.isFinite(limit) ? limit : undefined,
        before,
        after,
        search,
        markRead,
        publicMessagesOnly: true,
      })
    })

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

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    const { id: conversationId } = await params
    const body = (await req.json()) as {
      body?: string
      messageType?: MessageType
      replyToMessageId?: string
      clientMessageId?: string
      forwardedFromMessageId?: string
      metadata?: Record<string, unknown>
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
      const identity = await ensureMemberChatIdentity(client, memberId)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
      return sendMessage(client, {
        conversationId,
        senderChatIdentityId: identity.id,
        body: String(body.body ?? ""),
        messageType,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
        forwardedFromMessageId: body.forwardedFromMessageId,
        metadata: body.metadata,
        attachment,
        publicMessagesOnly: true,
        visibility: "PUBLIC",
      })
    })

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
