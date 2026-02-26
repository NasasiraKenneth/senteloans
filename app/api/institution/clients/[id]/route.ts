import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      const clientRes = await client.query(
        `SELECT c.id, c.institution_id, c.client_number, c.full_name, c.supabase_user_id, c.date_of_birth::text AS date_of_birth, c.gender, c.marital_status, c.client_type, c.phone_number, c.email, c.national_id, c.district, c.village, c.occupation, c.monthly_income, c.monthly_savings, c.notes, c.next_of_kin_name, c.next_of_kin_relationship, c.next_of_kin_phone, c.passport_photo, c.national_id_front, c.national_id_back, c.mobile_money_provider, c.mobile_money_number, c.bank_name, c.bank_account_number, c.bank_account_name, c.bank_branch, c.kyc_status, c.status, c.join_date::text AS join_date, c.membership_fee_paid, c.created_by, c.modified_by, c.kyc_approved_by, c.kyc_approved_at, c.created_at, c.updated_at,
                cb.full_name AS created_by_name, mb.full_name AS modified_by_name, kb.full_name AS kyc_approved_by_name
         FROM senteloans_clients c
         LEFT JOIN senteloans_users cb ON cb.id = c.created_by
         LEFT JOIN senteloans_users mb ON mb.id = c.modified_by
         LEFT JOIN senteloans_users kb ON kb.id = c.kyc_approved_by
         WHERE c.institution_id = $1 AND c.id = $2`,
        [appUser.institution_id, clientId]
      )

      // Fetch institution membership fee setting
      const instRes = await client.query(
        `SELECT settings FROM senteloans_institutions WHERE id = $1`,
        [appUser.institution_id]
      )
      const instSettings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof instSettings.membershipFee === "number" ? instSettings.membershipFee : 0
      const clientRow = clientRes.rows[0]
      if (!clientRow) return null

      const sharesRes = await client.query(
        `SELECT number_of_shares, share_value, total_value FROM senteloans_client_shares WHERE client_id = $1`,
        [clientId]
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
        client: {
          id: clientRow.id,
          client_number: clientRow.client_number,
          full_name: clientRow.full_name,
          supabase_user_id: clientRow.supabase_user_id,
          date_of_birth: clientRow.date_of_birth,
          gender: clientRow.gender,
          marital_status: clientRow.marital_status,
          client_type: clientRow.client_type,
          phone_number: clientRow.phone_number,
          email: clientRow.email,
          national_id: clientRow.national_id,
          district: clientRow.district,
          village: clientRow.village,
          occupation: clientRow.occupation,
          monthly_income: clientRow.monthly_income,
          monthly_savings: clientRow.monthly_savings,
          notes: clientRow.notes,
          next_of_kin_name: clientRow.next_of_kin_name,
          next_of_kin_relationship: clientRow.next_of_kin_relationship,
          next_of_kin_phone: clientRow.next_of_kin_phone,
          passport_photo: clientRow.passport_photo,
          national_id_front: clientRow.national_id_front,
          national_id_back: clientRow.national_id_back,
          kyc_status: clientRow.kyc_status,
          status: clientRow.status,
          join_date: clientRow.join_date,
          number_of_shares: numberOfShares,
          share_value: shareValue,
          total_share_value: totalShareValue,
          mobile_money_provider: clientRow.mobile_money_provider,
          mobile_money_number: clientRow.mobile_money_number,
          bank_name: clientRow.bank_name,
          bank_account_number: clientRow.bank_account_number,
          bank_account_name: clientRow.bank_account_name,
          bank_branch: clientRow.bank_branch,
          membership_fee_paid: Number(clientRow.membership_fee_paid) || 0,
          created_by: clientRow.created_by,
          created_by_name: clientRow.created_by_name || null,
          modified_by: clientRow.modified_by,
          modified_by_name: clientRow.modified_by_name || null,
          kyc_approved_by: clientRow.kyc_approved_by,
          kyc_approved_by_name: clientRow.kyc_approved_by_name || null,
          kyc_approved_at: clientRow.kyc_approved_at,
          created_at: clientRow.created_at,
          updated_at: clientRow.updated_at,
        },
        membershipFee,
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "Missing client id" }, { status: 400 })

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
      return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "auth_context" as const }

      const targetRes = await client.query(
        `SELECT id, institution_id, kyc_status, membership_fee_paid FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const targetClient = targetRes.rows[0]
      if (!targetClient) return { error: "client_not_found" as const }
      if (targetClient.institution_id !== appUser.institution_id) {
        return { error: "forbidden" as const }
      }

      const currentMembershipPaid = Number(targetClient.membership_fee_paid || 0)
      const nextMembershipPaid = typeof updates["membership_fee_paid"] !== "undefined"
        ? Number(updates["membership_fee_paid"])
        : currentMembershipPaid
      const membershipDelta = nextMembershipPaid > currentMembershipPaid
        ? nextMembershipPaid - currentMembershipPaid
        : 0

      updates["modified_by"] = appUser.id

      if (updates["kyc_status"] === "Verified" && targetClient.kyc_status !== "Verified") {
        updates["kyc_approved_by"] = appUser.id
        updates["kyc_approved_at"] = new Date().toISOString()
      }

      const keys = Object.keys(updates)
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(", ")
      const vals = Object.values(updates)
      const updateRes = await client.query(
        `UPDATE senteloans_clients SET ${setClause} WHERE id = $1 AND institution_id = $2 RETURNING id`,
        [clientId, appUser.institution_id, ...vals]
      )
      if (updateRes.rowCount === 0) return { error: "not_updated" as const }

      if (membershipDelta > 0) {
        const instRes = await client.query(
          `SELECT settings FROM senteloans_institutions WHERE id = $1`,
          [appUser.institution_id]
        )
        const settings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
        const configuredMembershipFee = typeof settings.membershipFee === "number" ? settings.membershipFee : 0
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
            (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, '', $7, $8, $9, $10, 'Completed')`,
          [
            appUser.institution_id,
            clientId,
            transactionNumber,
            membershipDelta,
            mode,
            description,
            balanceBefore,
            balanceAfter,
            appUser.id,
            new Date().toISOString(),
          ]
        )
      }

      return { ok: true, id: updateRes.rows[0].id }
    })

    if (result && "error" in result) {
      const status = result.error === "forbidden" ? 403 : result.error === "client_not_found" ? 404 : 401
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
