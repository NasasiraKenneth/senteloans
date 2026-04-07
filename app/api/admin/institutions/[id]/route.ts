import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const result = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `SELECT id, name, type, status, registration_number, license_number, address, phone_number, email, website, logo, established_date, created_at, updated_at FROM senteloans_institutions WHERE id = $1`,
        [id]
      )
      return res.rows[0] || null
    })

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ institution: result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const update: Record<string, unknown> = {}
    if (typeof body.name === "string") update.name = body.name
    if (typeof body.type === "string") update.type = body.type
    if (typeof body.status === "string") update.status = body.status
    if (typeof body.email === "string") update.email = body.email
    if (typeof body.phone === "string") update.phone_number = body.phone
    if (typeof body.address === "string") update.address = body.address
    if (typeof body.registrationNumber === "string") update.registration_number = body.registrationNumber
    if (typeof body.licenseNumber === "string") update.license_number = body.licenseNumber
    if (typeof body.website === "string") update.website = body.website
    if (typeof body.logo === "string") update.logo = body.logo

    await runWithoutAuth(async (client) => {
      if (Object.keys(update).length === 0) return
      const keys = Object.keys(update)
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
      const vals = Object.values(update)
      await client.query(`UPDATE senteloans_institutions SET ${setClause} WHERE id = $1`, [id, ...vals])
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
