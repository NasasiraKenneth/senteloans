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

    const body = (await req.json()) as { numberOfShares?: number; mode?: string; description?: string }
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
      // Support both snake_case and camelCase settings keys
      const valuePerShareRaw = (settings as { share_value?: number; shareValue?: number }).share_value
        ?? (settings as { share_value?: number; shareValue?: number }).shareValue
      const valuePerShare = Number(valuePerShareRaw)
      const minSharesRaw = (settings as { minimum_shares?: number; minimumShares?: number }).minimum_shares
        ?? (settings as { minimum_shares?: number; minimumShares?: number }).minimumShares
      const maxSharesRaw = (settings as { maximum_shares?: number; maximumShares?: number }).maximum_shares
        ?? (settings as { maximum_shares?: number; maximumShares?: number }).maximumShares
      const minShares = minSharesRaw != null ? Number(minSharesRaw) : undefined
      const maxShares = maxSharesRaw != null ? Number(maxSharesRaw) : undefined

      if (!sharesEnabled) return { error: "shares_disabled" as const }
      if (!valuePerShare || Number.isNaN(valuePerShare) || valuePerShare <= 0) {
        return { error: "share_value_not_configured" as const }
      }
      if (typeof minShares === "number" && numberOfShares < minShares) return { error: `minimum_shares_${minShares}` as const }
      if (typeof maxShares === "number" && numberOfShares > maxShares) return { error: `maximum_shares_${maxShares}` as const }

      const purchaseDate = new Date().toISOString().slice(0, 10)
      const purchaseValue = numberOfShares * valuePerShare
      const txNumber = `SHR-${Date.now()}`
      const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
      const requestedMode = typeof body.mode === "string" && body.mode.trim() ? body.mode.trim() : "Cash"
      const mode = validModes.includes(requestedMode) ? requestedMode : "Cash"
      const description = typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : `Shares purchase: ${numberOfShares} share(s) @ ${valuePerShare.toLocaleString()} each`

      try {
        await client.query("BEGIN")

        // Track running share value balance for this member
        const shareBalRes = await client.query(
          `SELECT COALESCE(SUM(total_value), 0)::numeric AS total_share_value FROM senteloans_client_shares WHERE client_id = $1`,
          [clientId]
        )
        const balanceBefore = Number(shareBalRes.rows[0]?.total_share_value || 0)
        const balanceAfter = balanceBefore + purchaseValue

        const insRes = await client.query(
          `INSERT INTO senteloans_client_shares (client_id, number_of_shares, share_value, purchase_date) VALUES ($1, $2, $3, $4) RETURNING id`,
          [clientId, numberOfShares, valuePerShare, purchaseDate]
        )
        const row = insRes.rows[0]

        // Use Shares Purchase when enum exists, fallback to Deposit to avoid runtime enum errors.
        const enumRes = await client.query(
          `SELECT 1
           FROM pg_enum
           WHERE enumlabel = 'Shares Purchase'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
           LIMIT 1`
        )
        const hasSharesPurchaseType = Number(enumRes.rowCount || 0) > 0
        const txType = hasSharesPurchaseType ? "Shares Purchase" : "Deposit"

        // If enum migration is not yet applied, fallback to Deposit requires an account_id
        // due to transaction reference constraints.
        let fallbackAccountId: string | null = null
        if (!hasSharesPurchaseType) {
          const accRes = await client.query(
            `SELECT id
             FROM senteloans_savings_accounts
             WHERE institution_id = $1 AND client_id = $2
             ORDER BY CASE WHEN account_type = 'Shares' THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [appUser.institution_id, clientId]
          )
          fallbackAccountId = accRes.rows[0]?.id || null
          if (!fallbackAccountId) {
            throw new Error("shares_transaction_account_missing")
          }
        }

        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, '', $9, $10, $11, $12, 'Completed')`,
          [
            appUser.institution_id,
            clientId,
            fallbackAccountId,
            txNumber,
            txType,
            purchaseValue,
            mode,
            description,
            balanceBefore,
            balanceAfter,
            appUser.id,
            new Date().toISOString(),
          ]
        )

        await client.query("COMMIT")
        return { ok: true, id: row?.id, transaction_number: txNumber }
      } catch (e: unknown) {
        await client.query("ROLLBACK")
        const err = e as Error
        return { error: err?.message === "shares_transaction_account_missing" ? "shares_transaction_account_missing" as const : "shares_transaction_failed" as const }
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "forbidden" || result.error === "no_app_user"
          ? 403
          : result.error === "client_not_found" || result.error === "institution_not_found"
            ? 404
            : result.error === "shares_transaction_account_missing"
              ? 400
            : result.error === "shares_transaction_failed"
              ? 500
              : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
