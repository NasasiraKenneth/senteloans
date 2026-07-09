import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { syncMemberEmailPreferences } from "@/lib/email/seed-member-preferences"
import { fetchStaffMemberKycSnapshot } from "@/lib/members/kyc-docs"
import {
  assertMemberAndBranchActive,
  isMemberRouteDenial,
  memberRouteDenialBody,
  memberWriteGateHttpStatus,
  memberWriteGateRouteError,
} from "@/lib/members/member-status"
import { notifyMemberProfileUpdated } from "@/lib/notifications/member-events"
import { PRIMARY_SAVINGS_MONTHLY_SAVINGS_SQL } from "@/lib/members/monthly-savings"

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
        `SELECT c.id, c.institution_id, c.branch_id, c.member_number, c.full_name, c.auth_id, c.date_of_birth::text AS date_of_birth, c.gender, c.marital_status, c.member_type, c.phone_number, c.email, c.national_id, c.district, c.village, c.occupation, c.monthly_income, ${PRIMARY_SAVINGS_MONTHLY_SAVINGS_SQL}, c.notes, c.next_of_kin_name, c.next_of_kin_relationship, c.next_of_kin_phone, c.mobile_money_provider, c.mobile_money_number, c.bank_name, c.bank_account_number, c.bank_account_name, c.bank_branch, c.kyc_status, c.status, c.join_date::text AS join_date, c.created_by, c.modified_by, c.kyc_approved_by, c.kyc_approved_at, c.created_at, c.updated_at,
                cb.full_name AS created_by_name, mb.full_name AS modified_by_name, kb.full_name AS kyc_approved_by_name,
                COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0)::numeric AS membership_fee_paid
         FROM members c
         LEFT JOIN users cb ON cb.id = c.created_by
         LEFT JOIN users mb ON mb.id = c.modified_by
         LEFT JOIN users kb ON kb.id = c.kyc_approved_by
         WHERE c.institution_id = $1 AND c.id = $2`,
        [actor.institution_id, memberId]
      )

      const memberRow = memberRes.rows[0]
      if (!memberRow) return null

      const kycSnapshot = await fetchStaffMemberKycSnapshot(client, memberId)

      // Configured fee comes from the member's branch (not the actor's branch — super-admin compatibility).
      const cfgRes = await client.query(
        `SELECT membership_fee FROM config WHERE branch_id = $1 LIMIT 1`,
        [memberRow.branch_id]
      )
      const membershipFee = Number(cfgRes.rows[0]?.membership_fee ?? 0)

      const sharesRes = await client.query(
        `SELECT number_of_shares, share_value, total_value FROM member_shares WHERE member_id = $1`,
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
          auth_id: memberRow.auth_id,
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
          passport_photo: kycSnapshot.flatUrls.passport_photo,
          national_id_front: kycSnapshot.flatUrls.national_id_front,
          national_id_back: kycSnapshot.flatUrls.national_id_back,
          passport_biodata: kycSnapshot.formDocs.passportBiodataPage,
          driving_license_front: kycSnapshot.formDocs.drivingLicenseFront,
          driving_license_back: kycSnapshot.formDocs.drivingLicenseBack,
          kyc_doc_type: kycSnapshot.docType,
          kyc_doc_status: kycSnapshot.docStatus,
          kyc_doc_complete: kycSnapshot.docComplete,
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
    return NextResponse.json(result)
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
      nextOfKin: "next_of_kin_name",
      nextOfKinRelationship: "next_of_kin_relationship",
      nextOfKinPhone: "next_of_kin_phone",
      notes: "notes",
      status: "status",
      mobileMoneyProvider: "mobile_money_provider",
      mobileMoneyNumber: "mobile_money_number",
      bankName: "bank_name",
      bankAccountNumber: "bank_account_number",
      bankAccountName: "bank_account_name",
      bankBranch: "bank_branch",
    }

    const updates: Record<string, unknown> = {}
    if (typeof body.fullName === "string" && body.fullName.trim().length > 0) updates["full_name"] = body.fullName.trim()
    if (typeof body.email === "string") {
      const email = body.email.trim()
      if (email) {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRe.test(email)) {
          apiLog("warn", "member.update.invalid_request", { method: "PATCH", apiPath, status: 400, error: "invalid_email", memberId })
          return NextResponse.json({ error: "invalid_email" }, { status: 400 })
        }
        updates["email"] = email
      } else {
        updates["email"] = null
      }
    }
    if (typeof body.phoneNumber === "string") {
      // Mirror the POST normalization so phones saved via edit match the
      // canonical +256 format expected elsewhere (notifications, lookups).
      let phone = body.phoneNumber.trim()
      if (phone) {
        if (phone.startsWith("0")) phone = "+256" + phone.slice(1)
        if (!phone.startsWith("+256")) {
          apiLog("warn", "member.update.invalid_request", { method: "PATCH", apiPath, status: 400, error: "invalid_phone_ug_format", memberId })
          return NextResponse.json({ error: "invalid_phone_ug_format" }, { status: 400 })
        }
      }
      updates["phone_number"] = phone
    }
    if (typeof body.dateOfBirth === "string" && body.dateOfBirth) updates["date_of_birth"] = body.dateOfBirth
    if (typeof body.joinDate === "string" && body.joinDate) updates["join_date"] = body.joinDate
    if (typeof body.gender === "string") updates["gender"] = body.gender
    if (typeof body.maritalStatus === "string") updates["marital_status"] = body.maritalStatus
    // Prefer explicit fields. Fall back to the legacy "village, district"
    // string only when neither explicit field is provided.
    if (typeof body.district === "string") updates["district"] = body.district.trim() || null
    if (typeof body.village === "string") updates["village"] = body.village.trim() || null
    if (
      typeof body.location === "string" &&
      typeof body.district !== "string" &&
      typeof body.village !== "string"
    ) {
      const parts = body.location.split(",")
      if (parts.length >= 2) {
        updates["village"] = parts[0].trim() || null
        updates["district"] = parts.slice(1).join(",").trim() || null
      } else {
        updates["village"] = body.location.trim() || null
      }
    }
    if (typeof body.occupation === "string") updates["occupation"] = body.occupation
    if (typeof body.notes === "string") updates["notes"] = body.notes
    if (typeof body.monthlyIncome !== "undefined") {
      const income = Number(body.monthlyIncome)
      if (!Number.isNaN(income) && income >= 0) updates["monthly_income"] = income
    }
    if (typeof body.nextOfKin === "string") updates["next_of_kin_name"] = body.nextOfKin
    if (typeof body.nextOfKinRelationship === "string") updates["next_of_kin_relationship"] = body.nextOfKinRelationship
    if (typeof body.nextOfKinPhone === "string") updates["next_of_kin_phone"] = body.nextOfKinPhone
    if (typeof body.status === "string") updates["status"] = body.status
    if (typeof body.mobileMoneyProvider === "string") updates["mobile_money_provider"] = body.mobileMoneyProvider.trim() || null
    if (typeof body.mobileMoneyNumber === "string") updates["mobile_money_number"] = body.mobileMoneyNumber.trim() || null
    if (typeof body.bankName === "string") updates["bank_name"] = body.bankName.trim() || null
    if (typeof body.bankAccountNumber === "string") updates["bank_account_number"] = body.bankAccountNumber.trim() || null
    if (typeof body.bankAccountName === "string") updates["bank_account_name"] = body.bankAccountName.trim() || null
    if (typeof body.bankBranch === "string") updates["bank_branch"] = body.bankBranch.trim() || null

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

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_member")
      if (!allowed) return { error: "missing_permission:edit_member" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const gate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (!gate.ok) {
        return memberWriteGateRouteError(gate)!
      }

      if (gate.member.branch_id !== actor.branch_id) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      const beforeRes = await client.query<{ kyc_status: string }>(
        `SELECT kyc_status FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, actor.institution_id],
      )
      const beforeKycStatus = beforeRes.rows[0]?.kyc_status

      updates["modified_by"] = actor.id

      const keys = Object.keys(updates)
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(", ")
      const vals = Object.values(updates)
      const updateRes = await client.query(
        `UPDATE members SET ${setClause} WHERE id = $1 AND institution_id = $2 RETURNING id`,
        [memberId, actor.institution_id, ...vals]
      )
      if (updateRes.rowCount === 0) return { error: "not_updated" as const }

      if ("email" in updates) {
        await syncMemberEmailPreferences(client, {
          memberId,
          institutionId: gate.member.institution_id,
          branchId: gate.member.branch_id,
          emailEnabled: Boolean(updates["email"]),
        })
      }

      await auditLogger.logUpdate(
        "members",
        memberId,
        { kyc_status: beforeKycStatus },
        updates,
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      return {
        ok: true,
        id: updateRes.rows[0].id,
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          member: {
            id: memberId,
            full_name: gate.member.full_name,
            member_number: gate.member.member_number,
          },
          updatedFields: keys.filter((k) => k !== "modified_by"),
        },
      }
    })

    if (isMemberRouteDenial(result)) {
      const status =
        result.error === "member_not_found" ? 404 :
        result.error === "actor_branch_missing" ? 400 :
        result.error === SUPER_ADMIN_WRITE_BLOCKED ||
        result.error === "missing_permission:edit_member" ||
        result.error === "cross_branch_operation_forbidden" ? 403 :
        memberWriteGateHttpStatus(result.error)
      apiLog("warn", "member.update.denied", {
        method: "PATCH",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json(memberRouteDenialBody(result), { status })
    }

    if (result && "postCommit" in result && result.postCommit) {
      const ctx = result.postCommit
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyMemberProfileUpdated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            member: ctx.member,
            updatedFields: ctx.updatedFields,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.update.notifications_dispatched" : "member.update.notifications_partial",
          {
            method: "PATCH",
            apiPath,
            status: 200,
            memberId,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.update.notifications_failed", {
          method: "PATCH",
          apiPath,
          status: 200,
          memberId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    apiLog("info", "member.update.success", { method: "PATCH", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json({ ok: true, id: result && "id" in result ? result.id : undefined })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
