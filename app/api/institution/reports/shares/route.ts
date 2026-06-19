import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false
  const permRes = await client.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "5000", 10), 1), 5000)
    const memberType = (url.searchParams.get("member_type") || "").trim()
    const purchaseDateStart = (url.searchParams.get("purchaseDateStart") || "").trim()
    const purchaseDateEnd = (url.searchParams.get("purchaseDateEnd") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canViewShares = await hasPermission(client, actor, "view_members")
      if (!canViewShares) return { error: "missing_permission:view_members" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      if (role !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let shareWhere = "1=1"
      const shareParams: unknown[] = []
      let sIdx = 1
      if (purchaseDateStart) {
        shareWhere += ` AND ms.purchase_date >= (($${sIdx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        shareParams.push(purchaseDateStart)
      }
      if (purchaseDateEnd) {
        shareWhere += ` AND ms.purchase_date <= (($${sIdx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        shareParams.push(purchaseDateEnd)
      }

      let memberWhere = "m.institution_id = $1 AND COALESCE(sa.number_of_shares,0) > 0"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (role !== "super_admin") {
        memberWhere += ` AND m.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        memberWhere += ` AND m.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }
      if (memberType && memberType !== "all") {
        memberWhere += ` AND m.member_type = $${idx++}::member_type`
        params.push(memberType)
      }
      if (search) {
        memberWhere += ` AND (m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }

      params.push(pageSize)
      const rowsRes = await client.query(
        `WITH shares_agg AS (
           SELECT
             ms.member_id,
             COALESCE(SUM(ms.number_of_shares), 0)::int AS number_of_shares,
             COALESCE(MAX(ms.share_value), 0)::numeric AS share_value,
             COALESCE(SUM(ms.total_value), 0)::numeric AS total_share_value,
             MIN(ms.purchase_date) AS first_purchase_date,
             MAX(ms.purchase_date) AS last_purchase_date
           FROM member_shares ms
           WHERE ${shareWhere}
           GROUP BY ms.member_id
         )
         SELECT
           m.id,
           m.full_name,
           m.member_number,
           m.phone_number,
           m.member_type,
           b.name AS branch_name,
           sa.number_of_shares,
           sa.share_value,
           sa.total_share_value,
           sa.first_purchase_date,
           sa.last_purchase_date
         FROM members m
         JOIN shares_agg sa ON sa.member_id = m.id
         LEFT JOIN branches b ON b.id = m.branch_id
         WHERE ${memberWhere}
         ORDER BY sa.total_share_value DESC, m.full_name
         LIMIT $${idx}`,
        [...shareParams, ...params]
      )

      const items = rowsRes.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id || ""),
        full_name: String(r.full_name || ""),
        member_number: String(r.member_number || ""),
        phone_number: String(r.phone_number || ""),
        member_type: String(r.member_type || ""),
        branch_name: String(r.branch_name || ""),
        number_of_shares: Number(r.number_of_shares || 0),
        share_value: Number(r.share_value || 0),
        total_share_value: Number(r.total_share_value || 0),
        first_purchase_date: r.first_purchase_date,
        last_purchase_date: r.last_purchase_date,
      }))

      const totalMembers = items.length
      const totalShares = items.reduce((s, i) => s + Number(i.number_of_shares || 0), 0)
      const totalShareValue = items.reduce((s, i) => s + Number(i.total_share_value || 0), 0)
      const avgSharesPerMember = totalMembers > 0 ? totalShares / totalMembers : 0

      return {
        total: totalMembers,
        items,
        summary: {
          total_members: totalMembers,
          total_shares: totalShares,
          total_share_value: totalShareValue,
          avg_shares_per_member: avgSharesPerMember,
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode = code.startsWith("missing_permission:") ? 403 : code === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: code }, { status: statusCode })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
