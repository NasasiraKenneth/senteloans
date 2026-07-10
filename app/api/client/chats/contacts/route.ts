import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import { ensureMemberChatIdentity } from "@/lib/chats/server/identity"
import { listClientPortalContacts, normalizeContactsRole } from "@/lib/chats/server/list-contacts"

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
    const search = url.searchParams.get("search") ?? ""
    const role = normalizeContactsRole(url.searchParams.get("role"))

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const identity = await ensureMemberChatIdentity(client, memberId)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId,
      })
      const contacts = await listClientPortalContacts(client, identity.institutionId, {
        search,
        role,
      })
      return { ok: true as const, contacts }
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
