import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user" }, { status: 403 })

    const inst = await runWithAuth(session.user.authUserId, async (client) => {
      const res = await client.query(
        `SELECT i.id, i.name, i.type, i.settings
         FROM senteloans_users u
         JOIN senteloans_institutions i ON i.id = u.institution_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      return res.rows[0]
    })

    if (!inst) return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    const settings = (inst.settings as Record<string, unknown>) || {}
    const modules = (settings.modules as Record<string, unknown>) || {}

    const normalized = {
      id: inst.id,
      name: inst.name,
      type: inst.type,
      config: {
        modules: {
          loans: Boolean(modules.loans),
          shares: Boolean(modules.shares),
          savings: Boolean(modules.savings),
          mobile_money: Boolean(modules.mobile_money),
        },
        currency: (settings.currency as string) || "UGX",
        shareValue: typeof settings.share_value === "number" ? settings.share_value : undefined,
        minimumShares: typeof settings.minimum_shares === "number" ? settings.minimum_shares : undefined,
        maximumShares: typeof settings.maximum_shares === "number" ? settings.maximum_shares : undefined,
        clientTerminology: (settings.clientTerminology as string) || "Member",
        membershipFee: typeof settings.membershipFee === "number" ? settings.membershipFee : 0,
      },
    }
    return NextResponse.json(normalized)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user" }, { status: 403 })

    const body = (await req.json()) as {
      config?: {
        modules?: { loans?: boolean; shares?: boolean; savings?: boolean; mobile_money?: boolean }
        currency?: string
        shareValue?: number
        minimumShares?: number
        maximumShares?: number
        clientTerminology?: string
        membershipFee?: number
      }
    }
    const payload = body?.config || {}

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const instRes = await client.query(
        `SELECT i.id, i.type, i.settings FROM senteloans_users u
         JOIN senteloans_institutions i ON i.id = u.institution_id WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const inst = instRes.rows[0]
      if (!inst) return null
      const type = inst.type as string
      const current = (inst.settings as Record<string, unknown>) || {}
      const modules = {
        loans: Boolean(payload.modules?.loans ?? (current.modules as Record<string, unknown>)?.loans ?? true),
        shares: Boolean(payload.modules?.shares ?? (current.modules as Record<string, unknown>)?.shares ?? false),
        savings: Boolean(payload.modules?.savings ?? (current.modules as Record<string, unknown>)?.savings ?? false),
        mobile_money: Boolean(payload.modules?.mobile_money ?? (current.modules as Record<string, unknown>)?.mobile_money ?? true),
      }
      const isSaccoOrMfi = type === "SACCO" || type === "MFI"
      if (!isSaccoOrMfi) {
        modules.shares = false
        modules.savings = false
      }
      const settingsUpdate: Record<string, unknown> = { ...current, modules }
      if (typeof payload.currency === "string") settingsUpdate.currency = payload.currency
      if (typeof payload.clientTerminology === "string" && payload.clientTerminology.trim().length > 0)
        settingsUpdate.clientTerminology = payload.clientTerminology.trim()
      if (typeof payload.shareValue !== "undefined") settingsUpdate.share_value = Number(payload.shareValue)
      if (typeof payload.minimumShares !== "undefined") settingsUpdate.minimum_shares = Number(payload.minimumShares)
      if (typeof payload.maximumShares !== "undefined") settingsUpdate.maximum_shares = Number(payload.maximumShares)
      if (typeof payload.membershipFee !== "undefined") settingsUpdate.membershipFee = Number(payload.membershipFee)

      if (isSaccoOrMfi && modules.shares) {
        const sv = Number(settingsUpdate.share_value)
        if (!sv || Number.isNaN(sv) || sv <= 0)
          throw new Error("share_value_required")
        const min = settingsUpdate.minimum_shares
        const max = settingsUpdate.maximum_shares
        if (typeof min === "number" && typeof max === "number" && min > max)
          throw new Error("min_greater_than_max")
      }

      await client.query(
        `UPDATE senteloans_institutions SET settings = $1 WHERE id = $2`,
        [JSON.stringify(settingsUpdate), inst.id]
      )
      const updated = await client.query(
        `SELECT id, name, type, settings FROM senteloans_institutions WHERE id = $1`,
        [inst.id]
      )
      return updated.rows[0]
    })

    if (!result) return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    const s2 = (result.settings as Record<string, unknown>) || {}
    const m2 = (s2.modules as Record<string, unknown>) || {}
    return NextResponse.json({
      id: result.id,
      type: result.type,
      config: {
        modules: {
          loans: Boolean(m2.loans),
          shares: Boolean(m2.shares),
          savings: Boolean(m2.savings),
          mobile_money: Boolean(m2.mobile_money),
        },
        currency: (s2.currency as string) || "UGX",
        shareValue: typeof s2.share_value === "number" ? s2.share_value : undefined,
        minimumShares: typeof s2.minimum_shares === "number" ? s2.minimum_shares : undefined,
        maximumShares: typeof s2.maximum_shares === "number" ? s2.maximum_shares : undefined,
        clientTerminology: (s2.clientTerminology as string) || "Member",
        membershipFee: typeof s2.membershipFee === "number" ? s2.membershipFee : 0,
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    if (err.message === "share_value_required" || err.message === "min_greater_than_max")
      return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
