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
    [authUserId],
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
    [actor.role_id, actor.branch_id, permission],
  )
  return permRes.rowCount > 0
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const url = new URL(req.url)
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "500", 10), 1), 5000)
  const status = (url.searchParams.get("status") || "").trim()
  const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
  const product = (url.searchParams.get("product_id") || "").trim()
  const clientIdsRaw = (url.searchParams.get("client_ids") || "").trim()
  const clientIds = clientIdsRaw ? clientIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
  const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
  const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
  const approvedDateStart = (url.searchParams.get("approvedDateStart") || "").trim()
  const approvedDateEnd = (url.searchParams.get("approvedDateEnd") || "").trim()
  const disbursedDateStart = (url.searchParams.get("disbursedDateStart") || "").trim()
  const disbursedDateEnd = (url.searchParams.get("disbursedDateEnd") || "").trim()
  const branchesRaw = (url.searchParams.get("branches") || "").trim()
  const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

  const result = await runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return { error: "user_not_linked" as const }
    const allowed = await hasPermission(client, actor, "view_sacco_loans")
    if (!allowed) return { error: "missing_permission:view_sacco_loans" as const }

    const role = String(actor.role || "").trim().toLowerCase()
    const isSuperAdmin = role === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

    let where = "l.institution_id = $1"
    const params: unknown[] = [actor.institution_id]
    let idx = 2

    if (!isSuperAdmin) {
      where += ` AND l.branch_id = $${idx++}`
      params.push(actor.branch_id)
    } else if (selectedBranchIds.length > 0) {
      where += ` AND l.branch_id = ANY($${idx++}::uuid[])`
      params.push(selectedBranchIds)
    }
    if (status) {
      where += ` AND l.status = $${idx++}`
      params.push(status)
    }
    if (loanType) {
      where += ` AND lower(l.loan_type) = $${idx++}`
      params.push(loanType)
    }
    if (product) {
      where += ` AND lower(coalesce(l.loan_product, '')) = $${idx++}`
      params.push(product.toLowerCase())
    }
    if (clientIds.length > 0) {
      where += ` AND l.third_party_agent_id = ANY($${idx++}::uuid[])`
      params.push(clientIds)
    }
    if (applicationDateStart) {
      where += ` AND l.application_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(applicationDateStart)
    }
    if (applicationDateEnd) {
      where += ` AND l.application_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(applicationDateEnd)
    }
    if (approvedDateStart) {
      where += ` AND l.approved_at IS NOT NULL AND l.approved_at >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(approvedDateStart)
    }
    if (approvedDateEnd) {
      where += ` AND l.approved_at IS NOT NULL AND l.approved_at <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(approvedDateEnd)
    }
    if (disbursedDateStart) {
      where += ` AND l.disbursement_date IS NOT NULL AND l.disbursement_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(disbursedDateStart)
    }
    if (disbursedDateEnd) {
      where += ` AND l.disbursement_date IS NOT NULL AND l.disbursement_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
      params.push(disbursedDateEnd)
    }

    params.push(pageSize)
    const rowsRes = await client.query(
      `SELECT
         l.id,
         l.third_party_agent_id,
         l.loan_product,
         l.principal_amount,
         l.interest_rate,
         l.tenure_months,
         l.outstanding_balance,
         l.status,
         l.loan_type,
         l.application_date,
         l.approved_at,
         l.disbursement_date,
         l.next_payment_date,
         l.created_by,
         c.name AS client_name,
         c.phone AS client_phone
       FROM institution_loans l
       LEFT JOIN third_party_agents c ON c.id = l.third_party_agent_id
       WHERE ${where}
       ORDER BY l.application_date DESC, l.created_at DESC
       LIMIT $${idx}`,
      params,
    )

    const rows = rowsRes.rows as Array<Record<string, unknown>>
    const loanIds = rows.map((r) => String(r.id || "")).filter(Boolean)
    const createdByIds = [...new Set(rows.map((r) => String(r.created_by || "")).filter(Boolean))]

    let creatorMap: Record<string, string> = {}
    if (createdByIds.length > 0) {
      const cRes = await client.query(`SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`, [createdByIds])
      creatorMap = Object.fromEntries(cRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
    }

    const repaymentMap: Record<string, { totalAmountPaid: number; overdue: boolean; lateAvg: number }> = {}
    if (loanIds.length > 0) {
      const repRes = await client.query(
        `SELECT loan_id, due_date, amount_paid, payment_date, status
         FROM institution_loan_repayments
         WHERE loan_id = ANY($1::uuid[])`,
        [loanIds],
      )
      const today = new Date().toISOString().slice(0, 10)
      const lateDaysByLoan: Record<string, number[]> = {}
      for (const loanId of loanIds) {
        repaymentMap[loanId] = { totalAmountPaid: 0, overdue: false, lateAvg: 0 }
      }
      for (const row of repRes.rows as Array<Record<string, unknown>>) {
        const loanId = String(row.loan_id || "")
        if (!loanId || !repaymentMap[loanId]) continue
        repaymentMap[loanId].totalAmountPaid += Number(row.amount_paid || 0)
        const dueDate = String(row.due_date || "").slice(0, 10)
        const payDate = String(row.payment_date || "").slice(0, 10)
        const repStatus = String(row.status || "")
        if (dueDate && repStatus !== "Paid" && repStatus !== "Completed" && dueDate < today) {
          repaymentMap[loanId].overdue = true
        }
        if (dueDate && payDate) {
          const dueTs = new Date(`${dueDate}T00:00:00`).getTime()
          const payTs = new Date(`${payDate}T00:00:00`).getTime()
          if (Number.isFinite(dueTs) && Number.isFinite(payTs)) {
            const days = Math.round((payTs - dueTs) / (1000 * 60 * 60 * 24))
            if (days > 0) {
              if (!lateDaysByLoan[loanId]) lateDaysByLoan[loanId] = []
              lateDaysByLoan[loanId].push(days)
            }
          }
        }
      }
      for (const loanId of loanIds) {
        const arr = lateDaysByLoan[loanId] || []
        repaymentMap[loanId].lateAvg = arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0
      }
    }

    const items = rows.map((row) => {
      const id = String(row.id || "")
      const repayment = repaymentMap[id] || { totalAmountPaid: 0, overdue: false, lateAvg: 0 }
      const totalPaid = Number(repayment.totalAmountPaid || 0)
      const outstanding = Number(row.outstanding_balance || 0)
      return {
        id,
        application_id: `SACCO-${id.slice(0, 8).toUpperCase()}`,
        memberName: String(row.client_name || ""),
        memberNumber: String(row.client_phone || ""),
        productName: String(row.loan_product || ""),
        principal_amount: Number(row.principal_amount || 0),
        interest_rate: Number(row.interest_rate || 0),
        tenure_months: Number(row.tenure_months || 0),
        outstanding_balance: outstanding,
        status: String(row.status || ""),
        loan_type: String(row.loan_type || "normal"),
        application_date: row.application_date ? String(row.application_date) : null,
        reviewed_at: null,
        approved_at: row.approved_at ? String(row.approved_at) : null,
        disbursed_at: row.disbursement_date ? String(row.disbursement_date) : null,
        reviewed_by_name: null,
        approved_by_name: null,
        created_by_name: creatorMap[String(row.created_by || "")] || null,
        disbursed_by: [],
        guarantors: [],
        total_amount_paid: totalPaid,
        total_interest: Math.max(0, totalPaid + outstanding - Number(row.principal_amount || 0)),
        penalties_collected: 0,
        late_pay_days_avg: Number(repayment.lateAvg || 0),
        early_payments: 0,
        overdue: Boolean(repayment.overdue),
        next_payment_date: row.next_payment_date ? String(row.next_payment_date) : null,
        disbursement_date: row.disbursement_date ? String(row.disbursement_date) : null,
      }
    })

    const principalBooked = items.reduce((s, i) => s + Number(i.principal_amount || 0), 0)
    const outstanding = items.reduce((s, i) => s + Number(i.outstanding_balance || 0), 0)
    const totalAmountPaid = items.reduce((s, i) => s + Number(i.total_amount_paid || 0), 0)
    const totalInterest = items.reduce((s, i) => s + Number(i.total_interest || 0), 0)
    const overdue = items.filter((i) => i.overdue).length
    const defaulted = items.filter((i) => i.status === "Defaulted").length
    const pipeline = items.filter((i) => ["Applied", "Under Review", "Reviewed"].includes(i.status)).length

    return {
      total: items.length,
      items,
      summary: {
        principal_booked: principalBooked,
        outstanding,
        total_amount_paid: totalAmountPaid,
        total_interest: totalInterest,
        total_penalties_collected: 0,
        total_early_payments: 0,
        avg_late_pay_days: items.length ? items.reduce((s, i) => s + Number(i.late_pay_days_avg || 0), 0) / items.length : 0,
        with_balance: items.filter((i) => Number(i.outstanding_balance || 0) > 0).length,
        overdue,
        defaulted,
        pipeline,
      },
    }
  })

  if (result && "error" in result) {
    const statusCode = result.error === "missing_permission:view_sacco_loans" ? 403 : result.error === "user_not_linked" ? 403 : 400
    return NextResponse.json({ error: result.error }, { status: statusCode })
  }
  return NextResponse.json(result)
}
