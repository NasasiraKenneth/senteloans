import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "forbidden" as const }

      const res = await client.query(
        `SELECT id, number_of_shares, share_value, total_value, purchase_date, created_at FROM senteloans_member_shares WHERE member_id = $1 ORDER BY created_at DESC`,
        [memberId]
      )
      return { shares: res.rows }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:view_members" || result.error === "forbidden" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.shares.list.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const body = (await req.json()) as { numberOfShares?: number; mode?: string; description?: string }
    const numberOfShares = Number(body?.numberOfShares)
    if (!Number.isInteger(numberOfShares) || numberOfShares <= 0) {
      return NextResponse.json({ error: "invalid_number_of_shares" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.shares.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user" as const }
      const allowed = await hasPermission(client, actor, "edit_shares")
      if (!allowed) return { error: "missing_permission:edit_shares" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) return { error: "forbidden" as const }

      const instRes = await client.query(
        `SELECT settings, type FROM senteloans_institutions WHERE id = $1`,
        [actor.institution_id]
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
          `SELECT COALESCE(SUM(total_value), 0)::numeric AS total_share_value FROM senteloans_member_shares WHERE member_id = $1`,
          [memberId]
        )
        const balanceBefore = Number(shareBalRes.rows[0]?.total_share_value || 0)
        const balanceAfter = balanceBefore + purchaseValue

        const insRes = await client.query(
          `INSERT INTO senteloans_member_shares (member_id, number_of_shares, share_value, purchase_date) VALUES ($1, $2, $3, $4) RETURNING id`,
          [memberId, numberOfShares, valuePerShare, purchaseDate]
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
             WHERE institution_id = $1 AND member_id = $2
             ORDER BY CASE WHEN account_type = 'Shares' THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [actor.institution_id, memberId]
          )
          fallbackAccountId = accRes.rows[0]?.id || null
          if (!fallbackAccountId) {
            throw new Error("shares_transaction_account_missing")
          }
        }

        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $4, $9, $10, $11, $12, 'Completed')`,
          [
            actor.institution_id,
            memberId,
            fallbackAccountId,
            txNumber,
            txType,
            purchaseValue,
            mode,
            description,
            balanceBefore,
            balanceAfter,
            actor.id,
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
        result.error === "forbidden" || result.error === "no_app_user" || result.error === "missing_permission:edit_shares"
          ? 403
          : result.error === "member_not_found" || result.error === "institution_not_found"
            ? 404
            : result.error === "shares_transaction_account_missing"
              ? 400
            : result.error === "shares_transaction_failed"
              ? 500
              : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.shares.create.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.shares.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
