import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { ensureStaffChatIdentity, ensureSystemChatIdentity } from "@/lib/chats/server/identity"
import { loadInbox } from "@/lib/chats/server/load-inbox"
import { normalizeInboxFilter } from "@/lib/chats/server/inbox-query"

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
    const skipCache = url.searchParams.get("refresh") === "true"
    const filter = normalizeInboxFilter(url.searchParams.get("filter"))
    const search = url.searchParams.get("search") ?? ""

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId)
      if (!actor) return null

      const identity = await ensureStaffChatIdentity(client, actor.id)
      await ensureSystemChatIdentity(client, identity.institutionId)

      return loadInbox(client, {
        chatIdentityId: identity.id,
        institutionId: identity.institutionId,
        skipCache,
        query: { filter, search },
      })
    })

    if (!result) {
      return NextResponse.json({ error: "staff_user_not_found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
