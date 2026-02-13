import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const uiType = body.type as string | undefined
    const type = uiType === "sacco" ? "SACCO" : uiType === "mfi" ? "MFI" : uiType === "money-lender" ? "Money Lender" : (body.type as string)
    const settings = JSON.stringify({
      clientTerminology: body.clientTerminology || "Client",
      contactPerson: body.contactPerson ?? null,
      modules: body.modules || {},
      features: body.features || {},
    })

    const result = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `INSERT INTO senteloans_institutions (name, type, address, phone_number, email, website, registration_number, license_number, status, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) RETURNING id`,
        [
          body.name,
          type,
          body.address ?? null,
          body.phone ?? null,
          body.email ?? null,
          body.website ?? null,
          body.registrationNumber ?? null,
          body.licenseNumber ?? null,
          (body.status as string) || "Active",
          settings,
        ]
      )
      return { ok: true, id: res.rows[0]?.id }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
