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
        `SELECT id, institution_id, client_number, full_name, supabase_user_id, date_of_birth, gender, marital_status, client_type, phone_number, email, national_id, district, village, occupation, monthly_income, loan_officer, notes, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, passport_photo, national_id_front, national_id_back, mobile_money_provider, mobile_money_number, bank_name, bank_account_number, bank_account_name, bank_branch, kyc_status, status, join_date
         FROM senteloans_clients WHERE institution_id = $1 AND id = $2`,
        [appUser.institution_id, clientId]
      )
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
          loan_officer: clientRow.loan_officer,
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
        },
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
      kycStatus: "kyc_status",
      loanOfficer: "loan_officer",
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
    if (typeof body.nextOfKin === "string") updates["next_of_kin_name"] = body.nextOfKin
    if (typeof body.nextOfKinRelationship === "string") updates["next_of_kin_relationship"] = body.nextOfKinRelationship
    if (typeof body.nextOfKinPhone === "string") updates["next_of_kin_phone"] = body.nextOfKinPhone
    if (typeof body.status === "string") updates["status"] = body.status
    if (typeof body.kycStatus === "string") updates["kyc_status"] = body.kycStatus
    if (typeof body.loanOfficer === "string") updates["loan_officer"] = body.loanOfficer
    if (typeof body.mobileMoneyProvider === "string") updates["mobile_money_provider"] = body.mobileMoneyProvider.trim() || null
    if (typeof body.mobileMoneyNumber === "string") updates["mobile_money_number"] = body.mobileMoneyNumber.trim() || null
    if (typeof body.bankName === "string") updates["bank_name"] = body.bankName.trim() || null
    if (typeof body.bankAccountNumber === "string") updates["bank_account_number"] = body.bankAccountNumber.trim() || null
    if (typeof body.bankAccountName === "string") updates["bank_account_name"] = body.bankAccountName.trim() || null
    if (typeof body.bankBranch === "string") updates["bank_branch"] = body.bankBranch.trim() || null

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
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const targetClient = targetRes.rows[0]
      if (!targetClient) return { error: "client_not_found" as const }
      if (targetClient.institution_id !== appUser.institution_id) {
        return { error: "forbidden" as const }
      }

      const keys = Object.keys(updates)
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(", ")
      const vals = Object.values(updates)
      const updateRes = await client.query(
        `UPDATE senteloans_clients SET ${setClause} WHERE id = $1 AND institution_id = $2 RETURNING id`,
        [clientId, appUser.institution_id, ...vals]
      )
      if (updateRes.rowCount === 0) return { error: "not_updated" as const }
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
