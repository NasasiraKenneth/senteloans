import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { createInvoiceWithItems, type CreatedInvoice } from "@/lib/invoices/create-invoice"
import { notifyMemberRegistration } from "@/lib/notifications/member-events"
import { enqueueMemberRegistrationEmails } from "@/lib/email/member-emails"
import { syncMemberEmailPreferences } from "@/lib/email/seed-member-preferences"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { parseMonthlySavingsInput } from "@/lib/members/monthly-savings"

type MemberCreatePostCommit = {
  institutionName: string
  currency: string
  email: string | null
  fullName: string
  actorId: string
  institutionId: string
  branchId: string
}

// POST body type
interface MemberPostBody {
  fullName?: string
  phoneNumber?: string
  nationalId?: string
  dateOfBirth?: string
  gender?: string
  memberType?: string
  email?: string
  maritalStatus?: string
  district?: string
  village?: string
  occupation?: string
  monthlyIncome?: number
  monthlySavings?: number
  savingsAccountType?: "Voluntary" | "Fixed"
  nextOfKinName?: string
  nextOfKinRelationship?: string
  nextOfKinPhone?: string
  joinDate?: string
}

/** Account types that may be auto-opened at registration. */
const REGISTRATION_SAVINGS_TYPES = ["Voluntary", "Fixed"] as const
type RegistrationSavingsType = (typeof REGISTRATION_SAVINGS_TYPES)[number]

const resolveSavingsAccountType = (
  value: unknown,
): RegistrationSavingsType => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if ((REGISTRATION_SAVINGS_TYPES as readonly string[]).includes(trimmed)) {
      return trimmed as RegistrationSavingsType
    }
  }
  return "Voluntary"
}

/** Map Postgres unique-violation constraints on member tables to friendly codes. */
const mapMemberDuplicateError = (
  err: unknown,
): "duplicate_national_id" | "duplicate_member_number" | "duplicate_savings_account_number" | null => {
  const e = err as { code?: string; constraint?: string; detail?: string; message?: string }
  if (String(e?.code || "") !== "23505") return null
  const constraint = String(e?.constraint || "")
  const detail = String(e?.detail || e?.message || "")
  if (constraint === "uk_members_national_id" || /national_id/.test(detail)) {
    return "duplicate_national_id"
  }
  if (constraint === "uk_members_number" || /member_number/.test(detail)) {
    return "duplicate_member_number"
  }
  if (constraint === "uk_accounts_number" || /account_number/.test(detail)) {
    return "duplicate_savings_account_number"
  }
  return null
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "members.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "members.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") || "").trim()
    const status = (searchParams.get("status") || "").trim()
    const kyc = (searchParams.get("kyc") || "").trim()
    const membershipPaymentStatus = (searchParams.get("membershipPaymentStatus") || "").trim()
    const kycApprovedAtStart = (searchParams.get("kycApprovedAtStart") || "").trim()
    const kycApprovedAtEnd = (searchParams.get("kycApprovedAtEnd") || "").trim()
    const openingBalanceRecorded = (searchParams.get("openingBalanceRecorded") || "").trim().toLowerCase()
    const branchesRaw = (searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const pageSize = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }
      const actorRole = String(actor.role || "").trim().toLowerCase()

      // Keep a branch-local membership fee for UI compatibility.
      const cfgRes = await client.query(
        `SELECT membership_fee FROM config WHERE branch_id = $1 LIMIT 1`,
        [actor.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      let where = "c.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2
      if (actorRole !== "super_admin") {
        where += ` AND c.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      }
      if (search) {
        where += ` AND (c.full_name ILIKE $${idx} OR c.member_number ILIKE $${idx} OR c.phone_number ILIKE $${idx} OR c.email ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (status) {
        where += ` AND c.status = $${idx}`
        params.push(status)
        idx++
      }
      if (kyc) {
        where += ` AND c.kyc_status = $${idx}`
        params.push(kyc)
        idx++
      }
      if (openingBalanceRecorded === "true" || openingBalanceRecorded === "false") {
        where += ` AND c.opening_balance_recorded = $${idx}`
        params.push(openingBalanceRecorded === "true")
        idx++
      }
      if (membershipPaymentStatus === "fully_paid") {
        where += ` AND (
          EXISTS (
            SELECT 1
            FROM config cfg
            WHERE cfg.branch_id = c.branch_id
              AND COALESCE(cfg.membership_fee, 0) > 0
              AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) >= cfg.membership_fee
          )
          OR (
            NOT EXISTS (
              SELECT 1
              FROM config cfg2
              WHERE cfg2.branch_id = c.branch_id
                AND COALESCE(cfg2.membership_fee, 0) > 0
            )
            AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) > 0
          )
        )`
      } else if (membershipPaymentStatus === "partial") {
        where += ` AND EXISTS (
          SELECT 1
          FROM config cfg
          WHERE cfg.branch_id = c.branch_id
            AND COALESCE(cfg.membership_fee, 0) > 0
            AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) > 0
            AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) < cfg.membership_fee
        )`
      }
      if (kycApprovedAtStart) {
        where += ` AND c.kyc_approved_at >= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(kycApprovedAtStart)
        idx++
      }
      if (kycApprovedAtEnd) {
        where += ` AND c.kyc_approved_at <= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(kycApprovedAtEnd)
        idx++
      }
      if (selectedBranchIds.length > 0 && actorRole === "super_admin") {
        where += ` AND c.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }
      params.push(pageSize)
      const res = await client.query(
        `SELECT
            c.id,
            c.member_number,
            c.full_name,
            c.phone_number,
            c.email,
            c.district,
            c.status,
            c.kyc_status,
            COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0)::numeric AS membership_fee_paid,
            c.join_date,
            c.created_by,
            c.kyc_approved_by,
            c.kyc_approved_at,
            cb.full_name AS created_by_name,
            kb.full_name AS kyc_approved_by_name
         FROM members c
         LEFT JOIN users cb ON cb.id = c.created_by
         LEFT JOIN users kb ON kb.id = c.kyc_approved_by
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${idx}`,
        params
      )
      return { members: res.rows, membershipFee }
    })

    if (result && "error" in result) {
      const status = result.error === "no_app_user_profile" ? 403 : 403
      apiLog("warn", "members.list.denied", {
        method: "GET",
        apiPath,
        status,
        error: result.error,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error }, { status })
    }
    const members = result?.members || []
    apiLog("info", "members.list.success", {
      method: "GET",
      apiPath,
      status: 200,
      count: members.length,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json({ members, membershipFee: result?.membershipFee ?? 0 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "members.list.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const body = (await req.json()) as Record<string, any>

    // Required fields from schema
    const requiredFields = [
      "fullName",
      "phoneNumber",
      "nationalId",
      "dateOfBirth",
      "gender",
      "memberType",
    ] as const

    // Basic validation
    for (const f of requiredFields) {
      if (!body[f] || (typeof body[f] === "string" && body[f].trim().length === 0)) {
        apiLog("warn", "members.create.invalid_request", {
          method: "POST",
          apiPath,
          status: 400,
          error: `missing_field:${f}`,
        })
        return NextResponse.json({ error: `missing_field: ${f}` }, { status: 400 })
      }
    }

    // Normalize phone (simple example: ensure "+256" prefix)
    let phone: string = String(body.phoneNumber).trim()
    if (phone.startsWith("0")) phone = "+256" + phone.slice(1)
    if (!phone.startsWith("+256")) {
      apiLog("warn", "members.create.invalid_request", {
        method: "POST",
        apiPath,
        status: 400,
        error: "invalid_phone_ug_format",
      })
      return NextResponse.json({ error: "invalid_phone_ug_format" }, { status: 400 })
    }

    // Email validation if provided
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(email)) {
        apiLog("warn", "members.create.invalid_request", {
          method: "POST",
          apiPath,
          status: 400,
          error: "invalid_email",
        })
        return NextResponse.json({ error: "invalid_email" }, { status: 400 })
      }
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "members.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "members.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user" })
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "create_member")
      if (!allowed) return { error: "missing_permission:create_member" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const branchId = actor.branch_id

      // Reusable branch gate: block writes against suspended/closed branches.
      const branchCheck = await assertBranchActive(client, branchId)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const instRes = await client.query(
        `SELECT id, name, type FROM institutions WHERE id = $1`,
        [actor.institution_id],
      )
      const institution = instRes.rows[0]
      if (!institution) return { error: "institution_lookup_failed" as const }
      const shouldCreateSavings = (institution.type as string) === "SACCO" || (institution.type as string) === "MFI"

      // Branch-scoped config used for invoice + currency context.
      const cfgRes = await client.query(
        `SELECT currency, membership_fee, invoice_overdue_period
           FROM config WHERE branch_id = $1 LIMIT 1`,
        [branchId],
      )
      const cfg = cfgRes.rows[0] || {}
      const currency = (cfg.currency as string) || "UGX"
      const membershipFee = Number(cfg.membership_fee || 0)
      const invoiceDueDays = Number(cfg.invoice_overdue_period || 30)

      const inst = String(actor.institution_id).slice(0, 6).replace(/-/g, "").toUpperCase()
      const now = new Date()
      const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
      // Number generators kept compact (no timestamp) — these IDs are
      // human-facing. Collisions on the 4-char random suffix are vanishingly
      // rare but possible at scale, so each INSERT is wrapped in a SAVEPOINT
      // retry that mints a fresh candidate on 23505.
      const memberNumberGen = () =>
        `M${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const savingsNumberGen = () =>
        `SA${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const joinDate = body.joinDate || new Date().toISOString().slice(0, 10)
      const monthlyIncome = typeof body.monthlyIncome !== "undefined" && body.monthlyIncome !== null && !Number.isNaN(Number(body.monthlyIncome)) ? Number(body.monthlyIncome) : null
      const memberEmail = typeof body.email === "string" ? body.email.trim() || null : null
      const savingsAccountType = resolveSavingsAccountType(body.savingsAccountType)

      let monthlySavings: number | null = null
      if (shouldCreateSavings) {
        const parsed = parseMonthlySavingsInput(body.monthlySavings, savingsAccountType)
        if (parsed.error) {
          return { error: parsed.error }
        }
        monthlySavings = parsed.value
      }
      const nextOfKinName = typeof body.nextOfKinName === "string" ? body.nextOfKinName.trim() || null : null
      const nextOfKinRelationship = typeof body.nextOfKinRelationship === "string" ? body.nextOfKinRelationship.trim() || null : null
      const nextOfKinPhone = typeof body.nextOfKinPhone === "string" ? body.nextOfKinPhone.trim() || null : null

      // Wrap the multi-table writes in a single transaction so a downstream
      // failure (savings or invoice) rolls back the member row too.
      await client.query("BEGIN")

      let savingsAccountData: { account_number: string; account_type: string } | null = null
      let createdInvoice: CreatedInvoice | null = null
      let data: { id: string; member_number: string }

      try {
        const memberInsert = await insertWithPrefixedNumberRetry<{
          id: string
          member_number: string
        }>(
          (memberNumber) =>
            client.query<{ id: string; member_number: string }>(
              `INSERT INTO members (institution_id, branch_id, member_number, full_name, date_of_birth, gender, member_type, phone_number, national_id, email, marital_status, district, village, occupation, monthly_income, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, join_date, created_by, modified_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20) RETURNING id, member_number`,
              [
                actor.institution_id,
                branchId,
                memberNumber,
                String(body.fullName).trim(),
                body.dateOfBirth,
                body.gender,
                body.memberType,
                phone,
                String(body.nationalId).trim(),
                memberEmail,
                typeof body.maritalStatus === "string" ? body.maritalStatus : null,
                typeof body.district === "string" ? body.district : null,
                typeof body.village === "string" ? body.village : null,
                typeof body.occupation === "string" ? body.occupation : null,
                monthlyIncome,
                nextOfKinName,
                nextOfKinRelationship,
                nextOfKinPhone,
                joinDate,
                actor.id,
              ],
            ),
          {
            prefix: "M",
            savepointName: "sp_ins_member_num_retry",
            client,
            generateNumber: memberNumberGen,
            // Only retry on member_number collisions; let national_id (or any
            // other unique constraint) bubble up so the outer catch can
            // translate it into a friendly 409.
            shouldRetryOnUniqueViolation: (err) =>
              mapMemberDuplicateError(err) === "duplicate_member_number",
          },
        )
        if (!memberInsert) {
          await client.query("ROLLBACK")
          return { error: "duplicate_member_number" as const }
        }
        data = memberInsert.row

        await auditLogger.logInsert(
          "members",
          data.id,
          {
            member_number: data.member_number,
            full_name: String(body.fullName).trim(),
            phone_number: phone,
            national_id: String(body.nationalId).trim(),
            date_of_birth: body.dateOfBirth,
            gender: body.gender,
            member_type: body.memberType,
            email: memberEmail,
            marital_status: typeof body.maritalStatus === "string" ? body.maritalStatus : null,
            district: typeof body.district === "string" ? body.district : null,
            village: typeof body.village === "string" ? body.village : null,
            occupation: typeof body.occupation === "string" ? body.occupation : null,
            monthly_income: monthlyIncome,
            next_of_kin_name: nextOfKinName,
            next_of_kin_relationship: nextOfKinRelationship,
            next_of_kin_phone: nextOfKinPhone,
            join_date: joinDate,
          },
          actor.institution_id,
          actor.id,
          { branch_id: branchId },
          client,
        )

        if (shouldCreateSavings) {
          let resolvedAccountTypeId: string | null = null
          const atRes = await client.query(
            `SELECT id, account_name FROM account_type WHERE branch_id = $1 AND (account_name ILIKE $2 OR id::text = $2) AND status = 'Active' LIMIT 1`,
            [branchId, savingsAccountType || "Voluntary"]
          )
          if (atRes.rows[0]) {
            resolvedAccountTypeId = atRes.rows[0].id
          } else {
            const insType = await client.query(
              `INSERT INTO account_type (institution_id, branch_id, account_name, status)
               VALUES ($1, $2, $3, 'Active')
               ON CONFLICT (branch_id, account_name) DO UPDATE SET status = 'Active'
               RETURNING id`,
              [actor.institution_id, branchId, savingsAccountType || "Voluntary"]
            )
            resolvedAccountTypeId = insType.rows[0]?.id
          }

          const savInsert = await insertWithPrefixedNumberRetry<{
            id: string
            account_number: string
          }>(
            (accountNumber) =>
              client.query<{ id: string; account_number: string }>(
                `INSERT INTO savings_accounts (institution_id, branch_id, member_id, account_number, account_type_id, monthly_savings, available_balance, total_balance, status, open_date)
                 VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'Active', $7) RETURNING id, account_number`,
                [actor.institution_id, branchId, data.id, accountNumber, resolvedAccountTypeId, monthlySavings, joinDate],
              ),
            {
              prefix: "SA",
              savepointName: "sp_ins_savings_num_retry",
              client,
              generateNumber: savingsNumberGen,
              shouldRetryOnUniqueViolation: (err) =>
                mapMemberDuplicateError(err) === "duplicate_savings_account_number",
            },
          )
          if (!savInsert) {
            await client.query("ROLLBACK")
            return { error: "duplicate_savings_account_number" as const }
          }
          savingsAccountData = {
            account_number: savInsert.row.account_number,
            account_type: savingsAccountType,
          }
          await auditLogger.logInsert(
            "savings_accounts",
            savInsert.row.id,
            {
              member_id: data.id,
              account_number: savInsert.row.account_number,
              account_type_id: resolvedAccountTypeId,
              account_type: savingsAccountType,
              monthly_savings: monthlySavings,
              open_date: joinDate,
              auto_created: true,
            },
            actor.institution_id,
            actor.id,
            { branch_id: branchId },
            client,
          )
        }

        // Auto-create a membership-fee invoice when the branch has a fee
        // configured. Fees are still recorded via the dedicated /membership-fee
        // endpoint — the invoice gives the member something to settle against.
        if (membershipFee > 0) {
          const due = new Date(`${joinDate}T00:00:00Z`)
          due.setUTCDate(due.getUTCDate() + Math.max(1, invoiceDueDays))
          const invoiceDue = due.toISOString().slice(0, 10)

          createdInvoice = await createInvoiceWithItems(client, {
            institutionId: actor.institution_id,
            branchId,
            createdBy: actor.id,
            invoiceDate: joinDate,
            invoiceDue,
            invoiceType: "Auto",
            status: "sent",
            items: [
              {
                unit: "Year",
                description: "Annual Membership Fee",
                quantity: 1,
                unit_price: membershipFee,
                total_price: membershipFee,
              },
            ],
            target: { member_id: data.id },
          })
        }

        // Email notification prefs: enabled when member has an email, disabled otherwise.
        await syncMemberEmailPreferences(client, {
          memberId: data.id,
          institutionId: actor.institution_id,
          branchId,
          emailEnabled: Boolean(memberEmail),
        })

        await client.query("COMMIT")
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {})
        const duplicate = mapMemberDuplicateError(txErr)
        if (duplicate) {
          return { error: duplicate }
        }
        throw txErr
      }

      return {
        id: data.id,
        member_number: data.member_number,
        savings_account: savingsAccountData,
        invoice: createdInvoice,
        postCommit: {
          institutionName: institution.name as string,
          currency,
          email: memberEmail,
          fullName: String(body.fullName).trim(),
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId,
        } satisfies MemberCreatePostCommit,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "branch_inactive" ||
        result.error === "branch_not_found" ||
        result.error === SUPER_ADMIN_WRITE_BLOCKED
          ? 403
          : result.error === "duplicate_national_id" ||
              result.error === "duplicate_member_number" ||
              result.error === "duplicate_savings_account_number"
            ? 409
            : 400
      apiLog(status >= 500 ? "error" : "warn", "members.create.failed", {
        method: "POST",
        apiPath,
        status,
        error: result.error,
        authUserId: session.user.authUserId,
        ...(("branchStatus" in result) ? { branchStatus: (result as any).branchStatus } : {}),
      })
      const errorText =
        "message" in result && result.message ? result.message : result.error
      const payload: Record<string, unknown> = {
        error: errorText,
        code: result.error,
      }
      if ("branchStatus" in result && (result as any).branchStatus) {
        payload.branch_status = (result as any).branchStatus
      }
      return NextResponse.json(payload, { status })
    }
    if (!result) {
      apiLog("warn", "members.create.failed", {
        method: "POST",
        apiPath,
        status: 400,
        error: "create_failed",
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: "create_failed" }, { status: 400 })
    }

    // Post-commit side-effects: notifications + emails. Best-effort — never
    // raise back to the client (member is already persisted at this point).
    const ctx = result.postCommit
    try {
      // Acquire a fresh client so notifyMemberRegistration can fan out to
      // institution admins (the staff branch needs a client to query
      // users / roles). Without it, staff
      // notifications are silently skipped.
      const notifyRes = await runWithoutAuth((notifyClient) =>
        notifyMemberRegistration({
          client: notifyClient,
          actor: {
            id: ctx.actorId,
            institution_id: ctx.institutionId,
            branch_id: ctx.branchId,
          },
          member: {
            id: result.id,
            full_name: ctx.fullName,
            member_number: result.member_number,
          },
          institutionName: ctx.institutionName,
          invoice: result.invoice
            ? {
                id: result.invoice.id,
                invoice_number: result.invoice.invoice_number,
                total_amount: result.invoice.total_amount,
                invoice_due: result.invoice.invoice_due,
              }
            : null,
        }),
      )
      apiLog(notifyRes.ok ? "info" : "warn",
        notifyRes.ok ? "members.create.notifications_dispatched" : "members.create.notifications_partial",
        {
          method: "POST",
          apiPath,
          status: 201,
          memberId: result.id,
          memberNotifications: notifyRes.memberNotifications,
          staffNotifications: notifyRes.staffNotifications,
          ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
        },
      )
    } catch (notifyErr) {
      apiLog("error", "members.create.notifications_failed", {
        method: "POST",
        apiPath,
        status: 201,
        memberId: result.id,
        error: (notifyErr as Error)?.message || "notify_failed",
      })
    }

    try {
      const emailRes = await enqueueMemberRegistrationEmails({
        member: {
          id: result.id,
          full_name: ctx.fullName,
          member_number: result.member_number,
          email: ctx.email || "",
        },
        institutionName: ctx.institutionName,
        currency: ctx.currency,
        savingsAccount: result.savings_account
          ? {
              account_number: result.savings_account.account_number,
              account_type: result.savings_account.account_type,
            }
          : null,
        invoice: result.invoice
          ? {
              id: result.invoice.id,
              invoice_number: result.invoice.invoice_number,
              total_amount: result.invoice.total_amount,
              invoice_due: result.invoice.invoice_due,
            }
          : null,
        context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
      })
      if (emailRes.errors.length > 0) {
        apiLog("warn", "members.create.email_enqueue_partial", {
          method: "POST",
          apiPath,
          status: 201,
          memberId: result.id,
          errors: emailRes.errors,
        })
      }
    } catch (mailErr) {
      apiLog("error", "members.create.email_enqueue_failed", {
        method: "POST",
        apiPath,
        status: 201,
        memberId: result.id,
        error: (mailErr as Error)?.message || "enqueue_failed",
      })
    }

    apiLog("info", "members.create.success", {
      method: "POST",
      apiPath,
      status: 201,
      memberId: result.id,
      invoiceId: result.invoice?.id,
      invoiceNumber: result.invoice?.invoice_number,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(
      {
        id: result.id,
        member_number: result.member_number,
        savings_account: result.savings_account,
        invoice: result.invoice
          ? {
              id: result.invoice.id,
              invoice_number: result.invoice.invoice_number,
              total_amount: result.invoice.total_amount,
              invoice_due: result.invoice.invoice_due,
            }
          : null,
      },
      { status: 201 },
    )
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "members.create.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
