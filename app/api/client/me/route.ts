import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { fetchMemberKycFlatUrls } from "@/lib/members/kyc-docs"
import { normalizeBranchConfig } from "@/lib/institution-branch-config"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, member_number, full_name, phone_number, email, kyc_status, status,
                join_date, date_of_birth, gender, marital_status, monthly_income, village, district,
                occupation, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone,
                mobile_money_provider, mobile_money_number, bank_name, bank_account_number, bank_account_name, bank_branch
         FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const instRes = await client.query(
        `SELECT id, name, type, logo, status FROM institutions WHERE id = $1`,
        [row.institution_id]
      )
      const inst = instRes.rows[0]
      if (!inst) return { client: row, institution: null, avatarUrl: null, config: null }

      const cfgRes = await client.query(
        `SELECT *
         FROM config
         WHERE branch_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [row.branch_id]
      )
      const kycUrls = await fetchMemberKycFlatUrls(client, row.id)
      return {
        client: row,
        institution: inst,
        avatarUrl: kycUrls.passport_photo,
        config: normalizeBranchConfig(cfgRes.rows[0] as Record<string, unknown> | undefined, String(inst.type)),
      }
    })

    if (!result?.client) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    if (!result.institution) return NextResponse.json({ error: "institution_not_found" }, { status: 404 })

    const c = result.client
    const i = result.institution
    return NextResponse.json({
      client: {
        id: c.id,
        institutionId: c.institution_id,
        clientNumber: c.member_number,
        fullName: c.full_name,
        phone: c.phone_number,
        email: c.email,
        kycStatus: c.kyc_status,
        status: c.status,
        avatarUrl: result.avatarUrl || null,
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
        logo: i.logo || null,
        config: result.config,
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
