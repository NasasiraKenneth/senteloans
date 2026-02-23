import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

// POST body type
interface ClientPostBody {
  fullName?: string
  phoneNumber?: string
  nationalId?: string
  dateOfBirth?: string
  gender?: string
  clientType?: string
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

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") || "").trim()
    const status = (searchParams.get("status") || "").trim()
    const kyc = (searchParams.get("kyc") || "").trim()
    const pageSize = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      // Get institution settings to include membership fee
      const instRes = await client.query(
        `SELECT i.settings FROM senteloans_users u JOIN senteloans_institutions i ON i.id = u.institution_id WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const instSettings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof instSettings.membershipFee === "number" ? instSettings.membershipFee : 0

      let where = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const params: unknown[] = [session!.user!.authUserId]
      let idx = 2
      if (search) {
        where += ` AND (full_name ILIKE $${idx} OR client_number ILIKE $${idx} OR phone_number ILIKE $${idx} OR email ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (status) {
        where += ` AND status = $${idx}`
        params.push(status)
        idx++
      }
      if (kyc) {
        where += ` AND kyc_status = $${idx}`
        params.push(kyc)
        idx++
      }
      params.push(pageSize)
      const res = await client.query(
        `SELECT id, client_number, full_name, phone_number, email, district, status, kyc_status, membership_fee_paid
         FROM senteloans_clients WHERE ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        params
      )
      return { clients: res.rows, membershipFee }
    })

    return NextResponse.json({ clients: result?.clients || [], membershipFee: result?.membershipFee ?? 0 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, any>

    // Required fields from schema
    const requiredFields = [
      "fullName",
      "phoneNumber",
      "nationalId",
      "dateOfBirth",
      "gender",
      "clientType",
    ] as const

    // Basic validation
    for (const f of requiredFields) {
      if (!body[f] || (typeof body[f] === "string" && body[f].trim().length === 0)) {
        return NextResponse.json({ error: `missing_field: ${f}` }, { status: 400 })
      }
    }

    // Normalize phone (simple example: ensure "+256" prefix)
    let phone: string = String(body.phoneNumber).trim()
    if (phone.startsWith("0")) phone = "+256" + phone.slice(1)
    if (!phone.startsWith("+256")) {
      return NextResponse.json({ error: "invalid_phone_ug_format" }, { status: 400 })
    }

    // Email validation if provided
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(`SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`, [session!.user!.authUserId])
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "no_app_user" as const }
      const instRes = await client.query(`SELECT type FROM senteloans_institutions WHERE id = $1`, [appUser.institution_id])
      const institution = instRes.rows[0]
      if (!institution) return { error: "institution_lookup_failed" as const }
      const shouldCreateSavings = (institution.type as string) === "SACCO" || (institution.type as string) === "MFI"
      const inst = String(appUser.institution_id).slice(0, 6).replace(/-/g, "").toUpperCase()
      const now = new Date()
      const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
      const candidate = `C${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const savingsAccountNumber = shouldCreateSavings ? `SA${inst}-${yymm}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : null
      const joinDate = body.joinDate || new Date().toISOString().slice(0, 10)
      const monthlyIncome = typeof body.monthlyIncome !== "undefined" && body.monthlyIncome !== null && !Number.isNaN(Number(body.monthlyIncome)) ? Number(body.monthlyIncome) : null
      const monthlySavings = typeof body.monthlySavings !== "undefined" && body.monthlySavings !== null && !Number.isNaN(Number(body.monthlySavings)) ? Number(body.monthlySavings) : null

      const membershipFeePaid = typeof body.membershipFeePaid !== "undefined" && !Number.isNaN(Number(body.membershipFeePaid)) && Number(body.membershipFeePaid) > 0
        ? Number(body.membershipFeePaid)
        : 0
      const membershipFeeMode = typeof body.membershipFeeMode === "string" ? body.membershipFeeMode : "Cash"

      const insertRes = await client.query(
        `INSERT INTO senteloans_clients (institution_id, client_number, full_name, date_of_birth, gender, client_type, phone_number, national_id, email, marital_status, district, village, occupation, monthly_income, monthly_savings, join_date, membership_fee_paid, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18) RETURNING id, client_number`,
        [
          appUser.institution_id,
          candidate,
          String(body.fullName).trim(),
          body.dateOfBirth,
          body.gender,
          body.clientType,
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
          appUser.id,
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

        // Fetch institution membership fee to compute remaining balance
        const instSettingsRes = await client.query(
          `SELECT settings FROM senteloans_institutions WHERE id = $1`,
          [appUser.institution_id]
        )
        const instSettingsData = (instSettingsRes.rows[0]?.settings as Record<string, unknown>) || {}
        const totalMembershipFee = typeof instSettingsData.membershipFee === "number" ? instSettingsData.membershipFee : 0

        // balance_before = remaining before payment, balance_after = remaining after payment
        const balanceBefore = totalMembershipFee
        const balanceAfter = totalMembershipFee - membershipFeePaid

        await client.query(
          `INSERT INTO senteloans_transactions
            (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, '', $7, $8, $9, $10, 'Completed')`,
          [appUser.institution_id, data.id, txNumber, membershipFeePaid, txMode, "Membership fee payment on registration", balanceBefore, balanceAfter, appUser.id, txDate]
        )
      }

      let savingsAccountData: { account_number: string; account_type: string } | null = null
      if (shouldCreateSavings && savingsAccountNumber) {
        try {
          const savRes = await client.query(
            `INSERT INTO senteloans_savings_accounts (institution_id, client_id, account_number, account_type, available_balance, total_balance, status, open_date) VALUES ($1, $2, $3, 'Voluntary', 0, 0, 'Active', $4) RETURNING id`,
            [appUser.institution_id, data.id, savingsAccountNumber, joinDate]
          )
          const savId = savRes.rows[0]?.id
          savingsAccountData = { account_number: savingsAccountNumber, account_type: "Voluntary" }
          if (savId) await auditLogger.logInsert("senteloans_savings_accounts", savId, { client_id: data.id, account_number: savingsAccountNumber, account_type: "Voluntary", open_date: joinDate, auto_created: true }, appUser.institution_id, appUser.id, undefined, client)
        } catch (savErr) {
          await client.query(`DELETE FROM senteloans_clients WHERE id = $1`, [data.id])
          return { error: "savings_creation_failed" as const }
        }
      }
      return { id: data.id, client_number: data.client_number, savings_account: savingsAccountData }
    })

    if (result && "error" in result)
      return NextResponse.json({ error: result.error }, { status: result.error === "savings_creation_failed" ? 500 : 400 })
    if (!result) return NextResponse.json({ error: "create_failed" }, { status: 400 })
    return NextResponse.json({ id: result.id, client_number: result.client_number, savings_account: result.savings_account }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
