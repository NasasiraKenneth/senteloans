import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, client_number, full_name, phone_number, email, kyc_status, status,
                passport_photo, join_date, date_of_birth, gender, marital_status, monthly_income, village, district,
                occupation, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone,
                mobile_money_provider, mobile_money_number, bank_name, bank_account_number, bank_account_name, bank_branch
         FROM senteloans_clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null
      const instRes = await client.query(
        `SELECT id, name, type, settings, status FROM senteloans_institutions WHERE id = $1`,
        [row.institution_id]
      )
      const inst = instRes.rows[0]
      return { client: row, institution: inst }
    })

    if (!result?.client) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    if (!result.institution) return NextResponse.json({ error: "institution_not_found" }, { status: 404 })

    const c = result.client
    const i = result.institution
    return NextResponse.json({
      client: {
        id: c.id,
        institutionId: c.institution_id,
        clientNumber: c.client_number,
        fullName: c.full_name,
        phone: c.phone_number,
        email: c.email,
        kycStatus: c.kyc_status,
        status: c.status,
        avatarUrl: c.passport_photo || null,
        joinDate: c.join_date,
        dateOfBirth: c.date_of_birth || null,
        gender: c.gender || null,
        maritalStatus: c.marital_status || null,
        monthlyIncome: c.monthly_income ?? null,
        village: c.village || "",
        district: c.district || "",
        occupation: c.occupation || "",
        nextOfKinName: c.next_of_kin_name || "",
        nextOfKinRelationship: c.next_of_kin_relationship || "",
        nextOfKinPhone: c.next_of_kin_phone || "",
        mobileMoneyProvider: c.mobile_money_provider || "",
        mobileMoneyNumber: c.mobile_money_number || "",
        bankName: c.bank_name || "",
        bankAccountNumber: c.bank_account_number || "",
        bankAccountName: c.bank_account_name || "",
        bankBranch: c.bank_branch || "",
      },
      institution: {
        id: i.id,
        name: i.name,
        type: i.type,
        status: i.status,
        config: i.settings || {},
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
