import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/institutions/list
 * List all institutions for system_admin (e.g. admin institutions page).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const institutions = await runWithoutAuth(async (client) => {
      const res = await client.query(
        "SELECT id, name, type, status, email, phone_number, created_at FROM institutions ORDER BY created_at DESC"
      )
      return res.rows
    })
    return NextResponse.json(institutions)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
