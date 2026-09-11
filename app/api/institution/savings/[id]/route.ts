import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice"
import { calculatePreviousBillingDates } from "@/lib/members/savings-calculation"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  dispatchInvoiceStatusSideEffects,
  loadInvoiceStatusSideEffectsContext,
  type InvoiceStatusSideEffectsPostCommit,
} from "@/lib/invoices/invoice-status-side-effects"

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
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function whereScope(actor: ActorContext) {
  const actorRole = String(actor.role || "").trim().toLowerCase()
  if (actorRole === "super_admin") {
    return { clause: "sa.id = $1 AND sa.institution_id = $2", params: [] as unknown[] }
  }
  return { clause: "sa.id = $1 AND sa.institution_id = $2 AND sa.branch_id = $3", params: [actor.branch_id] as unknown[] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id } = await params
    const url = new URL(_req.url)
    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 10)))
    const offset = (page - 1) * pageSize
    const type = String(url.searchParams.get("type") || "").trim()
    const modeRaw = String(url.searchParams.get("mode") || "").trim()
    const modes = modeRaw
      ? modeRaw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : []
    const dateStart = String(url.searchParams.get("dateStart") || "").trim()
    const dateEnd = String(url.searchParams.get("dateEnd") || "").trim()
    if (!id) {
      apiLog("warn", "savings.detail.invalid", { method: "GET", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canView = await hasPermission(client, actor, "view_account")
      if (!canView) return { error: "missing_permission:view_account" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const accRes = await client.query(
        `SELECT
           sa.id,
           sa.member_id,
           sa.branch_id,
           sa.institution_id,
           sa.account_number,
           sa.account_type_id,
           COALESCE(at.account_name, 'Voluntary') AS account_type,
           sa.monthly_savings,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.auto_savings_day,
           sa.start_billing_date,
           sa.next_billing_date,
           sa.last_transaction_date,
           b.name AS branch_name
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         LEFT JOIN branches b ON b.id = sa.branch_id
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const acc = accRes.rows[0]
      if (!acc) return { error: "account_not_found" as const }

      let clientName = ""
      let clientNumber = ""
      if (acc.member_id) {
        const cRes = await client.query(`SELECT id, full_name, member_number FROM members WHERE id = $1`, [acc.member_id])
        clientName = cRes.rows[0]?.full_name || ""
        clientNumber = cRes.rows[0]?.member_number || ""
      }

      const txWhere: string[] = ["account_id = $1"]
      const txParams: unknown[] = [acc.id]
      let txArg = 2

      if (type) {
        txWhere.push(`type::text = $${txArg++}`)
        txParams.push(type)
      }
      if (modes.length > 0) {
        txWhere.push(`mode::text = ANY($${txArg++}::text[])`)
        txParams.push(modes)
      }
      if (dateStart) {
        txWhere.push(`transaction_date::date >= $${txArg++}::date`)
        txParams.push(dateStart)
      }
      if (dateEnd) {
        txWhere.push(`transaction_date::date <= $${txArg++}::date`)
        txParams.push(dateEnd)
      }

      const txWhereClause = txWhere.join(" AND ")

      const txCountRes = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM transactions
         WHERE ${txWhereClause}`,
        txParams
      )
      const txTotal = txCountRes.rows[0]?.total ?? 0

      const txRes = await client.query(
        `SELECT id, type, amount, mode, balance_after, transaction_date, description
         FROM transactions
         WHERE ${txWhereClause}
         ORDER BY transaction_date DESC
         LIMIT $${txArg++} OFFSET $${txArg}`,
        [...txParams, pageSize, offset]
      )

      const txFilterRes = await client.query(
        `SELECT
           ARRAY(SELECT DISTINCT type::text FROM transactions WHERE account_id = $1 ORDER BY 1) AS types,
           ARRAY(SELECT DISTINCT mode::text FROM transactions WHERE account_id = $1 ORDER BY 1) AS modes`,
        [acc.id]
      )

      return {
        account: {
          id: acc.id,
          member_id: acc.member_id,
          branch_id: acc.branch_id,
          branch_name: acc.branch_name || "",
          account_number: acc.account_number,
          account_type_id: acc.account_type_id,
          account_type: acc.account_type,
          monthly_savings: acc.monthly_savings,
          available_balance: acc.available_balance,
          total_balance: acc.total_balance,
          status: acc.status,
          open_date: acc.open_date,
          auto_savings_day: acc.auto_savings_day || null,
          start_date: acc.start_billing_date || null,
          next_billing_date: acc.next_billing_date || null,
          last_transaction_date: acc.last_transaction_date,
          client_name: clientName,
          client_number: clientNumber,
        },
        transactions: txRes.rows.map((t: Record<string, unknown>) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          mode: t.mode,
          description: t.description,
          balance: t.balance_after,
          date: t.transaction_date,
        })),
        transactionPagination: {
          total: txTotal,
          page,
          pageSize,
        },
        transactionFilters: {
          types: Array.isArray(txFilterRes.rows[0]?.types) ? txFilterRes.rows[0].types : [],
          modes: Array.isArray(txFilterRes.rows[0]?.modes) ? txFilterRes.rows[0].modes : [],
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "account_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: statusCode, error: errorCode, accountId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "savings.detail.success", { method: "GET", apiPath, status: 200, accountId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized", accountId: id })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: 403, error: "no_app_user_profile", accountId: id })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = (await req.json()) as {
      status?: string
      account_type?: string
      account_type_id?: string
      auto_savings_day?: string | null
      start_date?: string | null
      next_billing_date?: string | null
    }
    const status = body.status
    const accountTypeInput = body.account_type != null ? String(body.account_type).trim() : undefined
    const accountTypeIdInput = body.account_type_id != null ? String(body.account_type_id).trim() : undefined
    const autoSavingsDay = typeof body.auto_savings_day === "string" ? body.auto_savings_day.trim() || null : body.auto_savings_day === null ? null : undefined
    const startDate = typeof body.start_date === "string" && body.start_date.trim() ? body.start_date.trim().slice(0, 10) : body.start_date === null ? null : undefined
    const nextBillingDate = typeof body.next_billing_date === "string" && body.next_billing_date.trim() ? body.next_billing_date.trim().slice(0, 10) : body.next_billing_date === null ? null : undefined

    const updates: Record<string, unknown> = {}
    if (typeof status !== "undefined") {
      const allowed = ["Active", "Inactive", "Suspended", "Closed"]
      if (!allowed.includes(String(status))) {
        apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "invalid_status", accountId: id })
        return NextResponse.json({ error: "invalid_status" }, { status: 400 })
      }
      updates.status = status
    }
    if (typeof accountTypeInput !== "undefined" || typeof accountTypeIdInput !== "undefined") {
      updates.account_type = accountTypeInput || accountTypeIdInput
    }
    if (typeof autoSavingsDay !== "undefined") updates.auto_savings_day = autoSavingsDay
    if (typeof startDate !== "undefined") updates.start_billing_date = startDate
    if (typeof nextBillingDate !== "undefined") updates.next_billing_date = nextBillingDate

    if (Object.keys(updates).length === 0) {
      apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "no_changes", accountId: id })
      return NextResponse.json({ error: "no_changes" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canView = await hasPermission(client, actor, "view_account")
      if (!canView) return { error: "missing_permission:view_account" as const }
      const canMutate = await hasPermission(client, actor, "edit_account")
      if (!canMutate) return { error: "missing_permission:edit_account" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const curRes = await client.query(
        `SELECT sa.id, sa.branch_id, sa.member_id, sa.account_number, sa.monthly_savings, sa.status, sa.account_type_id, at.account_name AS account_type, sa.auto_savings_day, sa.start_billing_date, sa.next_billing_date, sa.is_configured
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const current = curRes.rows[0]
      if (!current) return { error: "account_not_found" as const }
      if (current.status === "Closed" && status === "Active") {
        return { error: "invalid_transition_closed_to_active" as const }
      }

      const wasUnconfigured = String(current.is_configured || "").toLowerCase() === "no"

      let newAccountTypeId = current.account_type_id
      let newAccountTypeName = current.account_type

      if (accountTypeIdInput) {
        const atRes = await client.query(
          `SELECT id, account_name FROM account_type WHERE id = $1 AND branch_id = $2 LIMIT 1`,
          [accountTypeIdInput, current.branch_id]
        )
        if (atRes.rows[0]) {
          newAccountTypeId = atRes.rows[0].id
          newAccountTypeName = atRes.rows[0].account_name
        }
      } else if (accountTypeInput) {
        const atRes = await client.query(
          `SELECT id, account_name FROM account_type WHERE branch_id = $1 AND (account_name ILIKE $2 OR id::text = $2) LIMIT 1`,
          [current.branch_id, accountTypeInput]
        )
        if (atRes.rows[0]) {
          newAccountTypeId = atRes.rows[0].id
          newAccountTypeName = atRes.rows[0].account_name
        } else {
          const insRes = await client.query(
            `INSERT INTO account_type (institution_id, branch_id, account_name, status)
             VALUES ($1, $2, $3, 'Active')
             ON CONFLICT (branch_id, account_name) DO UPDATE SET status = 'Active'
             RETURNING id, account_name`,
            [actor.institution_id, current.branch_id, accountTypeInput]
          )
          newAccountTypeId = insRes.rows[0]?.id
          newAccountTypeName = insRes.rows[0]?.account_name || accountTypeInput
        }
      }

      await client.query(
        `UPDATE savings_accounts
         SET status = COALESCE($1, status),
             account_type_id = COALESCE($2, account_type_id),
             auto_savings_day = CASE WHEN $4::boolean THEN $5 ELSE auto_savings_day END,
             start_billing_date = CASE WHEN $6::boolean THEN $7 ELSE start_billing_date END,
             next_billing_date = CASE WHEN $8::boolean THEN $9 ELSE next_billing_date END,
             is_configured = 'yes',
             updated_at = NOW()
         WHERE id = $3`,
        [
          typeof status === "undefined" ? null : status,
          newAccountTypeId,
          id,
          typeof autoSavingsDay !== "undefined",
          autoSavingsDay ?? null,
          typeof startDate !== "undefined",
          startDate ?? null,
          typeof nextBillingDate !== "undefined",
          nextBillingDate ?? null,
        ]
      )

      let statusSideEffectsPostCommit: InvoiceStatusSideEffectsPostCommit | null = null

      if (wasUnconfigured) {
        const cfgRes = await client.query(
          `SELECT new_member_bill_prev_months, financial_year_start, invoice_overdue_period
           FROM config WHERE branch_id = $1 LIMIT 1`,
          [current.branch_id]
        )
        const cfg = cfgRes.rows[0] || {}
        const isBillPrev = cfg.new_member_bill_prev_months === "true" || cfg.new_member_bill_prev_months === true
        const monthlySav = Number(current.monthly_savings || 0)

        if (isBillPrev && monthlySav > 0) {
          const spRes = await client.query(
            `SELECT frequency_unit, frequency_value FROM savings_plan WHERE branch_id = $1 LIMIT 1`,
            [current.branch_id]
          )
          const sp = spRes.rows[0] || {}

          const effectiveAutoSavingsDay = typeof autoSavingsDay !== "undefined" ? autoSavingsDay : current.auto_savings_day
          const effectiveStartDate = typeof startDate !== "undefined" ? startDate : current.start_billing_date
          const effectiveNextBillingDate = typeof nextBillingDate !== "undefined" ? nextBillingDate : current.next_billing_date

          const prevDates = calculatePreviousBillingDates({
            financialYearStart: cfg.financial_year_start,
            startDate: effectiveStartDate,
            nextBillingDate: effectiveNextBillingDate,
            frequencyUnit: sp.frequency_unit,
            frequencyValue: sp.frequency_value,
            autoSavingsDay: effectiveAutoSavingsDay,
            currentDate: new Date().toISOString().slice(0, 10),
          })

          if (prevDates.length > 0) {
            const invoiceDueDays = Number(cfg.invoice_overdue_period || 30)
            const nowStr = new Date().toISOString().slice(0, 10)
            const due = new Date(`${nowStr}T00:00:00Z`)
            due.setUTCDate(due.getUTCDate() + Math.max(1, invoiceDueDays))
            const invoiceDue = due.toISOString().slice(0, 10)

            const savingsItems = prevDates.map((dStr) => ({
              unit: "Savings",
              description: `${dStr} ${current.account_number} Savings`,
              quantity: 1,
              unit_price: monthlySav,
              total_price: monthlySav,
            }))

            const createdInvoice = await createInvoiceWithItems(client, {
              institutionId: actor.institution_id,
              branchId: current.branch_id,
              createdBy: actor.id,
              invoiceDate: nowStr,
              invoiceDue,
              invoiceType: "Auto",
              status: "sent",
              items: savingsItems,
              target: { member_id: current.member_id },
            })

            const ctx = await loadInvoiceStatusSideEffectsContext(client, {
              actorId: actor.id,
              institutionId: actor.institution_id,
              branchId: current.branch_id,
              invoiceId: createdInvoice.id,
              invoiceNumber: createdInvoice.invoice_number,
              totalAmount: createdInvoice.total_amount,
              invoiceDue: createdInvoice.invoice_due,
              memberId: current.member_id,
              thirdPartyAgentId: null,
            })
            if (ctx) {
              statusSideEffectsPostCommit = { kind: "sent", ctx }
            }
          }
        }
      }

      await auditLogger.logUpdate(
        "savings_accounts",
        id,
        {
          status: current.status,
          account_type_id: current.account_type_id,
          account_type: current.account_type,
          auto_savings_day: current.auto_savings_day,
          start_billing_date: current.start_billing_date,
          next_billing_date: current.next_billing_date,
          is_configured: current.is_configured,
        },
        {
          status: status || current.status,
          account_type_id: newAccountTypeId,
          account_type: newAccountTypeName,
          auto_savings_day: autoSavingsDay ?? current.auto_savings_day,
          start_billing_date: startDate ?? current.start_billing_date,
          next_billing_date: nextBillingDate ?? current.next_billing_date,
          is_configured: "yes",
        },
        actor.institution_id,
        actor.id,
        { branch_id: current.branch_id },
        client
      )
      const accRes = await client.query(
        `SELECT
           sa.id,
           sa.member_id,
           sa.institution_id,
           sa.branch_id,
           sa.account_number,
           sa.account_type_id,
           COALESCE(at.account_name, 'Voluntary') AS account_type,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.is_configured,
           sa.auto_savings_day,
           sa.start_billing_date,
           sa.next_billing_date,
           sa.last_transaction_date
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         WHERE sa.id = $1`,
        [id]
      )
      return { ok: true, account: accRes.rows[0], statusSideEffectsPostCommit }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "account_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "invalid_transition_closed_to_active" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: statusCode, error: errorCode, accountId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }

    if (result?.statusSideEffectsPostCommit) {
      try {
        const sideEffects = await dispatchInvoiceStatusSideEffects(
          result.statusSideEffectsPostCommit.kind,
          result.statusSideEffectsPostCommit.ctx
        )
        apiLog(
          sideEffects.email?.errors?.length ? "warn" : "info",
          sideEffects.email?.errors?.length
            ? "savings.update.invoice_email_enqueue_partial"
            : "savings.update.invoice_email_enqueued",
          {
            method: "PUT",
            apiPath,
            status: 200,
            accountId: id,
            invoiceId: result.statusSideEffectsPostCommit.ctx.invoice.id,
            enqueued: sideEffects.email?.enqueued || [],
            skipped: sideEffects.email?.skipped || [],
            errors: sideEffects.email?.errors || [],
          }
        )
      } catch (sideEffectErr) {
        apiLog("error", "savings.update.invoice_side_effects_failed", {
          method: "PUT",
          apiPath,
          status: 200,
          accountId: id,
          error: (sideEffectErr as Error)?.message || "side_effects_failed",
        })
      }
    }

    apiLog("info", "savings.update.success", { method: "PUT", apiPath, status: 200, accountId: id })
    const { statusSideEffectsPostCommit: _, ...responsePayload } = result
    return NextResponse.json(responsePayload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
