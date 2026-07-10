import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import {
  assertChatsModuleEnabled,
  ChatsDisabledError,
  chatsDisabledResponse,
} from "@/lib/chats/server/assert-chats-enabled"
import { ensureStaffChatIdentity } from "@/lib/chats/server/identity"
import { listInstitutionContacts, normalizeContactsRole } from "@/lib/chats/server/list-contacts"

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
    const search = url.searchParams.get("search") ?? ""
    const role = normalizeContactsRole(url.searchParams.get("role"))

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return null

      const identity = await ensureStaffChatIdentity(client, actor.id)
      await assertChatsModuleEnabled(client, {
        institutionId: identity.institutionId,
        branchId: identity.branchId ?? actor.branch_id,
      })
      const contacts = await listInstitutionContacts(
        client,
        identity.institutionId,
        identity.id,
        { search, role },
      )

      return { ok: true as const, contacts }
    })

    if (!result) {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
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
