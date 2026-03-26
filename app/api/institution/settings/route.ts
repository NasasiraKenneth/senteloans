import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

const readNumber = (obj: Record<string, unknown>, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return undefined
}

const readBoolean = (obj: Record<string, unknown>, ...keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "boolean") return value
  }
  return undefined
}

const readString = (obj: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim().length > 0) return value
  }
  return undefined
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.settings.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "institution.settings.denied", { method: "GET", apiPath, status: 403, error: "no_app_user", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

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

    if (!inst) {
      apiLog("warn", "institution.settings.not_found", { method: "GET", apiPath, status: 404, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    }
    const settings = (inst.settings as Record<string, unknown>) || {}
    const modules = (settings.modules as Record<string, unknown>) || {}

    const normalized = {
      id: inst.id,
      name: inst.name,
      type: inst.type,
      config: {
        modules: {
          loans: Boolean(readBoolean(modules, "loans") ?? false),
          shares: Boolean(readBoolean(modules, "shares") ?? false),
          savings: Boolean(readBoolean(modules, "savings") ?? false),
          mobile_money: Boolean(readBoolean(modules, "mobile_money", "mobileMoney") ?? false),
        },
        currency: readString(settings, "currency") || "UGX",
        shareValue: readNumber(settings, "share_value", "shareValue"),
        minimumShares: readNumber(settings, "minimum_shares", "minimumShares"),
        maximumShares: readNumber(settings, "maximum_shares", "maximumShares"),
        clientTerminology: readString(settings, "clientTerminology", "client_terminology") || "Member",
        membershipFee: readNumber(settings, "membershipFee", "membership_fee") ?? 0,
        maximumParallelLoans: readNumber(settings, "maximumParallelLoans", "maximum_parallel_loans") ?? 1,
        loanLatePenalty: readNumber(settings, "loanLatePenalty", "loan_late_penalty") ?? 0,
        loanLatePenaltyPeriodDays: readNumber(settings, "loanLatePenaltyPeriodDays", "loan_late_penalty_period_days") ?? 30,
        membershipLatePenalty: readNumber(settings, "membershipLatePenalty", "membership_late_penalty") ?? 0,
        membershipLatePenaltyPeriodDays: readNumber(settings, "membershipLatePenaltyPeriodDays", "membership_late_penalty_period_days") ?? 30,
        autoInvoices: readBoolean(settings, "autoInvoices", "auto_invoices") ?? false,
        invoicePeriodDays: readNumber(settings, "invoicePeriodDays", "invoice_period_days") ?? 30,
        defaultedAfterDays: readNumber(settings, "defaultedAfterDays", "defaulted_after_days") ?? 90,
        monthlyOverdueGraceDays: readNumber(settings, "monthlyOverdueGraceDays", "monthly_overdue_grace_days") ?? 0,
      },
    }
    apiLog("info", "institution.settings.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(normalized)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.settings.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.settings.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "institution.settings.denied", { method: "PUT", apiPath, status: 403, error: "no_app_user", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const body = (await req.json()) as {
      config?: {
        modules?: { loans?: boolean; shares?: boolean; savings?: boolean; mobile_money?: boolean }
        currency?: string
        shareValue?: number
        minimumShares?: number
        maximumShares?: number
        clientTerminology?: string
        membershipFee?: number
        maximumParallelLoans?: number
        loanLatePenalty?: number
        loanLatePenaltyPeriodDays?: number
        membershipLatePenalty?: number
        membershipLatePenaltyPeriodDays?: number
        autoInvoices?: boolean
        invoicePeriodDays?: number
        defaultedAfterDays?: number
        monthlyOverdueGraceDays?: number
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
      if (typeof payload.maximumParallelLoans !== "undefined") settingsUpdate.maximumParallelLoans = Number(payload.maximumParallelLoans)
      if (typeof payload.loanLatePenalty !== "undefined") settingsUpdate.loanLatePenalty = Number(payload.loanLatePenalty)
      if (typeof payload.loanLatePenaltyPeriodDays !== "undefined") settingsUpdate.loanLatePenaltyPeriodDays = Number(payload.loanLatePenaltyPeriodDays)
      if (typeof payload.membershipLatePenalty !== "undefined") settingsUpdate.membershipLatePenalty = Number(payload.membershipLatePenalty)
      if (typeof payload.membershipLatePenaltyPeriodDays !== "undefined") settingsUpdate.membershipLatePenaltyPeriodDays = Number(payload.membershipLatePenaltyPeriodDays)
      if (typeof payload.autoInvoices !== "undefined") settingsUpdate.autoInvoices = Boolean(payload.autoInvoices)
      if (typeof payload.invoicePeriodDays !== "undefined") settingsUpdate.invoicePeriodDays = Number(payload.invoicePeriodDays)
      if (typeof payload.defaultedAfterDays !== "undefined") settingsUpdate.defaultedAfterDays = Number(payload.defaultedAfterDays)
      if (typeof payload.monthlyOverdueGraceDays !== "undefined") settingsUpdate.monthlyOverdueGraceDays = Number(payload.monthlyOverdueGraceDays)

      if (isSaccoOrMfi && modules.shares) {
        const sv = Number(settingsUpdate.share_value)
        if (!sv || Number.isNaN(sv) || sv <= 0)
          throw new Error("share_value_required")
        const min = settingsUpdate.minimum_shares
        const max = settingsUpdate.maximum_shares
        if (typeof min === "number" && typeof max === "number" && min > max)
          throw new Error("min_greater_than_max")
      }

      const loanLatePenaltyPct = Number(settingsUpdate.loanLatePenalty ?? 0)
      if (!Number.isFinite(loanLatePenaltyPct) || loanLatePenaltyPct < 0 || loanLatePenaltyPct > 100) {
        throw new Error("loan_late_penalty_percentage_invalid")
      }
      const maximumParallelLoans = Number(settingsUpdate.maximumParallelLoans ?? 1)
      if (!Number.isFinite(maximumParallelLoans) || !Number.isInteger(maximumParallelLoans) || maximumParallelLoans < 1) {
        throw new Error("maximum_parallel_loans_invalid")
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

    if (!result) {
      apiLog("warn", "institution.settings.not_found", { method: "PUT", apiPath, status: 404, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    }
    const s2 = (result.settings as Record<string, unknown>) || {}
    const m2 = (s2.modules as Record<string, unknown>) || {}
    const response = {
      id: result.id,
      type: result.type,
      config: {
        modules: {
          loans: Boolean(readBoolean(m2, "loans") ?? false),
          shares: Boolean(readBoolean(m2, "shares") ?? false),
          savings: Boolean(readBoolean(m2, "savings") ?? false),
          mobile_money: Boolean(readBoolean(m2, "mobile_money", "mobileMoney") ?? false),
        },
        currency: readString(s2, "currency") || "UGX",
        shareValue: readNumber(s2, "share_value", "shareValue"),
        minimumShares: readNumber(s2, "minimum_shares", "minimumShares"),
        maximumShares: readNumber(s2, "maximum_shares", "maximumShares"),
        clientTerminology: readString(s2, "clientTerminology", "client_terminology") || "Member",
        membershipFee: readNumber(s2, "membershipFee", "membership_fee") ?? 0,
        maximumParallelLoans: readNumber(s2, "maximumParallelLoans", "maximum_parallel_loans") ?? 1,
        loanLatePenalty: readNumber(s2, "loanLatePenalty", "loan_late_penalty") ?? 0,
        loanLatePenaltyPeriodDays: readNumber(s2, "loanLatePenaltyPeriodDays", "loan_late_penalty_period_days") ?? 30,
        membershipLatePenalty: readNumber(s2, "membershipLatePenalty", "membership_late_penalty") ?? 0,
        membershipLatePenaltyPeriodDays: readNumber(s2, "membershipLatePenaltyPeriodDays", "membership_late_penalty_period_days") ?? 30,
        autoInvoices: readBoolean(s2, "autoInvoices", "auto_invoices") ?? false,
        invoicePeriodDays: readNumber(s2, "invoicePeriodDays", "invoice_period_days") ?? 30,
        defaultedAfterDays: readNumber(s2, "defaultedAfterDays", "defaulted_after_days") ?? 90,
        monthlyOverdueGraceDays: readNumber(s2, "monthlyOverdueGraceDays", "monthly_overdue_grace_days") ?? 0,
      },
    }
    apiLog("info", "institution.settings.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(response)
  } catch (e: unknown) {
    const err = e as Error
    if (
      err.message === "share_value_required" ||
      err.message === "min_greater_than_max" ||
      err.message === "loan_late_penalty_percentage_invalid" ||
      err.message === "maximum_parallel_loans_invalid"
    )
      apiLog("warn", "institution.settings.invalid", { method: "PUT", apiPath, status: 400, error: err.message })
    if (
      err.message === "share_value_required" ||
      err.message === "min_greater_than_max" ||
      err.message === "loan_late_penalty_percentage_invalid" ||
      err.message === "maximum_parallel_loans_invalid"
    )
      return NextResponse.json({ error: err.message }, { status: 400 })
    apiLog("error", "institution.settings.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
