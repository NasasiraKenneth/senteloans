import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import {
  assertNotSuperAdmin,
} from "@/lib/api/rbac"
import { assertMemberActive } from "@/lib/members/member-status"
import { parseMonthlySavingsInput } from "@/lib/members/monthly-savings"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

const mapSavingsDuplicateError = (err: unknown): "duplicate_savings_account_number" | null => {
  const e = err as { code?: string; constraint?: string; detail?: string; message?: string }
  if (String(e?.code || "") !== "23505") return null
  const constraint = String(e?.constraint || "")
  const detail = String(e?.detail || e?.message || "")
  if (constraint === "uk_accounts_number" || /account_number/.test(detail)) {
    return "duplicate_savings_account_number"
  }
  return null
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

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    let pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const status = (url.searchParams.get("status") || "").trim()
    const accountType = (url.searchParams.get("account_type") || "").trim()
    const accountTypeId = (url.searchParams.get("account_type_id") || "").trim()
    const accountTypes = accountType ? accountType.split(",").map((v) => v.trim()).filter(Boolean) : []
    const search = (url.searchParams.get("search") || "").trim()
    const memberId = (url.searchParams.get("member_id") || url.searchParams.get("client_id") || "").trim()
    const openDateStart = (url.searchParams.get("open_dateStart") || "").trim()
    const openDateEnd = (url.searchParams.get("open_dateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const limit = url.searchParams.get("limit") || ""
    if (limit) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200)
      pageSize = n
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_savings")
      if (!allowed) return { error: "missing_permission:view_savings" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "sa.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (actorRole !== "super_admin") {
        where += ` AND sa.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      } else if (selectedBranchIds.length > 0) {
        where += ` AND sa.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }

      if (status) {
        where += ` AND sa.status = $${idx++}`
        params.push(status)
      }
      if (accountTypeId) {
        where += ` AND sa.account_type_id = $${idx++}`
        params.push(accountTypeId)
      } else if (accountTypes.length === 1) {
        where += ` AND (at.account_name ILIKE $${idx} OR sa.account_type_id::text = $${idx})`
        params.push(accountTypes[0])
        idx++
      } else if (accountTypes.length > 1) {
        where += ` AND (at.account_name = ANY($${idx}::text[]) OR sa.account_type_id::text = ANY($${idx}::text[]))`
        params.push(accountTypes)
        idx++
      }
      if (memberId) {
        where += ` AND sa.member_id = $${idx++}`
        params.push(memberId)
      }
      if (search) {
        where += ` AND (sa.account_number ILIKE $${idx} OR m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (openDateStart) {
        where += ` AND sa.open_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateStart)
        idx++
      }
      if (openDateEnd) {
        where += ` AND sa.open_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateEnd)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         LEFT JOIN members m ON m.id = sa.member_id
         WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const statsRes = await client.query(
        `SELECT
           COALESCE(SUM(sa.total_balance), 0)::numeric AS total_savings,
           COALESCE(AVG(sa.total_balance), 0)::numeric AS average_balance,
           COUNT(*) FILTER (WHERE sa.status = 'Active')::int AS active_accounts
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         LEFT JOIN members m ON m.id = sa.member_id
         WHERE ${where}`,
        params
      )
      const statsRow = statsRes.rows[0] || {}

      const from = (page - 1) * pageSize
      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT
           sa.id,
           sa.member_id,
           sa.branch_id,
           sa.account_number,
           sa.account_type_id,
           COALESCE(at.account_name, 'Voluntary') AS account_type,
           sa.monthly_savings,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.last_transaction_date,
           m.full_name AS member_name,
           m.member_number AS member_number,
           b.name AS branch_name
         FROM savings_accounts sa
         LEFT JOIN account_type at ON at.id = sa.account_type_id
         LEFT JOIN members m ON m.id = sa.member_id
         LEFT JOIN branches b ON b.id = sa.branch_id
         WHERE ${where}
         ORDER BY sa.open_date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const accountIds = data.map((r: { id: string }) => r.id)
      let recentTx: Array<Record<string, unknown>> = []
      if (accountIds.length > 0) {
        const txRes = await client.query(
          `SELECT id, type, amount, mode, balance_after, transaction_date, account_id, member_id
           FROM transactions
           WHERE account_id = ANY($1::uuid[])
           ORDER BY transaction_date DESC
           LIMIT 5`,
          [accountIds]
        )
        recentTx = txRes.rows
      }

      const memberIdsFromTx = [...new Set(recentTx.map((t: Record<string, unknown>) => t.member_id).filter(Boolean))]
      let memberMap: Record<string, string> = {}
      if (memberIdsFromTx.length > 0) {
        const mRes = await client.query(`SELECT id, full_name FROM members WHERE id = ANY($1::uuid[])`, [memberIdsFromTx])
        memberMap = Object.fromEntries(mRes.rows.map((m: { id: string; full_name: string }) => [m.id, m.full_name]))
      }

      const accountIdsFromTx = [...new Set(recentTx.map((t: Record<string, unknown>) => t.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIdsFromTx.length > 0) {
        const accRes = await client.query(`SELECT id, account_number FROM savings_accounts WHERE id = ANY($1::uuid[])`, [accountIdsFromTx])
        accountMap = Object.fromEntries(accRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        member_id: row.member_id,
        branch_id: row.branch_id,
        branch_name: row.branch_name || "",
        account_number: row.account_number,
        account_type_id: row.account_type_id,
        account_type: row.account_type || "Voluntary",
        monthly_savings: row.monthly_savings,
        available_balance: row.available_balance,
        total_balance: row.total_balance,
        status: row.status,
        open_date: row.open_date,
        client_name: row.member_name || "",
        client_number: row.member_number || "",
      }))

      const recent = recentTx.map((t: Record<string, unknown>) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        mode: t.mode,
        balance: t.balance_after,
        date: t.transaction_date,
        memberName: memberMap[t.member_id as string] || "",
        accountNumber: accountMap[t.account_id as string] || "",
      }))

      return {
        items,
        total,
        recentTransactions: recent,
        page,
        pageSize,
        stats: {
          totalSavings: Number(statsRow.total_savings || 0),
          averageBalance: Number(statsRow.average_balance || 0),
          activeAccounts: Number(statsRow.active_accounts || 0),
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "savings.list.denied", { method: "GET", apiPath, status: statusCode, error: errorCode })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "savings.list.success", {
      method: "GET",
      apiPath,
      status: 200,
      count: Array.isArray(result?.items) ? result.items.length : 0,
      total: Number(result?.total || 0),
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = (await req.json()) as {
      member_id?: string
      account_type?: string
      account_type_id?: string
      monthly_savings?: unknown
      monthlySavings?: unknown
      auto_savings_day?: string | null
      start_date?: string | null
      next_billing_date?: string | null
    }
    const memberId = String(body.member_id || "").trim()
    const accountTypeInput = String(body.account_type || body.account_type_id || "").trim()
    const accountTypeIdInput = String(body.account_type_id || "").trim()
    const autoSavingsDay = typeof body.auto_savings_day === "string" ? body.auto_savings_day.trim() || null : null
    const startDate = typeof body.start_date === "string" && body.start_date.trim() ? body.start_date.trim().slice(0, 10) : null
    const nextBillingDate = typeof body.next_billing_date === "string" && body.next_billing_date.trim() ? body.next_billing_date.trim().slice(0, 10) : null

    if (!memberId) {
      apiLog("warn", "savings.create.invalid", { method: "POST", apiPath, status: 400, error: "member_id_required" })
      return NextResponse.json({ error: "member_id_required" }, { status: 400 })
    }
    if (!accountTypeInput) {
      apiLog("warn", "savings.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_account_type" })
      return NextResponse.json({ error: "invalid_account_type" }, { status: 400 })
    }

    let monthlySavings: number | null = null
    const isFixed = accountTypeInput.toLowerCase().includes("fixed")
    if (isFixed) {
      const parsed = parseMonthlySavingsInput(body.monthly_savings ?? body.monthlySavings, "Fixed")
      if (parsed.error) {
        apiLog("warn", "savings.create.invalid", { method: "POST", apiPath, status: 400, error: parsed.error })
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      monthlySavings = parsed.value
    } else if (body.monthly_savings || body.monthlySavings) {
      const parsed = parseMonthlySavingsInput(body.monthly_savings ?? body.monthlySavings, "Voluntary")
      if (!parsed.error) {
        monthlySavings = parsed.value
      }
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "add_account")
      if (!allowed) return { error: "missing_permission:add_account" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const memberCheck = await assertMemberActive(client, memberId, actor.institution_id)
      if (!memberCheck.ok) {
        return {
          error: memberCheck.error,
          memberStatus: memberCheck.error === "member_inactive" ? memberCheck.status : undefined,
        }
      }
      const member = memberCheck.member
      if (member.branch_id !== actor.branch_id) return { error: "cross_branch_operation_forbidden" as const }

      // Resolve account_type_id
      let resolvedAccountTypeId: string | null = null
      let resolvedAccountTypeName = "Voluntary"

      if (accountTypeIdInput) {
        const atRes = await client.query(
          `SELECT id, account_name FROM account_type WHERE id = $1 AND branch_id = $2 LIMIT 1`,
          [accountTypeIdInput, member.branch_id]
        )
        if (atRes.rows[0]) {
          resolvedAccountTypeId = atRes.rows[0].id
          resolvedAccountTypeName = atRes.rows[0].account_name
        }
      }

      if (!resolvedAccountTypeId && accountTypeInput) {
        const atRes = await client.query(
          `SELECT id, account_name FROM account_type WHERE branch_id = $1 AND (account_name ILIKE $2 OR id::text = $2) LIMIT 1`,
          [member.branch_id, accountTypeInput]
        )
        if (atRes.rows[0]) {
          resolvedAccountTypeId = atRes.rows[0].id
          resolvedAccountTypeName = atRes.rows[0].account_name
        } else {
          // Auto-seed this default account type for the branch if not exists
          const insRes = await client.query(
            `INSERT INTO account_type (institution_id, branch_id, account_name, status)
             VALUES ($1, $2, $3, 'Active')
             ON CONFLICT (branch_id, account_name) DO UPDATE SET status = 'Active'
             RETURNING id, account_name`,
            [actor.institution_id, member.branch_id, accountTypeInput]
          )
          resolvedAccountTypeId = insRes.rows[0]?.id
          resolvedAccountTypeName = insRes.rows[0]?.account_name || accountTypeInput
        }
      }

      if (!resolvedAccountTypeId) {
        return { error: "invalid_account_type" as const }
      }

      const inst = String(actor.institution_id).slice(0, 6).replace(/-/g, "").toUpperCase()
      const now = new Date()
      const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
      const savingsNumberGen = () =>
        `SA${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const openDate = new Date().toISOString().slice(0, 10)

      await client.query("BEGIN")
      try {
        const savInsert = await insertWithPrefixedNumberRetry<{
          id: string
          account_number: string
          account_type_id: string
          member_id: string
          status: string
          open_date: string
          auto_savings_day: string | null
          start_billing_date: string | null
          next_billing_date: string | null
          available_balance: number
          total_balance: number
        }>(
          (accountNumber) =>
            client.query(
              `INSERT INTO savings_accounts (
                institution_id,
                branch_id,
                member_id,
                account_number,
                account_type_id,
                monthly_savings,
                available_balance,
                total_balance,
                status,
                open_date,
                auto_savings_day,
                start_billing_date,
                next_billing_date
              )
              VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'Active', $7, $8, $9, $10)
              RETURNING id, account_number, account_type_id, member_id, status, open_date, auto_savings_day, start_billing_date, next_billing_date, available_balance, total_balance`,
              [
                actor.institution_id,
                member.branch_id,
                memberId,
                accountNumber,
                resolvedAccountTypeId,
                monthlySavings,
                openDate,
                autoSavingsDay,
                startDate,
                nextBillingDate,
              ],
            ),
          {
            prefix: "SA",
            savepointName: "sp_ins_savings_num_retry",
            client,
            generateNumber: savingsNumberGen,
            shouldRetryOnUniqueViolation: (err) =>
              mapSavingsDuplicateError(err) === "duplicate_savings_account_number",
          },
        )

        if (!savInsert) {
          await client.query("ROLLBACK")
          return { error: "duplicate_savings_account_number" as const }
        }

        await auditLogger.logInsert(
          "savings_accounts",
          savInsert.row.id,
          {
            member_id: memberId,
            account_number: savInsert.row.account_number,
            account_type_id: resolvedAccountTypeId,
            account_type: resolvedAccountTypeName,
            monthly_savings: monthlySavings,
            open_date: openDate,
            auto_savings_day: autoSavingsDay,
            start_billing_date: startDate,
            next_billing_date: nextBillingDate,
          },
          actor.institution_id,
          actor.id,
          { branch_id: member.branch_id },
          client,
        )

        await client.query("COMMIT")

        return {
          ok: true as const,
          account: {
            ...savInsert.row,
            account_type: resolvedAccountTypeName,
          },
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {})

        const duplicate = mapSavingsDuplicateError(err)
        if (duplicate) {
          return { error: duplicate }
        }

        throw err
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 :
        errorCode === "member_not_found" ? 404 :
        errorCode === "member_inactive" || errorCode === "staff_inactive" || errorCode === "branch_inactive" ? 403 :
        errorCode === "cross_branch_operation_forbidden" ? 403 :
        errorCode === "duplicate_savings_account_number" ? 409 :
        400
      apiLog("warn", "savings.create.denied", { method: "POST", apiPath, status: statusCode, error: errorCode })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }

    apiLog("info", "savings.create.success", {
      method: "POST",
      apiPath,
      status: 201,
      accountId: result?.account?.id,
      accountNumber: result?.account?.account_number,
    })
    return NextResponse.json({ account: result.account }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
