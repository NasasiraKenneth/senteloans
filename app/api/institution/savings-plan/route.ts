import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { resolveActorContext, hasPermission, isSuperAdmin } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"

function formatDateOnly(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0) {
      const y = value.getUTCFullYear()
      const m = String(value.getUTCMonth() + 1).padStart(2, "0")
      const d = String(value.getUTCDate()).padStart(2, "0")
      return `${y}-${m}-${d}`
    }
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return null
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const res = await client.query(
        `SELECT
           id,
           branch_id,
           auto_savings_day,
           frequency_unit,
           frequency_value,
           use_account_saving_day,
           start_date,
           next_billing_date,
           last_billing_date,
           created_at,
           updated_at
         FROM savings_plan
         WHERE branch_id = $1
         LIMIT 1`,
        [actor.branch_id]
      )

      const row = res.rows[0] || null
      if (row) {
        row.start_date = formatDateOnly(row.start_date)
        row.next_billing_date = formatDateOnly(row.next_billing_date)
        row.last_billing_date = formatDateOnly(row.last_billing_date)
      }

      return { savingsPlan: row }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    apiLog("info", "savings_plan.get.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings_plan.get.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const autoSavingsDay = typeof body.auto_savings_day === "string" ? body.auto_savings_day.trim() || null : null
    const frequencyUnit = typeof body.frequency_unit === "string" ? body.frequency_unit.trim() || "MONTH" : "MONTH"
    const frequencyValue = typeof body.frequency_value !== "undefined" && body.frequency_value !== null ? String(body.frequency_value).trim() || "1" : "1"
    const useAccountSavingDay = body.use_account_saving_day === "true" || body.use_account_saving_day === true ? "true" : "false"
    const startDate = formatDateOnly(body.start_date)
    const nextBillingDate = formatDateOnly(body.next_billing_date)
    const lastBillingDate = formatDateOnly(body.last_billing_date)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const allowed =
        (await hasPermission(client, actor, "edit_institution_settings")) ||
        (await hasPermission(client, actor, "view_savings")) ||
        (await hasPermission(client, actor, "add_account")) ||
        isSuperAdmin(actor)

      if (!allowed) return { error: "missing_permission:edit_institution_settings" as const }

      const upsertRes = await client.query(
        `INSERT INTO savings_plan (
           branch_id,
           auto_savings_day,
           frequency_unit,
           frequency_value,
           use_account_saving_day,
           start_date,
           next_billing_date,
           last_billing_date,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (branch_id) DO UPDATE SET
           auto_savings_day = EXCLUDED.auto_savings_day,
           frequency_unit = EXCLUDED.frequency_unit,
           frequency_value = EXCLUDED.frequency_value,
           use_account_saving_day = EXCLUDED.use_account_saving_day,
           start_date = EXCLUDED.start_date,
           next_billing_date = EXCLUDED.next_billing_date,
           last_billing_date = EXCLUDED.last_billing_date,
           updated_at = NOW()
         RETURNING *`,
        [actor.branch_id, autoSavingsDay, frequencyUnit, frequencyValue, useAccountSavingDay, startDate, nextBillingDate, lastBillingDate]
      )

      const row = upsertRes.rows[0]
      if (row) {
        row.start_date = formatDateOnly(row.start_date)
        row.next_billing_date = formatDateOnly(row.next_billing_date)
        row.last_billing_date = formatDateOnly(row.last_billing_date)
      }

      await auditLogger.logInsert(
        "savings_plan",
        row.id,
        {
          branch_id: actor.branch_id,
          auto_savings_day: autoSavingsDay,
          frequency_unit: frequencyUnit,
          frequency_value: frequencyValue,
          use_account_saving_day: useAccountSavingDay,
          start_date: startDate,
          next_billing_date: nextBillingDate,
          last_billing_date: lastBillingDate,
        },
        actor.institution_id,
        actor.id,
        { branch_id: actor.branch_id },
        client
      )

      return { savingsPlan: row }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    apiLog("info", "savings_plan.put.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings_plan.put.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return PUT(req)
}
