import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import { AUTH_USER_TYPE_INSTITUTION_STAFF, getUniqueUsername } from "@/lib/auth-users"

/**
 * Generate branch code from institution name initials and sequence index.
 * Example: "Kampala Central Sacco" -> "KCS-001"
 */
function generateBranchCode(institutionName: string, index: number = 0): string {
  const words = String(institutionName || "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)

  let prefix = ""
  if (words.length >= 2) {
    prefix = words.map((w) => w[0].toUpperCase()).join("")
  } else if (words.length === 1 && words[0].length >= 3) {
    prefix = words[0].substring(0, 3).toUpperCase()
  } else if (words.length === 1) {
    prefix = words[0].toUpperCase().padEnd(3, "X")
  } else {
    prefix = "INS"
  }

  prefix = prefix.replace(/[^A-Z0-9]/g, "").substring(0, 6) || "INS"
  const seq = String(index + 1).padStart(3, "0")
  return `${prefix}-${seq}`
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const uiType = body.type as string | undefined
    const type = uiType === "sacco" ? "SACCO" : uiType === "mfi" ? "MFI" : uiType === "money-lender" ? "Money Lender" : (body.type as string)

    const result = await runWithoutAuth(async (client) => {
      const regNum = (body.registrationNumber as string) || `REG-${Date.now()}`
      const instRes = await client.query(
        `INSERT INTO institutions (name, type, website, registration_number, license_number, logo, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          body.name,
          type,
          body.website ?? null,
          regNum,
          body.licenseNumber ?? null,
          body.logo ?? null,
          (body.status as string) || "Active",
        ]
      )
      const instId = instRes.rows[0]?.id
      let primaryBranchId: string | null = null

      if (instId) {
        const branchesList = Array.isArray(body.branches) && body.branches.length > 0
          ? (body.branches as Record<string, unknown>[])
          : [{
              branchName: body.branchName || `${body.name} Main Branch`,
              branchType: body.branchType || "Head Office",
              branch_type_id: body.branch_type_id || body.branchTypeId || null,
              email: body.email,
              phone: body.phone,
              address: body.address,
            }]

        for (let i = 0; i < branchesList.length; i++) {
          const br = branchesList[i]
          const bName = (br.branchName as string) || `${body.name} Branch ${i + 1}`

          // Generate branch code from institution name initials (e.g. Kampala Central Sacco -> KCS-001)
          const autoCode = generateBranchCode(String(body.name || "Institution"), i)
          const bCode = br.branchCode && String(br.branchCode).trim() !== "" && String(br.branchCode).toUpperCase() !== "MAIN"
            ? String(br.branchCode).toUpperCase().trim()
            : autoCode

          let resolvedBranchTypeId = (br.branch_type_id || br.branchTypeId || body.branch_type_id || body.branchTypeId) as string | null
          if (!resolvedBranchTypeId && (br.branchType || body.branchType)) {
            const typeName = (br.branchType || body.branchType) as string
            const btRes = await client.query(
              `SELECT id FROM branch_types WHERE LOWER(name) = LOWER($1) LIMIT 1`,
              [typeName]
            )
            if (btRes.rows.length > 0) {
              resolvedBranchTypeId = btRes.rows[0].id
            }
          }

          const bRes = await client.query(
            `INSERT INTO branches (institution_id, branch_type_id, branch_code, name, address, phone_number, email, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')
             ON CONFLICT (institution_id, branch_code) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [
              instId,
              resolvedBranchTypeId ?? null,
              bCode,
              bName,
              (br.address as string) ?? null,
              (br.phone as string) ?? null,
              (br.email as string) ?? null,
            ]
          )
          if (i === 0 && bRes.rows[0]?.id) {
            primaryBranchId = bRes.rows[0].id
          }
        }

        if (!primaryBranchId) {
          const bQuery = await client.query(
            `SELECT id FROM branches WHERE institution_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [instId]
          )
          primaryBranchId = bQuery.rows[0]?.id || null
        }

        // Fetch Admin Role ID
        const roleRes = await client.query(
          `SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`
        )
        const adminRoleId = roleRes.rows[0]?.id
        if (!adminRoleId) {
          throw new Error("'Admin' role is not configured in the database.")
        }

        // Seed all permissions for the Admin role across all branches of this institution in role_permissions
        await client.query(
          `INSERT INTO role_permissions (branch_id, role_id, permission_id)
           SELECT b.id, $1, p.id
           FROM branches b
           CROSS JOIN permissions p
           WHERE b.institution_id = $2
           ON CONFLICT (branch_id, role_id, permission_id) DO NOTHING`,
          [adminRoleId, instId]
        )

        // Insert default config record for all branches of the created institution
        await client.query(
          `INSERT INTO config (
              branch_id,
              loans,
              shares,
              savings,
              mobile_money,
              auto_invoices,
              chats,
              currency,
              currency_inwords,
              membership_fee,
              share_value,
              minimum_shares,
              maximum_shares,
              maximum_parallel_loans,
              loan_overdue_period,
              loan_overdue_interest,
              loan_overdue_interest_per,
              loan_default_period,
              invoice_overdue_period,
              savings_overdue_period,
              membership_overdue_period,
              membership_overdue_interest,
              membership_overdue_interest_per
          )
          SELECT
              b.id AS branch_id,
              'true' AS loans,
              CASE WHEN $2 IN ('SACCO', 'MFI') THEN 'true' ELSE 'false' END AS shares,
              CASE WHEN $2 IN ('SACCO', 'MFI') THEN 'true' ELSE 'false' END AS savings,
              'true' AS mobile_money,
              'false' AS auto_invoices,
              'true' AS chats,
              'UGX' AS currency,
              'Ugandan shillings only' AS currency_inwords,
              50000.00 AS membership_fee,
              CASE WHEN $2 IN ('SACCO', 'MFI') THEN 50000.00 ELSE 0.00 END AS share_value,
              CASE WHEN $2 IN ('SACCO', 'MFI') THEN 5 ELSE 0 END AS minimum_shares,
              CASE WHEN $2 IN ('SACCO', 'MFI') THEN 100 ELSE NULL END AS maximum_shares,
              1 AS maximum_parallel_loans,
              30 AS loan_overdue_period,
              10.00 AS loan_overdue_interest,
              'day' AS loan_overdue_interest_per,
              90 AS loan_default_period,
              30 AS invoice_overdue_period,
              NULL AS savings_overdue_period,
              30 AS membership_overdue_period,
              0.00 AS membership_overdue_interest,
              'day' AS membership_overdue_interest_per
          FROM branches b
          WHERE b.institution_id = $1
          ON CONFLICT (branch_id) DO NOTHING`,
          [instId, type]
        )

        // Insert default email_settings record for all branches of the created institution
        await client.query(
          `INSERT INTO email_settings (
              institution_id,
              branch_id,
              provider,
              is_active
          )
          SELECT
              b.institution_id,
              b.id,
              'mailgun',
              false
          FROM branches b
          WHERE b.institution_id = $1
          ON CONFLICT (branch_id) DO NOTHING`,
          [instId]
        )

        // Create Admin User if admin details provided
        const adminEmail = (body.adminEmail as string)?.trim()?.toLowerCase()
        const adminPassword = body.adminPassword as string
        const adminName = (body.adminName as string) || (body.adminFullName as string) || `${body.adminFirstName || ""} ${body.adminLastName || ""}`.trim()
        const requestedUsername = (body.adminUsername as string)?.trim()

        if (adminEmail && adminPassword) {
          const existingAuth = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [adminEmail])
          if (existingAuth.rows.length > 0) {
            throw new Error("An account with this admin email address already exists.")
          }

          const password_hash = await hash(adminPassword, 10)
          const username = requestedUsername || (await getUniqueUsername(client, adminEmail))

          const authRes = await client.query(
            `INSERT INTO app_auth_users (user_type, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
            [AUTH_USER_TYPE_INSTITUTION_STAFF, username, adminEmail, password_hash]
          )
          const authUserId = authRes.rows[0]?.id

          if (authUserId) {
            await client.query(
              `INSERT INTO users (auth_id, institution_id, branch_id, role_id, email, full_name, phone_number, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')`,
              [
                authUserId,
                instId,
                primaryBranchId,
                adminRoleId,
                adminEmail,
                adminName || "Institution Admin",
                (body.adminPhone as string) || null,
              ]
            )
          }
        }
      }
      return { ok: true, id: instId }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
