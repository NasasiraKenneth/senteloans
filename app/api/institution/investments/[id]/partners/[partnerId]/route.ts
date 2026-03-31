import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return runWithAuth(session.user.authUserId, async (client) => {
    const counterpartyId = String(body.counterpartyId || body.counterparty_id || "").trim()
    const role = String(body.role || "").trim() || null
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active"
    const contributionPercentage = body.contributionPercentage ?? body.contribution_percentage ?? null
    const contributionAmount = body.contributionAmount ?? body.contribution_amount ?? null
    const ownershipPercentage = body.ownershipPercentage ?? body.ownership_percentage ?? null
    await client.query(
      `UPDATE senteloans_investment_partners
       SET counterparty_id = $1, role = $2, status = $3,
           contribution_percentage = $4, contribution_amount = $5, ownership_percentage = $6, updated_at = NOW()
       WHERE id = $7`,
      [counterpartyId, role, status, contributionPercentage, contributionAmount, ownershipPercentage, partnerId],
    )
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  return runWithAuth(session.user.authUserId, async (client) => {
    await client.query(`DELETE FROM senteloans_investment_partners WHERE id = $1`, [partnerId])
    return NextResponse.json({ ok: true })
  })
}
