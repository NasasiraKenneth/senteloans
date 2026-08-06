import { NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"
import { hash } from "bcryptjs"

const AUTH_USER_TYPE_INSTITUTION_STAFF = "institution_staff"

function generateBranchCode(instName: string, existingCount: number): string {
  const cleanName = (instName || "SACCO").replace(/[^a-zA-Z0-9\s]/g, "").trim()
  const parts = cleanName.split(/\s+/).filter(Boolean)
  let prefix = ""
  if (parts.length >= 2) {
    prefix = (parts[0][0] + parts[1][0]).toUpperCase()
  } else if (parts.length === 1 && parts[0].length >= 3) {
    prefix = parts[0].substring(0, 3).toUpperCase()
  } else {
    prefix = (cleanName.substring(0, 2) || "BR").toUpperCase()
  }
  const seqNum = String(existingCount + 1).padStart(3, "0")
  return `${prefix}-${seqNum}`
}

async function getUniqueUsername(client: any, email: string): Promise<string> {
  const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "admin"
  let username = baseUsername
  let counter = 1

  while (true) {
    const res = await client.query(`SELECT id FROM app_auth_users WHERE username = $1`, [username])
    if (res.rows.length === 0) {
      return username
    }
    username = `${baseUsername}${counter}`
    counter++
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: institutionId } = await params
    if (!institutionId) {
      return NextResponse.json({ error: "Institution ID is required" }, { status: 400 })
    }

    const body = await request.json()
    const {
      name,
      branch_code,
      branch_type_id,
      phone_number,
      email,
      address,
      status = "Active",
      // Admin fields
      adminFullName,
      adminUsername,
      adminEmail,
      adminPhone,
      adminPassword,
    } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Branch name is required" }, { status: 400 })
    }

    const createdBranch = await runWithoutAuth(async (client) => {
      // 1. Fetch institution details for auto-code generation
      const instRes = await client.query(
        `SELECT name FROM institutions WHERE id = $1`,
        [institutionId]
      )
      if (instRes.rows.length === 0) {
        throw new Error("Institution not found")
      }

      const instName = instRes.rows[0].name

      // 2. Count existing branches for sequence number
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM branches WHERE institution_id = $1`,
        [institutionId]
      )
      const branchCount = countRes.rows[0]?.count || 0

      const finalBranchCode = branch_code?.trim()
        ? branch_code.trim().toUpperCase()
        : generateBranchCode(instName, branchCount)

      // 3. Insert Branch
      const branchRes = await client.query(
        `INSERT INTO branches (
          institution_id,
          branch_type_id,
          branch_code,
          name,
          address,
          phone_number,
          email,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          institutionId,
          branch_type_id || null,
          finalBranchCode,
          name.trim(),
          address?.trim() || null,
          phone_number?.trim() || null,
          email?.trim() || null,
          status || "Active",
        ]
      )

      const branch = branchRes.rows[0]
      const branchId = branch.id

      // 4. Seed default config for the newly created branch
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
          loan_overdue_interest,
          membership_overdue_interest
        ) VALUES (
          $1, 'true', 'true', 'true', 'true', 'false', 'true', 'UGX', 'Uganda Shillings', 50000.00, 50000.00, 5, 0.00, 0.00
        ) ON CONFLICT (branch_id) DO NOTHING`,
        [branchId]
      )

      // 5. Seed role permissions for Admin role on this branch
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`
      )
      const adminRoleId = roleRes.rows[0]?.id
      if (adminRoleId) {
        await client.query(
          `INSERT INTO role_permissions (branch_id, role_id, permission_id)
           SELECT $1, $2, p.id
           FROM permissions p
           ON CONFLICT (branch_id, role_id, permission_id) DO NOTHING`,
          [branchId, adminRoleId]
        )
      }

      // 6. Create Admin User if admin email and password provided
      const cleanAdminEmail = adminEmail?.trim()?.toLowerCase()
      if (cleanAdminEmail && adminPassword) {
        const existingAuth = await client.query(
          `SELECT id FROM app_auth_users WHERE email = $1`,
          [cleanAdminEmail]
        )
        if (existingAuth.rows.length > 0) {
          throw new Error("An account with this admin email address already exists.")
        }

        const password_hash = await hash(adminPassword, 10)
        const username = adminUsername?.trim() || (await getUniqueUsername(client, cleanAdminEmail))

        const authRes = await client.query(
          `INSERT INTO app_auth_users (user_type, username, email, password_hash)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [AUTH_USER_TYPE_INSTITUTION_STAFF, username, cleanAdminEmail, password_hash]
        )
        const authUserId = authRes.rows[0]?.id

        if (authUserId && adminRoleId) {
          await client.query(
            `INSERT INTO users (auth_id, institution_id, branch_id, role_id, email, full_name, phone_number, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')`,
            [
              authUserId,
              institutionId,
              branchId,
              adminRoleId,
              cleanAdminEmail,
              adminFullName?.trim() || "Branch Admin",
              adminPhone?.trim() || null,
            ]
          )
        }
      }

      return branch
    })

    return NextResponse.json({ success: true, branch: createdBranch }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating branch:", error)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A branch with this code or email already exists for this institution." },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: error.message || "Failed to create branch" },
      { status: 500 }
    )
  }
}
