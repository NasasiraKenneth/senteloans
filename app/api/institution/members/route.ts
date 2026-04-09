import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"

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
  joinDate?: string
  membershipFeePaid?: number
  membershipFeeMode?: string
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

      // Get branch membership fee from senteloans_config
      const cfgRes = await client.query(
        `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
        [actor.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      let where = "c.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2
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
        if (membershipFee > 0) {
          where += ` AND COALESCE(c.membership_fee_paid, 0) >= $${idx}`
          params.push(membershipFee)
          idx++
        } else {
          where += ` AND COALESCE(c.membership_fee_paid, 0) > 0`
        }
      } else if (membershipPaymentStatus === "partial") {
        if (membershipFee > 0) {
          where += ` AND COALESCE(c.membership_fee_paid, 0) > 0 AND COALESCE(c.membership_fee_paid, 0) < $${idx}`
          params.push(membershipFee)
          idx++
        } else {
          // When membership fee is not configured, partial cannot be determined reliably.
          where += ` AND 1 = 0`
        }
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
            c.membership_fee_paid,
            c.join_date,
            c.created_by,
            c.kyc_approved_by,
            c.kyc_approved_at,
            cb.full_name AS created_by_name,
            kb.full_name AS kyc_approved_by_name
         FROM senteloans_members c
         LEFT JOIN senteloans_users cb ON cb.id = c.created_by
         LEFT JOIN senteloans_users kb ON kb.id = c.kyc_approved_by
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
    return NextResponse.json({ members, clients: members, membershipFee: result?.membershipFee ?? 0 })
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
      const allowed = await hasPermission(client, actor, "create_member")
      if (!allowed) return { error: "missing_permission:create_member" as const }

      const instRes = await client.query(`SELECT type FROM senteloans_institutions WHERE id = $1`, [actor.institution_id])
      const institution = instRes.rows[0]
      if (!institution) return { error: "institution_lookup_failed" as const }
      const shouldCreateSavings = (institution.type as string) === "SACCO" || (institution.type as string) === "MFI"
      const inst = String(actor.institution_id).slice(0, 6).replace(/-/g, "").toUpperCase()
      const now = new Date()
      const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
      const candidate = `M${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const savingsAccountNumber = shouldCreateSavings ? `SA${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : null
      const joinDate = body.joinDate || new Date().toISOString().slice(0, 10)
      const monthlyIncome = typeof body.monthlyIncome !== "undefined" && body.monthlyIncome !== null && !Number.isNaN(Number(body.monthlyIncome)) ? Number(body.monthlyIncome) : null
      const monthlySavings = typeof body.monthlySavings !== "undefined" && body.monthlySavings !== null && !Number.isNaN(Number(body.monthlySavings)) ? Number(body.monthlySavings) : null

      const membershipFeePaid = typeof body.membershipFeePaid !== "undefined" && !Number.isNaN(Number(body.membershipFeePaid)) && Number(body.membershipFeePaid) > 0
        ? Number(body.membershipFeePaid)
        : 0
      const membershipFeeMode = typeof body.membershipFeeMode === "string" ? body.membershipFeeMode : "Cash"

      const insertRes = await client.query(
        `INSERT INTO senteloans_members (institution_id, member_number, full_name, date_of_birth, gender, member_type, phone_number, national_id, email, marital_status, district, village, occupation, monthly_income, monthly_savings, join_date, membership_fee_paid, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18) RETURNING id, member_number`,
        [
          actor.institution_id,
          candidate,
          String(body.fullName).trim(),
          body.dateOfBirth,
          body.gender,
          body.memberType,
          phone,
          String(body.nationalId).trim(),
          typeof body.email === "string" ? body.email.trim() || null : null,
          typeof body.maritalStatus === "string" ? body.maritalStatus : null,
          typeof body.district === "string" ? body.district : null,
          typeof body.village === "string" ? body.village : null,
          typeof body.occupation === "string" ? body.occupation : null,
          monthlyIncome,
          monthlySavings,
          joinDate,
          membershipFeePaid,
          actor.id,
        ]
      )
      const data = insertRes.rows[0]
      if (!data) return { error: "create_failed_no_record" as const }

      // Create a Fee Payment transaction if membership fee was paid
      if (membershipFeePaid > 0) {
        const txNumber = `FEE-${Date.now()}`
        const txDate = new Date().toISOString()
        const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
        const txMode = validModes.includes(membershipFeeMode) ? membershipFeeMode : "Cash"

        // Fetch configured membership fee to compute remaining balance
        const cfgRes = await client.query(
          `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
          [actor.branch_id]
        )
        const totalMembershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

        // balance_before = remaining before payment, balance_after = remaining after payment
        const balanceBefore = totalMembershipFee
        const balanceAfter = totalMembershipFee - membershipFeePaid

        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, '', $7, $8, $9, $10, 'Completed')`,
          [actor.institution_id, data.id, txNumber, membershipFeePaid, txMode, "Membership fee payment on registration", balanceBefore, balanceAfter, actor.id, txDate]
        )
      }

      let savingsAccountData: { account_number: string; account_type: string } | null = null
      if (shouldCreateSavings && savingsAccountNumber) {
        try {
          const savRes = await client.query(
            `INSERT INTO senteloans_savings_accounts (institution_id, member_id, account_number, account_type, available_balance, total_balance, status, open_date) VALUES ($1, $2, $3, 'Voluntary', 0, 0, 'Active', $4) RETURNING id`,
            [actor.institution_id, data.id, savingsAccountNumber, joinDate]
          )
          const savId = savRes.rows[0]?.id
          savingsAccountData = { account_number: savingsAccountNumber, account_type: "Voluntary" }
          if (savId) await auditLogger.logInsert("senteloans_savings_accounts", savId, { member_id: data.id, account_number: savingsAccountNumber, account_type: "Voluntary", open_date: joinDate, auto_created: true }, actor.institution_id, actor.id, undefined, client)
        } catch (savErr) {
          await client.query(`DELETE FROM senteloans_members WHERE id = $1`, [data.id])
          return { error: "savings_creation_failed" as const }
        }
      }
      return { id: data.id, member_number: data.member_number, savings_account: savingsAccountData }
    })

    if (result && "error" in result) {
      const status = result.error === "savings_creation_failed" ? 500 : 400
      apiLog(status >= 500 ? "error" : "warn", "members.create.failed", {
        method: "POST",
        apiPath,
        status,
        error: result.error,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error }, { status })
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
    apiLog("info", "members.create.success", {
      method: "POST",
      apiPath,
      status: 201,
      memberId: result.id,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json({ id: result.id, member_number: result.member_number, savings_account: result.savings_account }, { status: 201 })
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
