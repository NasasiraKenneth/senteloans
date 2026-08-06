import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await runWithoutAuth(async (client) => {
      // 1. Fetch institution & primary branch details
      const instRes = await client.query(
        `SELECT 
           i.id, 
           i.name, 
           i.type, 
           i.status, 
           i.registration_number, 
           i.license_number, 
           i.website, 
           i.logo, 
           i.created_at, 
           i.updated_at,
           b.name AS branch_name,
           b.branch_code AS branch_code,
           bt.name AS branch_type,
           b.address AS address, 
           b.phone_number AS phone_number, 
           b.email AS email, 
           b.established_date AS established_date 
         FROM institutions i
         LEFT JOIN LATERAL (
           SELECT id, name, branch_code, branch_type_id, address, phone_number, email, established_date
           FROM branches
           WHERE institution_id = i.id
           ORDER BY created_at ASC
           LIMIT 1
         ) b ON true
         LEFT JOIN branch_types bt ON bt.id = b.branch_type_id
         WHERE i.id = $1`,
        [id]
      )
      const institution = instRes.rows[0] || null
      if (!institution) return null

      // 2. Fetch branches list
      const branchesRes = await client.query(
        `SELECT 
           b.id, 
           b.name, 
           b.branch_code, 
           b.branch_type_id,
           b.address, 
           b.phone_number, 
           b.email, 
           b.status, 
           b.created_at,
           bt.name AS branch_type
         FROM branches b
         LEFT JOIN branch_types bt ON bt.id = b.branch_type_id
         WHERE b.institution_id = $1
         ORDER BY b.created_at ASC`,
        [id]
      )

      // 3. Compute real-time analytics counts (Branches, Members, Staff, Avg Monthly Messages)
      const countsRes = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM branches WHERE institution_id = $1) AS branches_count,
           (SELECT COUNT(*)::int FROM members WHERE institution_id = $1) AS members_count,
           (SELECT COUNT(*)::int FROM users WHERE institution_id = $1) AS staff_users_count,
           COALESCE(
             (
               SELECT ROUND(COUNT(*)::numeric / GREATEST(1, COUNT(DISTINCT DATE_TRUNC('month', created_at))))::int
               FROM messages
               WHERE institution_id = $1
             ), 
             0
           ) AS avg_monthly_messages`,
        [id]
      )

      const counts = countsRes.rows[0] || {}

      // 4. Monthly Growth Analytics (Last 6 Months)
      const growthRes = await client.query(
        `SELECT 
           TO_CHAR(d.month, 'Mon') AS month,
           COALESCE(m.member_count, 0)::int AS members,
           COALESCE(msg.msg_count, 0)::int AS messages
         FROM generate_series(
           DATE_TRUNC('month', NOW() - INTERVAL '5 months'),
           DATE_TRUNC('month', NOW()),
           INTERVAL '1 month'
         ) d(month)
         LEFT JOIN (
           SELECT DATE_TRUNC('month', created_at) AS m_month, COUNT(*) AS member_count
           FROM members
           WHERE institution_id = $1
           GROUP BY m_month
         ) m ON m.m_month = d.month
         LEFT JOIN (
           SELECT DATE_TRUNC('month', created_at) AS msg_month, COUNT(*) AS msg_count
           FROM messages
           WHERE institution_id = $1
           GROUP BY msg_month
         ) msg ON msg.msg_month = d.month
         ORDER BY d.month ASC`,
        [id]
      )

      return {
        institution,
        branches: branchesRes.rows,
        analytics: {
          branchesCount: counts.branches_count || branchesRes.rows.length || 0,
          membersCount: counts.members_count || 0,
          staffUsersCount: counts.staff_users_count || 0,
          avgMonthlyMessages: Number(counts.avg_monthly_messages || 0),
          monthlyGrowth: growthRes.rows,
        },
      }
    })

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const instUpdate: Record<string, unknown> = {}
    if (typeof body.name === "string") instUpdate.name = body.name
    if (typeof body.type === "string") instUpdate.type = body.type
    if (typeof body.status === "string") instUpdate.status = body.status
    if (typeof body.registrationNumber === "string") instUpdate.registration_number = body.registrationNumber
    if (typeof body.licenseNumber === "string") instUpdate.license_number = body.licenseNumber
    if (typeof body.website === "string") instUpdate.website = body.website
    if (typeof body.logo === "string") instUpdate.logo = body.logo

    const branchUpdate: Record<string, unknown> = {}
    if (typeof body.branchName === "string") branchUpdate.name = body.branchName
    if (typeof body.email === "string") branchUpdate.email = body.email
    if (typeof body.phone === "string") branchUpdate.phone_number = body.phone
    if (typeof body.address === "string") branchUpdate.address = body.address
    if (typeof body.branch_type_id === "string" && body.branch_type_id) {
      branchUpdate.branch_type_id = body.branch_type_id
    } else if (typeof body.branchTypeId === "string" && body.branchTypeId) {
      branchUpdate.branch_type_id = body.branchTypeId
    }

    await runWithoutAuth(async (client) => {
      if (Object.keys(instUpdate).length > 0) {
        const keys = Object.keys(instUpdate)
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
        const vals = Object.values(instUpdate)
        await client.query(`UPDATE institutions SET ${setClause}, updated_at = NOW() WHERE id = $1`, [id, ...vals])
      }

      if (Object.keys(branchUpdate).length > 0) {
        const keys = Object.keys(branchUpdate)
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
        const vals = Object.values(branchUpdate)
        await client.query(
          `UPDATE branches SET ${setClause}, updated_at = NOW() WHERE id = (
             SELECT id FROM branches WHERE institution_id = $1 ORDER BY created_at ASC LIMIT 1
           )`,
          [id, ...vals]
        )
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
