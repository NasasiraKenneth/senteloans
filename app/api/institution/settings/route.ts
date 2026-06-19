import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { DEFAULT_CURRENCY_IN_WORDS } from "@/lib/invoices/utils"

const readNumber = (obj: Record<string, unknown>, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
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

const toFlag = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v
  const s = String(v ?? "").trim().toLowerCase()
  if (s === "true") return true
  if (s === "false") return false
  return fallback
}

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
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false
  const permRes = await client.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
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
      const profileRes = await client.query(
        `SELECT u.id AS user_id, u.branch_id, i.id, i.name, i.type, i.logo
         FROM users u
         JOIN institutions i ON i.id = u.institution_id
         WHERE u.auth_id = $1
         LIMIT 1`,
        [session!.user!.authUserId],
      )
      const profile = profileRes.rows[0]
      if (!profile) return null
      if (!profile.branch_id) return { error: "actor_branch_missing" as const }

      const cfgRes = await client.query(
        `SELECT *
         FROM config
         WHERE branch_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [profile.branch_id],
      )
      const cfg = cfgRes.rows[0] || null
      return { ...profile, cfg }
    })

    if (!inst) {
      apiLog("warn", "institution.settings.not_found", { method: "GET", apiPath, status: 404, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    }
    if ("error" in inst) {
      return NextResponse.json({ error: inst.error }, { status: 400 })
    }
    const cfg = (inst.cfg as Record<string, unknown>) || {}

    const normalized = {
      id: inst.id,
      name: inst.name,
      type: inst.type,
      logo: inst.logo || null,
      config: {
        modules: {
          loans: toFlag(cfg.loans, false),
          shares: toFlag(cfg.shares, false),
          savings: toFlag(cfg.savings, false),
          mobile_money: toFlag(cfg.mobile_money, false),
        },
        currency: readString(cfg, "currency") || "UGX",
        currencyInWords: readString(cfg, "currency_inwords") || "Ugandan shillings only",
        shareValue: readNumber(cfg, "share_value") ?? 0,
        minimumShares: readNumber(cfg, "minimum_shares") ?? 0,
        maximumShares: readNumber(cfg, "maximum_shares"),
        membershipFee: readNumber(cfg, "membership_fee") ?? 0,
        maximumParallelLoans: readNumber(cfg, "maximum_parallel_loans") ?? 1,
        loanLatePenalty: readNumber(cfg, "loan_overdue_interest") ?? 0,
        loanLatePenaltyPeriodDays: readNumber(cfg, "loan_overdue_period") ?? 30,
        membershipLatePenalty: readNumber(cfg, "membership_overdue_interest") ?? 0,
        membershipLatePenaltyPeriodDays: readNumber(cfg, "membership_overdue_period") ?? 30,
        membershipLatePenaltyPeriodUnit: readString(cfg, "membership_overdue_interest_per") || "day",
        loanLatePenaltyPeriodUnit: readString(cfg, "loan_overdue_interest_per") || "day",
        autoInvoices: toFlag(cfg.auto_invoices, false),
        invoicePeriodDays: readNumber(cfg, "invoice_overdue_period") ?? 30,
        defaultedAfterDays: readNumber(cfg, "loan_default_period") ?? 90,
        savingsOverduePeriod: readNumber(cfg, "savings_overdue_period") ?? 30,
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
        currencyInWords?: string
        shareValue?: number
        minimumShares?: number
        maximumShares?: number
        membershipFee?: number
        maximumParallelLoans?: number
        loanLatePenalty?: number
        loanLatePenaltyPeriodDays?: number
        membershipLatePenalty?: number
        membershipLatePenaltyPeriodDays?: number
        membershipLatePenaltyPeriodUnit?: string
        loanLatePenaltyPeriodUnit?: string
        autoInvoices?: boolean
        invoicePeriodDays?: number
        defaultedAfterDays?: number
        savingsOverduePeriod?: number
      }
    }
    const payload = body?.config || {}

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return null
      const canEdit = await Promise.all([
        hasPermission(client, actor, "edit_loan_policies"),
        hasPermission(client, actor, "edit_membership_policies"),
        hasPermission(client, actor, "edit_invoice_policies"),
        hasPermission(client, actor, "edit_share_policies"),
        hasPermission(client, actor, "edit_branch_financial_info"),
      ])
      if (!canEdit.some(Boolean)) return { error: "missing_permission:edit_institution_settings" as const }

      const profileRes = await client.query(
        `SELECT u.id AS user_id, u.branch_id, i.id AS institution_id, i.type
         FROM users u
         JOIN institutions i ON i.id = u.institution_id
         WHERE u.auth_id = $1
         LIMIT 1`,
        [session!.user!.authUserId],
      )
      const profile = profileRes.rows[0]
      if (!profile) return null
      if (!profile.branch_id) return { error: "actor_branch_missing" as const }

      const cfgRes = await client.query(
        `SELECT * FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [profile.branch_id],
      )
      const current = (cfgRes.rows[0] as Record<string, unknown> | undefined) || {}

      const loans = String(payload.modules?.loans ?? toFlag(current.loans, true))
      const shares = String(payload.modules?.shares ?? toFlag(current.shares, false))
      const savings = String(payload.modules?.savings ?? toFlag(current.savings, false))
      const mobileMoney = String(payload.modules?.mobile_money ?? toFlag(current.mobile_money, true))
      const autoInvoices = String(payload.autoInvoices ?? toFlag(current.auto_invoices, false))

      const isSaccoOrMfi = profile.type === "SACCO" || profile.type === "MFI"
      const enforcedShares = isSaccoOrMfi ? shares : "false"
      const enforcedSavings = isSaccoOrMfi ? savings : "false"

      const shareValue = Number(payload.shareValue ?? current.share_value ?? 0)
      const minimumShares = Number(payload.minimumShares ?? current.minimum_shares ?? 0)
      const maximumShares =
        payload.maximumShares === undefined && current.maximum_shares === undefined
          ? null
          : Number(payload.maximumShares ?? current.maximum_shares)
      const membershipFee = Number(payload.membershipFee ?? current.membership_fee ?? 0)
      const maximumParallelLoans = Number(payload.maximumParallelLoans ?? current.maximum_parallel_loans ?? 1)
      const loanOverduePeriod = Number(payload.loanLatePenaltyPeriodDays ?? current.loan_overdue_period ?? 30)
      const loanOverdueInterest = Number(payload.loanLatePenalty ?? current.loan_overdue_interest ?? 0)
      const loanOverdueInterestPer = String(payload.loanLatePenaltyPeriodUnit ?? current.loan_overdue_interest_per ?? "day")
      const loanDefaultPeriod = Number(payload.defaultedAfterDays ?? current.loan_default_period ?? 90)
      const invoiceOverduePeriod = Number(payload.invoicePeriodDays ?? current.invoice_overdue_period ?? 30)
      const savingsOverduePeriod = Number(payload.savingsOverduePeriod ?? current.savings_overdue_period ?? 30)
      const membershipOverduePeriod = Number(payload.membershipLatePenaltyPeriodDays ?? current.membership_overdue_period ?? 30)
      const membershipOverdueInterest = Number(payload.membershipLatePenalty ?? current.membership_overdue_interest ?? 0)
      const membershipOverdueInterestPer = String(payload.membershipLatePenaltyPeriodUnit ?? current.membership_overdue_interest_per ?? "day")

      if (enforcedShares === "true") {
        if (!shareValue || Number.isNaN(shareValue) || shareValue <= 0) throw new Error("share_value_required")
        if (minimumShares < 0) throw new Error("minimum_shares_invalid")
        if (typeof maximumShares === "number" && !Number.isNaN(maximumShares) && minimumShares > maximumShares) {
          throw new Error("min_greater_than_max")
        }
      }
      if (!Number.isFinite(maximumParallelLoans) || !Number.isInteger(maximumParallelLoans) || maximumParallelLoans < 1) {
        throw new Error("maximum_parallel_loans_invalid")
      }
      if (!Number.isFinite(loanOverdueInterest) || loanOverdueInterest < 0 || loanOverdueInterest > 100) {
        throw new Error("loan_late_penalty_percentage_invalid")
      }
      if (!Number.isFinite(loanOverduePeriod) || loanOverduePeriod < 1) throw new Error("loan_late_penalty_period_invalid")
      if (!Number.isFinite(membershipOverduePeriod) || membershipOverduePeriod < 1) throw new Error("membership_late_penalty_period_invalid")
      if (!Number.isFinite(savingsOverduePeriod) || savingsOverduePeriod < 1) throw new Error("savings_overdue_period_invalid")

      const currencyInWords =
        payload.currencyInWords !== undefined
          ? String(payload.currencyInWords).trim()
          : readString(current, "currency_inwords") || DEFAULT_CURRENCY_IN_WORDS
      if (!currencyInWords || currencyInWords.length > 250) {
        throw new Error("currency_inwords_invalid")
      }

      const params = [
        profile.branch_id,
        loans,
        enforcedShares,
        enforcedSavings,
        mobileMoney,
        autoInvoices,
        String(payload.currency || current.currency || "UGX"),
        currencyInWords.slice(0, 250),
        membershipFee,
        shareValue,
        minimumShares,
        maximumShares,
        maximumParallelLoans,
        loanOverduePeriod,
        loanOverdueInterest,
        loanOverdueInterestPer,
        loanDefaultPeriod,
        invoiceOverduePeriod,
        savingsOverduePeriod,
        membershipOverduePeriod,
        membershipOverdueInterest,
        membershipOverdueInterestPer,
        profile.user_id,
      ]

      await client.query(
        `INSERT INTO config (
           branch_id, loans, shares, savings, mobile_money, auto_invoices, currency, currency_inwords,
           membership_fee, share_value, minimum_shares, maximum_shares, maximum_parallel_loans,
           loan_overdue_period, loan_overdue_interest, loan_overdue_interest_per,
           loan_default_period, invoice_overdue_period, savings_overdue_period,
           membership_overdue_period, membership_overdue_interest, membership_overdue_interest_per,
           modified_by, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,
           $9,$10,$11,$12,$13,
           $14,$15,$16,
           $17,$18,$19,
           $20,$21,$22,
           $23,NOW()
         )
         ON CONFLICT (branch_id) DO UPDATE SET
           loans = EXCLUDED.loans,
           shares = EXCLUDED.shares,
           savings = EXCLUDED.savings,
           mobile_money = EXCLUDED.mobile_money,
           auto_invoices = EXCLUDED.auto_invoices,
           currency = EXCLUDED.currency,
           currency_inwords = EXCLUDED.currency_inwords,
           membership_fee = EXCLUDED.membership_fee,
           share_value = EXCLUDED.share_value,
           minimum_shares = EXCLUDED.minimum_shares,
           maximum_shares = EXCLUDED.maximum_shares,
           maximum_parallel_loans = EXCLUDED.maximum_parallel_loans,
           loan_overdue_period = EXCLUDED.loan_overdue_period,
           loan_overdue_interest = EXCLUDED.loan_overdue_interest,
           loan_overdue_interest_per = EXCLUDED.loan_overdue_interest_per,
           loan_default_period = EXCLUDED.loan_default_period,
           invoice_overdue_period = EXCLUDED.invoice_overdue_period,
           savings_overdue_period = EXCLUDED.savings_overdue_period,
           membership_overdue_period = EXCLUDED.membership_overdue_period,
           membership_overdue_interest = EXCLUDED.membership_overdue_interest,
           membership_overdue_interest_per = EXCLUDED.membership_overdue_interest_per,
           modified_by = EXCLUDED.modified_by,
           updated_at = NOW()`,
        params,
      )

      const cfgOut = await client.query(
        `SELECT c.*, i.id AS institution_id, i.type
         FROM config c
         JOIN branches b ON b.id = c.branch_id
         JOIN institutions i ON i.id = b.institution_id
         WHERE c.branch_id = $1
         LIMIT 1`,
        [profile.branch_id],
      )
      return cfgOut.rows[0]
    })

    if (!result) {
      apiLog("warn", "institution.settings.not_found", { method: "PUT", apiPath, status: 404, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "institution_not_found" }, { status: 404 })
    }
    if (result && "error" in result) {
      const status = result.error === "missing_permission:edit_institution_settings" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    const s2 = result as Record<string, unknown>
    const response = {
      id: result.institution_id,
      type: result.type,
      config: {
        modules: {
          loans: toFlag(s2.loans, false),
          shares: toFlag(s2.shares, false),
          savings: toFlag(s2.savings, false),
          mobile_money: toFlag(s2.mobile_money, false),
        },
        currency: readString(s2, "currency") || "UGX",
        currencyInWords: readString(s2, "currency_inwords") || "Ugandan shillings only",
        shareValue: readNumber(s2, "share_value") ?? 0,
        minimumShares: readNumber(s2, "minimum_shares") ?? 0,
        maximumShares: readNumber(s2, "maximum_shares"),
        membershipFee: readNumber(s2, "membership_fee") ?? 0,
        maximumParallelLoans: readNumber(s2, "maximum_parallel_loans") ?? 1,
        loanLatePenalty: readNumber(s2, "loan_overdue_interest") ?? 0,
        loanLatePenaltyPeriodDays: readNumber(s2, "loan_overdue_period") ?? 30,
        membershipLatePenalty: readNumber(s2, "membership_overdue_interest") ?? 0,
        membershipLatePenaltyPeriodDays: readNumber(s2, "membership_overdue_period") ?? 30,
        membershipLatePenaltyPeriodUnit: readString(s2, "membership_overdue_interest_per") || "day",
        loanLatePenaltyPeriodUnit: readString(s2, "loan_overdue_interest_per") || "day",
        autoInvoices: toFlag(s2.auto_invoices, false),
        invoicePeriodDays: readNumber(s2, "invoice_overdue_period") ?? 30,
        defaultedAfterDays: readNumber(s2, "loan_default_period") ?? 90,
        savingsOverduePeriod: readNumber(s2, "savings_overdue_period") ?? 30,
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
      err.message === "maximum_parallel_loans_invalid" ||
      err.message === "loan_late_penalty_period_invalid" ||
      err.message === "membership_late_penalty_period_invalid" ||
      err.message === "savings_overdue_period_invalid" ||
      err.message === "currency_inwords_invalid"
    )
      apiLog("warn", "institution.settings.invalid", { method: "PUT", apiPath, status: 400, error: err.message })
    if (
      err.message === "share_value_required" ||
      err.message === "min_greater_than_max" ||
      err.message === "loan_late_penalty_percentage_invalid" ||
      err.message === "maximum_parallel_loans_invalid" ||
      err.message === "loan_late_penalty_period_invalid" ||
      err.message === "membership_late_penalty_period_invalid" ||
      err.message === "savings_overdue_period_invalid" ||
      err.message === "currency_inwords_invalid"
    )
      return NextResponse.json({ error: err.message }, { status: 400 })
    apiLog("error", "institution.settings.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
