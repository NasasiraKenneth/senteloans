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
     WHERE u.supabase_user_id = $1
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
    const status = (url.searchParams.get("status") || "").trim().toLowerCase()
    const invoiceType = (url.searchParams.get("invoice_type") || "").trim()
    const targetType = (url.searchParams.get("target_type") || "").trim().toLowerCase()
    const memberIdsRaw = (url.searchParams.get("member_ids") || "").trim()
    const clientIdsRaw = (url.searchParams.get("client_ids") || "").trim()
    const memberIds = memberIdsRaw ? memberIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const clientIds = clientIdsRaw ? clientIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const invoiceDateStart = (url.searchParams.get("invoiceDateStart") || "").trim()
    const invoiceDateEnd = (url.searchParams.get("invoiceDateEnd") || "").trim()
    const dueDateStart = (url.searchParams.get("dueDateStart") || "").trim()
    const dueDateEnd = (url.searchParams.get("dueDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_invoices")
      if (!allowed) return { error: "missing_permission:view_invoices" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "i.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (!isSuperAdmin) {
        where += ` AND i.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND i.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }
      if (status && status !== "all") {
        where += ` AND lower(i.status) = $${idx++}`
        params.push(status)
      }
      if (invoiceType && invoiceType !== "all") {
        where += ` AND lower(i.invoice_type) = lower($${idx++})`
        params.push(invoiceType)
      }
      if (targetType === "member") where += " AND i.member_id IS NOT NULL"
      if (targetType === "client") where += " AND i.client_id IS NOT NULL"
      if (memberIds.length > 0) {
        where += ` AND i.member_id = ANY($${idx++}::uuid[])`
        params.push(memberIds)
      }
      if (clientIds.length > 0) {
        where += ` AND i.client_id = ANY($${idx++}::uuid[])`
        params.push(clientIds)
      }
      if (invoiceDateStart) {
        where += ` AND i.invoice_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(invoiceDateStart)
      }
      if (invoiceDateEnd) {
        where += ` AND i.invoice_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(invoiceDateEnd)
      }
      if (dueDateStart) {
        where += ` AND i.invoice_due >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(dueDateStart)
      }
      if (dueDateEnd) {
        where += ` AND i.invoice_due <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(dueDateEnd)
      }

      const rowsRes = await client.query(
        `SELECT
           i.id,
           i.invoice_number,
           i.invoice_date,
           i.invoice_due,
           i.invoice_type,
           i.status,
           i.subtotal,
           i.vat,
           i.total_amount,
           b.name AS branch_name,
           m.full_name AS member_name,
           c.name AS client_name
         FROM invoices i
         LEFT JOIN branches b ON b.id = i.branch_id
         LEFT JOIN members m ON m.id = i.member_id
         LEFT JOIN clients c ON c.id = i.client_id
         WHERE ${where}
         ORDER BY i.invoice_date DESC
         LIMIT $${idx}`,
        [...params, pageSize]
      )

      const items = rowsRes.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id || ""),
        invoice_number: String(r.invoice_number || ""),
        invoice_date: r.invoice_date,
        invoice_due: r.invoice_due,
        invoice_type: String(r.invoice_type || ""),
        status: String(r.status || ""),
        subtotal: Number(r.subtotal || 0),
        vat: Number(r.vat || 0),
        total_amount: Number(r.total_amount || 0),
        branch_name: String(r.branch_name || ""),
        assigned_to: String(r.member_name || r.client_name || ""),
        target_type: r.member_name ? "Member" : r.client_name ? "Client" : "—",
      }))

      const total = items.length
      const totalAmount = items.reduce((s, i) => s + Number(i.total_amount || 0), 0)
      const paidCount = items.filter((i) => String(i.status || "").toLowerCase() === "paid").length
      const overdueCount = items.filter((i) => String(i.status || "").toLowerCase() === "overdue").length
      const pendingCount = items.filter((i) => {
        const st = String(i.status || "").toLowerCase()
        return st === "draft" || st === "sent"
      }).length

      return {
        items,
        summary: {
          total_invoices: total,
          total_amount: totalAmount,
          paid_invoices: paidCount,
          overdue_invoices: overdueCount,
          pending_invoices: pendingCount,
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode = code.startsWith("missing_permission:") ? 403 : 400
      return NextResponse.json({ error: code }, { status: statusCode })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
