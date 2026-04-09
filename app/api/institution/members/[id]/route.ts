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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) {
      apiLog("warn", "member.detail.invalid_request", { method: "GET", apiPath, status: 400, error: "missing_member_id" })
      return NextResponse.json({ error: "Missing member id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT c.id, c.institution_id, c.member_number, c.full_name, c.supabase_user_id, c.date_of_birth::text AS date_of_birth, c.gender, c.marital_status, c.member_type, c.phone_number, c.email, c.national_id, c.district, c.village, c.occupation, c.monthly_income, c.monthly_savings, c.notes, c.next_of_kin_name, c.next_of_kin_relationship, c.next_of_kin_phone, c.passport_photo, c.national_id_front, c.national_id_back, c.mobile_money_provider, c.mobile_money_number, c.bank_name, c.bank_account_number, c.bank_account_name, c.bank_branch, c.kyc_status, c.status, c.join_date::text AS join_date, c.membership_fee_paid, c.created_by, c.modified_by, c.kyc_approved_by, c.kyc_approved_at, c.created_at, c.updated_at,
                cb.full_name AS created_by_name, mb.full_name AS modified_by_name, kb.full_name AS kyc_approved_by_name
         FROM senteloans_members c
         LEFT JOIN senteloans_users cb ON cb.id = c.created_by
         LEFT JOIN senteloans_users mb ON mb.id = c.modified_by
         LEFT JOIN senteloans_users kb ON kb.id = c.kyc_approved_by
         WHERE c.institution_id = $1 AND c.id = $2`,
        [actor.institution_id, memberId]
      )

      // Fetch branch membership fee from senteloans_config
      const cfgRes = await client.query(
        `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
        [actor.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)
      const memberRow = memberRes.rows[0]
      if (!memberRow) return null

      const sharesRes = await client.query(
        `SELECT number_of_shares, share_value, total_value FROM senteloans_member_shares WHERE member_id = $1`,
        [memberId]
      )
      const sharesAgg = sharesRes.rows
      let numberOfShares = 0
      let shareValue = 0
      let totalShareValue = 0
      if (sharesAgg.length > 0) {
        numberOfShares = sharesAgg.reduce((acc: number, r: { number_of_shares?: number }) => acc + (r.number_of_shares || 0), 0)
        const last = sharesAgg[sharesAgg.length - 1]
        shareValue = Number(last?.share_value ?? sharesAgg[0]?.share_value ?? 0)
        totalShareValue = sharesAgg.reduce((acc: number, r: { total_value?: number }) => acc + Number(r.total_value || 0), 0)
      }

      return {
        member: {
          id: memberRow.id,
          member_number: memberRow.member_number,
          full_name: memberRow.full_name,
          supabase_user_id: memberRow.supabase_user_id,
          date_of_birth: memberRow.date_of_birth,
          gender: memberRow.gender,
          marital_status: memberRow.marital_status,
          member_type: memberRow.member_type,
          phone_number: memberRow.phone_number,
          email: memberRow.email,
          national_id: memberRow.national_id,
          district: memberRow.district,
          village: memberRow.village,
          occupation: memberRow.occupation,
          monthly_income: memberRow.monthly_income,
          monthly_savings: memberRow.monthly_savings,
          notes: memberRow.notes,
          next_of_kin_name: memberRow.next_of_kin_name,
          next_of_kin_relationship: memberRow.next_of_kin_relationship,
          next_of_kin_phone: memberRow.next_of_kin_phone,
          passport_photo: memberRow.passport_photo,
          national_id_front: memberRow.national_id_front,
          national_id_back: memberRow.national_id_back,
          kyc_status: memberRow.kyc_status,
          status: memberRow.status,
          join_date: memberRow.join_date,
          number_of_shares: numberOfShares,
          share_value: shareValue,
          total_share_value: totalShareValue,
          mobile_money_provider: memberRow.mobile_money_provider,
          mobile_money_number: memberRow.mobile_money_number,
          bank_name: memberRow.bank_name,
          bank_account_number: memberRow.bank_account_number,
          bank_account_name: memberRow.bank_account_name,
          bank_branch: memberRow.bank_branch,
          membership_fee_paid: Number(memberRow.membership_fee_paid) || 0,
          created_by: memberRow.created_by,
          created_by_name: memberRow.created_by_name || null,
          modified_by: memberRow.modified_by,
          modified_by_name: memberRow.modified_by_name || null,
          kyc_approved_by: memberRow.kyc_approved_by,
          kyc_approved_by_name: memberRow.kyc_approved_by_name || null,
          kyc_approved_at: memberRow.kyc_approved_at,
          created_at: memberRow.created_at,
          updated_at: memberRow.updated_at,
        },
        membershipFee,
      }
    })

    if (!result) {
      apiLog("warn", "member.detail.not_found", { method: "GET", apiPath, status: 404, memberId, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "member_not_found" }, { status: 404 })
    }
    if ("error" in result) {
      const status = result.error === "no_app_user_profile" ? 403 : result.error === "missing_permission:view_members" ? 403 : 404
      apiLog("warn", "member.detail.denied", {
        method: "GET",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.detail.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    if (!result?.member) return NextResponse.json(result)
    return NextResponse.json({ ...result, client: result.member })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) {
      apiLog("warn", "member.update.invalid_request", { method: "PATCH", apiPath, status: 400, error: "missing_member_id" })
      return NextResponse.json({ error: "Missing member id" }, { status: 400 })
    }

    const body = (await req.json()) as Record<string, unknown>
    const map: Record<string, string> = {
      fullName: "full_name",
      email: "email",
      phoneNumber: "phone_number",
      dateOfBirth: "date_of_birth",
      joinDate: "join_date",
      gender: "gender",
      maritalStatus: "marital_status",
      locationDistrict: "district",
      locationVillage: "village",
      occupation: "occupation",
      monthlyIncome: "monthly_income",
      monthlySavings: "monthly_savings",
      nextOfKin: "next_of_kin_name",
      nextOfKinRelationship: "next_of_kin_relationship",
      nextOfKinPhone: "next_of_kin_phone",
      notes: "notes",
      status: "status",
      kycStatus: "kyc_status",
      mobileMoneyProvider: "mobile_money_provider",
      mobileMoneyNumber: "mobile_money_number",
      bankName: "bank_name",
      bankAccountNumber: "bank_account_number",
      bankAccountName: "bank_account_name",
      bankBranch: "bank_branch",
    }

    const updates: Record<string, unknown> = {}
    if (typeof body.fullName === "string" && body.fullName.trim().length > 0) updates["full_name"] = body.fullName.trim()
    if (typeof body.email === "string") updates["email"] = body.email.trim() || null
    if (typeof body.phoneNumber === "string") updates["phone_number"] = body.phoneNumber.trim()
    if (typeof body.dateOfBirth === "string" && body.dateOfBirth) updates["date_of_birth"] = body.dateOfBirth
    if (typeof body.joinDate === "string" && body.joinDate) updates["join_date"] = body.joinDate
    if (typeof body.gender === "string") updates["gender"] = body.gender
    if (typeof body.maritalStatus === "string") updates["marital_status"] = body.maritalStatus
    if (typeof body.location === "string") {
      const parts = body.location.split(",")
      if (parts.length >= 2) {
        updates["village"] = parts[0].trim()
        updates["district"] = parts.slice(1).join(",").trim()
      } else {
        updates["village"] = body.location.trim()
      }
    }
    if (typeof body.occupation === "string") updates["occupation"] = body.occupation
    if (typeof body.notes === "string") updates["notes"] = body.notes
    if (typeof body.monthlyIncome !== "undefined") {
      const income = Number(body.monthlyIncome)
      if (!Number.isNaN(income) && income >= 0) updates["monthly_income"] = income
    }
    if (typeof body.monthlySavings !== "undefined") {
      const savings = Number(body.monthlySavings)
      if (!Number.isNaN(savings) && savings >= 0) updates["monthly_savings"] = savings
    }
    if (typeof body.nextOfKin === "string") updates["next_of_kin_name"] = body.nextOfKin
    if (typeof body.nextOfKinRelationship === "string") updates["next_of_kin_relationship"] = body.nextOfKinRelationship
    if (typeof body.nextOfKinPhone === "string") updates["next_of_kin_phone"] = body.nextOfKinPhone
    if (typeof body.status === "string") updates["status"] = body.status
    if (typeof body.kycStatus === "string") updates["kyc_status"] = body.kycStatus
    if (typeof body.mobileMoneyProvider === "string") updates["mobile_money_provider"] = body.mobileMoneyProvider.trim() || null
    if (typeof body.mobileMoneyNumber === "string") updates["mobile_money_number"] = body.mobileMoneyNumber.trim() || null
    if (typeof body.bankName === "string") updates["bank_name"] = body.bankName.trim() || null
    if (typeof body.bankAccountNumber === "string") updates["bank_account_number"] = body.bankAccountNumber.trim() || null
    if (typeof body.bankAccountName === "string") updates["bank_account_name"] = body.bankAccountName.trim() || null
    if (typeof body.bankBranch === "string") updates["bank_branch"] = body.bankBranch.trim() || null
    if (typeof body.membershipFeePaid !== "undefined") {
      const feePaid = Number(body.membershipFeePaid)
      if (!Number.isNaN(feePaid) && feePaid >= 0) updates["membership_fee_paid"] = feePaid
    }

    if (Object.keys(updates).length === 0) {
      apiLog("warn", "member.update.invalid_request", { method: "PATCH", apiPath, status: 400, error: "no_updatable_fields", memberId })
      return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.update.denied", { method: "PATCH", apiPath, status: 401, error: "unauthorized", memberId })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.update.denied", { method: "PATCH", apiPath, status: 403, error: "no_app_user", memberId })
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "auth_context" as const }
      const allowed = await hasPermission(client, actor, "edit_member")
      if (!allowed) return { error: "missing_permission:edit_member" as const }

      const targetRes = await client.query(
        `SELECT id, institution_id, kyc_status, membership_fee_paid FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const targetMember = targetRes.rows[0]
      if (!targetMember) return { error: "member_not_found" as const }
      if (targetMember.institution_id !== actor.institution_id) {
        return { error: "forbidden" as const }
      }

      const currentMembershipPaid = Number(targetMember.membership_fee_paid || 0)
      const nextMembershipPaid = typeof updates["membership_fee_paid"] !== "undefined"
        ? Number(updates["membership_fee_paid"])
        : currentMembershipPaid
      const membershipDelta = nextMembershipPaid > currentMembershipPaid
        ? nextMembershipPaid - currentMembershipPaid
        : 0

      updates["modified_by"] = actor.id

      if (updates["kyc_status"] === "Verified" && targetMember.kyc_status !== "Verified") {
        updates["kyc_approved_by"] = actor.id
        updates["kyc_approved_at"] = new Date().toISOString()
      }

      const keys = Object.keys(updates)
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(", ")
      const vals = Object.values(updates)
      const updateRes = await client.query(
        `UPDATE senteloans_members SET ${setClause} WHERE id = $1 AND institution_id = $2 RETURNING id`,
        [memberId, actor.institution_id, ...vals]
      )
      if (updateRes.rowCount === 0) return { error: "not_updated" as const }

      if (membershipDelta > 0) {
        const cfgRes = await client.query(
          `SELECT membership_fee FROM senteloans_config WHERE branch_id = $1 LIMIT 1`,
          [actor.branch_id]
        )
        const configuredMembershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)
        const balanceBefore = Math.max(configuredMembershipFee - currentMembershipPaid, 0)
        const balanceAfter = Math.max(configuredMembershipFee - nextMembershipPaid, 0)
        const transactionNumber = `FEE-${Date.now()}`
        const modeRaw = typeof body.membershipFeeMode === "string" ? body.membershipFeeMode : "Cash"
        const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
        const mode = validModes.includes(modeRaw) ? modeRaw : "Cash"
        const description = typeof body.membershipFeeDescription === "string" && body.membershipFeeDescription.trim()
          ? body.membershipFeeDescription.trim()
          : "Membership fee payment update"

        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, '', $7, $8, $9, $10, 'Completed')`,
          [
            actor.institution_id,
            memberId,
            transactionNumber,
            membershipDelta,
            mode,
            description,
            balanceBefore,
            balanceAfter,
            actor.id,
            new Date().toISOString(),
          ]
        )
      }

      return { ok: true, id: updateRes.rows[0].id }
    })

    if (result && "error" in result) {
      const status = result.error === "forbidden" || result.error === "missing_permission:edit_member" ? 403 : result.error === "member_not_found" ? 404 : 401
      apiLog("warn", "member.update.denied", {
        method: "PATCH",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.update.success", { method: "PATCH", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
