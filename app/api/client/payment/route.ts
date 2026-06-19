import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>
    const mobileMoneyProvider = typeof payload.mobileMoneyProvider === "string" ? payload.mobileMoneyProvider.trim() : undefined
    const mobileMoneyNumber = typeof payload.mobileMoneyNumber === "string" ? payload.mobileMoneyNumber.trim() : undefined
    const bankName = typeof payload.bankName === "string" ? payload.bankName.trim() : undefined
    const bankAccountNumber = typeof payload.bankAccountNumber === "string" ? payload.bankAccountNumber.trim() : undefined
    const bankAccountName = typeof payload.bankAccountName === "string" ? payload.bankAccountName.trim() : undefined
    const bankBranch = typeof payload.bankBranch === "string" ? payload.bankBranch.trim() : undefined

    const errors: string[] = []
    const phoneRe = /^\+?[0-9]{7,15}$/
    if (mobileMoneyProvider && mobileMoneyProvider.length > 255) errors.push("mobile_money_provider_too_long")
    if (mobileMoneyNumber && !phoneRe.test(mobileMoneyNumber)) errors.push("invalid_mobile_money_number")
    if (bankName && bankName.length > 255) errors.push("bank_name_too_long")
    if (bankAccountNumber && bankAccountNumber.length > 50) errors.push("bank_account_number_too_long")
    if (bankAccountName && bankAccountName.length > 255) errors.push("bank_account_name_too_long")
    if (bankBranch && bankBranch.length > 255) errors.push("bank_branch_too_long")
    if (errors.length > 0) return NextResponse.json({ error: errors.join(",") }, { status: 400 })

    const updates: Record<string, string | null> = {}
    if (typeof mobileMoneyProvider !== "undefined") updates.mobile_money_provider = mobileMoneyProvider ?? null
    if (typeof mobileMoneyNumber !== "undefined") updates.mobile_money_number = mobileMoneyNumber ?? null
    if (typeof bankName !== "undefined") updates.bank_name = bankName ?? null
    if (typeof bankAccountNumber !== "undefined") updates.bank_account_number = bankAccountNumber ?? null
    if (typeof bankAccountName !== "undefined") updates.bank_account_name = bankAccountName ?? null
    if (typeof bankBranch !== "undefined") updates.bank_branch = bankBranch ?? null
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true, updated: false })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, mobile_money_provider, mobile_money_number, bank_name, bank_account_number, bank_account_name, bank_branch FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
      await client.query(`UPDATE members SET ${setClause} WHERE id = $1`, [row.id, ...Object.values(updates)])

      await auditLogger.logUpdate(
        "members",
        row.id,
        {
          mobile_money_provider: row.mobile_money_provider,
          mobile_money_number: row.mobile_money_number,
          bank_name: row.bank_name,
          bank_account_number: row.bank_account_number,
          bank_account_name: row.bank_account_name,
          bank_branch: row.bank_branch,
        },
        updates,
        row.institution_id,
        undefined,
        undefined,
        client
      )

      const selRes = await client.query(
        `SELECT id, mobile_money_provider, mobile_money_number, bank_name, bank_account_number, bank_account_name, bank_branch FROM members WHERE id = $1`,
        [row.id]
      )
      return { ok: true, updated: true, payment: selRes.rows[0] }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
