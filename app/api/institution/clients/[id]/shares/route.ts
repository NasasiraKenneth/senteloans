import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      const clientRes = await client.query(
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow || clientRow.institution_id !== appUser.institution_id) return null

      const res = await client.query(
        `SELECT id, number_of_shares, share_value, total_value, purchase_date, created_at FROM senteloans_client_shares WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      )
      return { shares: res.rows }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 400 })

    const body = (await req.json()) as { numberOfShares?: number }
    const numberOfShares = Number(body?.numberOfShares)
    if (!Number.isInteger(numberOfShares) || numberOfShares <= 0) {
      return NextResponse.json({ error: "invalid_number_of_shares" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "no_app_user" as const }

      const clientRes = await client.query(
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const clientRow = clientRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }
      if (clientRow.institution_id !== appUser.institution_id) return { error: "forbidden" as const }

      const instRes = await client.query(
        `SELECT settings, type FROM senteloans_institutions WHERE id = $1`,
        [appUser.institution_id]
      )
      const inst = instRes.rows[0]
      if (!inst) return { error: "institution_not_found" as const }

      const settings = (inst.settings as Record<string, unknown>) || {}
      const mods = settings.modules as Record<string, unknown> | undefined
      const sharesEnabled = Boolean(mods?.shares)
      const valuePerShare = Number((settings as { share_value?: number }).share_value)
      const minShares = (settings as { minimum_shares?: number }).minimum_shares != null ? Number((settings as { minimum_shares?: number }).minimum_shares) : undefined
      const maxShares = (settings as { maximum_shares?: number }).maximum_shares != null ? Number((settings as { maximum_shares?: number }).maximum_shares) : undefined

      if (!sharesEnabled) return { error: "shares_disabled" as const }
      if (!valuePerShare || Number.isNaN(valuePerShare) || valuePerShare <= 0) {
        return { error: "share_value_not_configured" as const }
      }
      if (typeof minShares === "number" && numberOfShares < minShares) return { error: `minimum_shares_${minShares}` as const }
      if (typeof maxShares === "number" && numberOfShares > maxShares) return { error: `maximum_shares_${maxShares}` as const }

      const purchaseDate = new Date().toISOString().slice(0, 10)
      const insRes = await client.query(
        `INSERT INTO senteloans_client_shares (client_id, number_of_shares, share_value, purchase_date) VALUES ($1, $2, $3, $4) RETURNING id`,
        [clientId, numberOfShares, valuePerShare, purchaseDate]
      )
      const row = insRes.rows[0]
      return { ok: true, id: row?.id }
    })

    if (result && "error" in result) {
      const status = result.error === "forbidden" || result.error === "no_app_user" ? 403 : result.error === "client_not_found" || result.error === "institution_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
