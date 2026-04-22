import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

type LoanReportItem = {
  id: string
  application_id: string
  memberName: string
  memberNumber: string
  productName: string
  principal_amount: number
  interest_rate: number
  tenure_months: number
  outstanding_balance: number
  status: string
  loan_type: string
  application_date: string | null
  reviewed_at: string | null
  approved_at: string | null
  disbursed_at: string | null
  reviewed_by_name: string | null
  next_payment_date: string | null
  disbursement_date: string | null
  approved_by_name: string | null
  created_by_name: string | null
  disbursed_by: string[]
  guarantors: string[]
  total_amount_paid: number
  total_interest: number
  penalties_collected: number
  late_pay_days_avg: number
  early_payments: number
  overdue: boolean
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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
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
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function parseDateOnly(v: unknown): number | null {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    const t = new Date(`${y}-${m}-${d}T12:00:00`).getTime()
    return Number.isFinite(t) ? t : null
  }
  const s = String(v || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = new Date(`${s}T12:00:00`).getTime()
  return Number.isFinite(t) ? t : null
}

function toDateOnlyString(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  const raw = String(v).trim()
  if (!raw) return null
  if (raw.includes("T")) {
    const s = raw.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, "0")
  const d = String(parsed.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loan_reports.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loan_reports.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const status = (url.searchParams.get("status") || "").trim()
    const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
    const productIdRaw = (url.searchParams.get("product_id") || "").trim()
    const selectedProductIds = productIdRaw ? productIdRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const reviewedDateStart = (url.searchParams.get("reviewedDateStart") || "").trim()
    const reviewedDateEnd = (url.searchParams.get("reviewedDateEnd") || "").trim()
    const approvedDateStart = (url.searchParams.get("approvedDateStart") || "").trim()
    const approvedDateEnd = (url.searchParams.get("approvedDateEnd") || "").trim()
    const disbursedDateStart = (url.searchParams.get("disbursedDateStart") || "").trim()
    const disbursedDateEnd = (url.searchParams.get("disbursedDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }

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
      if (selectedProductIds.length === 1) {
        where += ` AND l.loan_product_id = $${idx++}`
        params.push(selectedProductIds[0])
      } else if (selectedProductIds.length > 1) {
        where += ` AND l.loan_product_id = ANY($${idx}::uuid[])`
        params.push(selectedProductIds)
        idx++
      }
      if (loanType) {
        where += ` AND lower(l.loan_type) = $${idx++}`
        params.push(loanType)
      }
      if (applicationDateStart) {
        where += ` AND l.application_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(applicationDateStart)
        idx++
      }
      if (applicationDateEnd) {
        where += ` AND l.application_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(applicationDateEnd)
        idx++
      }
      if (reviewedDateStart) {
        where += ` AND l.reviewed_at IS NOT NULL AND l.reviewed_at >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(reviewedDateStart)
        idx++
      }
      if (reviewedDateEnd) {
        where += ` AND l.reviewed_at IS NOT NULL AND l.reviewed_at <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(reviewedDateEnd)
        idx++
      }
      if (approvedDateStart) {
        where += ` AND l.approved_at IS NOT NULL AND l.approved_at >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(approvedDateStart)
        idx++
      }
      if (approvedDateEnd) {
        where += ` AND l.approved_at IS NOT NULL AND l.approved_at <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(approvedDateEnd)
        idx++
      }
      if (disbursedDateStart) {
        where += ` AND EXISTS (
          SELECT 1
          FROM senteloans_loan_disbursements ld
          WHERE ld.loan_id = l.id
            AND ld.disbursement_date IS NOT NULL
            AND ld.disbursement_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)
        )`
        params.push(disbursedDateStart)
        idx++
      }
      if (disbursedDateEnd) {
        where += ` AND EXISTS (
          SELECT 1
          FROM senteloans_loan_disbursements ld
          WHERE ld.loan_id = l.id
            AND ld.disbursement_date IS NOT NULL
            AND ld.disbursement_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)
        )`
        params.push(disbursedDateEnd)
        idx++
      }

      const dataRes = await client.query(
        `SELECT
           l.id,
           l.application_id,
           l.member_id,
           l.loan_product_id,
           l.created_by,
           l.approved_by,
           l.principal_amount,
           l.interest_rate,
           l.tenure_months,
           l.outstanding_balance,
           l.status,
           l.loan_type,
           l.application_date,
           l.reviewed_at,
           l.approved_at,
           l.next_payment_date,
           l.disbursement_date,
           l.reviewed_by
         FROM senteloans_loans l
         WHERE ${where}
         ORDER BY l.application_date DESC, l.created_at DESC`,
        params
      )
      const rows = dataRes.rows

      const memberIds = [...new Set(rows.map((r: { member_id: string }) => r.member_id).filter(Boolean))]
      const productIds = [...new Set(rows.map((r: { loan_product_id: string }) => r.loan_product_id).filter(Boolean))]
      const createdByIds = [...new Set(rows.map((r: { created_by: string }) => r.created_by).filter(Boolean))]
      const approvedByIds = [...new Set(rows.map((r: { approved_by: string }) => r.approved_by).filter(Boolean))]
      const reviewedByIds = [...new Set(rows.map((r: { reviewed_by: string }) => r.reviewed_by).filter(Boolean))]
      const loanIds = [...new Set(rows.map((r: { id: string }) => r.id).filter(Boolean))]

      let memberMap: Record<string, { name: string; number?: string }> = {}
      let productMap: Record<string, string> = {}
      let creatorMap: Record<string, string> = {}
      let approvedByMap: Record<string, string> = {}
      let reviewedByMap: Record<string, string> = {}
      let disbursedByMap: Record<string, string[]> = {}
      let guarantorMap: Record<string, string[]> = {}
      let repaymentMap: Record<
        string,
        {
          totalAmountPaid: number
          totalInterest: number
          penaltiesCollected: number
          latePayDaysAvg: number
          earlyPayDaysAvg: number
          earlyPayments: number
          overdue: boolean
        }
      > = {}
      if (memberIds.length > 0) {
        const mRes = await client.query(`SELECT id, full_name, member_number FROM senteloans_members WHERE id = ANY($1::uuid[])`, [memberIds])
        memberMap = Object.fromEntries(
          mRes.rows.map((m: { id: string; full_name: string; member_number: string }) => [m.id, { name: m.full_name, number: m.member_number }])
        )
      }
      if (productIds.length > 0) {
        const pRes = await client.query(`SELECT id, product_name FROM senteloans_loan_products WHERE id = ANY($1::uuid[])`, [productIds])
        productMap = Object.fromEntries(pRes.rows.map((p: { id: string; product_name: string }) => [p.id, p.product_name]))
      }
      if (createdByIds.length > 0) {
        const uRes = await client.query(`SELECT id, full_name FROM senteloans_users WHERE id = ANY($1::uuid[])`, [createdByIds])
        creatorMap = Object.fromEntries(uRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
      }
      if (approvedByIds.length > 0) {
        const aRes = await client.query(`SELECT id, full_name FROM senteloans_users WHERE id = ANY($1::uuid[])`, [approvedByIds])
        approvedByMap = Object.fromEntries(aRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
      }
      if (reviewedByIds.length > 0) {
        const rRes = await client.query(`SELECT id, full_name FROM senteloans_users WHERE id = ANY($1::uuid[])`, [reviewedByIds])
        reviewedByMap = Object.fromEntries(rRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
      }
      if (loanIds.length > 0) {
        const dRes = await client.query(
          `SELECT loan_id, created_by
           FROM senteloans_loan_disbursements
           WHERE loan_id = ANY($1::uuid[])
             AND created_by IS NOT NULL
           ORDER BY loan_id, created_at ASC`,
          [loanIds]
        )
        const disburserIds = [...new Set(dRes.rows.map((r: { created_by: string }) => r.created_by).filter(Boolean))]
        let disburserNameMap: Record<string, string> = {}
        if (disburserIds.length > 0) {
          const duRes = await client.query(`SELECT id, full_name FROM senteloans_users WHERE id = ANY($1::uuid[])`, [disburserIds])
          disburserNameMap = Object.fromEntries(duRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
        }
        disbursedByMap = {}
        for (const row of dRes.rows as Array<{ loan_id: string; created_by: string }>) {
          const loanId = String(row.loan_id || "")
          const name = disburserNameMap[String(row.created_by || "")] || ""
          if (!loanId || !name) continue
          if (!disbursedByMap[loanId]) disbursedByMap[loanId] = []
          if (!disbursedByMap[loanId].includes(name)) disbursedByMap[loanId].push(name)
        }

        const gRes = await client.query(
          `SELECT g.loan_id, m.full_name
           FROM senteloans_loan_guarantors g
           JOIN senteloans_members m ON m.id = g.guarantor_member_id
           WHERE g.loan_id = ANY($1::uuid[])
           ORDER BY g.loan_id, g.created_at ASC`,
          [loanIds]
        )
        guarantorMap = {}
        for (const row of gRes.rows as Array<{ loan_id: string; full_name: string }>) {
          if (!guarantorMap[row.loan_id]) guarantorMap[row.loan_id] = []
          if (guarantorMap[row.loan_id].length < 4) guarantorMap[row.loan_id].push(String(row.full_name || ""))
        }

        const repRes = await client.query(
          `SELECT
             loan_id,
             due_date,
             payment_date,
             amount_paid,
             interest_amount,
             total_amount,
             penalty_amount,
             status
           FROM senteloans_loan_repayments
           WHERE loan_id = ANY($1::uuid[])`,
          [loanIds]
        )
        const today = new Date().toISOString().slice(0, 10)
        for (const loanId of loanIds) {
          repaymentMap[loanId] = {
            totalAmountPaid: 0,
            totalInterest: 0,
            penaltiesCollected: 0,
            latePayDaysAvg: 0,
            earlyPayDaysAvg: 0,
            earlyPayments: 0,
            overdue: false,
          }
        }

        const lateDaysByLoan: Record<string, number[]> = {}
        const earlyDaysByLoan: Record<string, number[]> = {}

        for (const row of repRes.rows as Array<Record<string, unknown>>) {
          const loanId = String(row.loan_id || "")
          if (!loanId || !repaymentMap[loanId]) continue

          const amountPaid = Number(row.amount_paid || 0)
          const interestAmount = Number(row.interest_amount || 0)
          const totalAmount = Number(row.total_amount || 0)
          const penaltyAmount = Number(row.penalty_amount || 0)
          const dueDate = toDateOnlyString(row.due_date) || ""
          const paymentDate = toDateOnlyString(row.payment_date) || ""
          const status = String(row.status || "")

          repaymentMap[loanId].totalAmountPaid += amountPaid
          repaymentMap[loanId].totalInterest += interestAmount
          repaymentMap[loanId].penaltiesCollected += Math.max(0, Math.min(penaltyAmount, amountPaid - totalAmount))

          if (dueDate && status !== "Paid" && dueDate < today) {
            repaymentMap[loanId].overdue = true
          }

          if (dueDate && paymentDate) {
            const dueTs = new Date(`${dueDate}T00:00:00`).getTime()
            const payTs = new Date(`${paymentDate}T00:00:00`).getTime()
            if (Number.isFinite(dueTs) && Number.isFinite(payTs)) {
              const days = Math.round((payTs - dueTs) / (1000 * 60 * 60 * 24))
              if (days > 0) {
                if (!lateDaysByLoan[loanId]) lateDaysByLoan[loanId] = []
                lateDaysByLoan[loanId].push(days)
              } else if (days < 0) {
                if (!earlyDaysByLoan[loanId]) earlyDaysByLoan[loanId] = []
                earlyDaysByLoan[loanId].push(Math.abs(days))
              }
            }
          }
        }

        for (const loanId of loanIds) {
          const late = lateDaysByLoan[loanId] || []
          const early = earlyDaysByLoan[loanId] || []
          const lateAvg = late.length > 0 ? late.reduce((s, n) => s + n, 0) / late.length : 0
          const earlyAvg = early.length > 0 ? early.reduce((s, n) => s + n, 0) / early.length : 0
          repaymentMap[loanId].latePayDaysAvg = Math.round(lateAvg * 100) / 100
          repaymentMap[loanId].earlyPayDaysAvg = Math.round(earlyAvg * 100) / 100
          repaymentMap[loanId].earlyPayments = early.length
        }
      }

      const items: LoanReportItem[] = rows.map((row: Record<string, unknown>) => ({
        ...(function () {
          const loanId = String(row.id || "")
          const guars = guarantorMap[loanId] || []
          const rep = repaymentMap[loanId] || {
            totalAmountPaid: 0,
            totalInterest: 0,
            penaltiesCollected: 0,
            latePayDaysAvg: 0,
            earlyPayDaysAvg: 0,
            earlyPayments: 0,
            overdue: false,
          }
          return {
            approved_by_name: approvedByMap[String(row.approved_by || "")] || null,
            reviewed_by_name: reviewedByMap[String(row.reviewed_by || "")] || null,
            created_by_name: creatorMap[String(row.created_by || "")] || null,
            disbursed_by: disbursedByMap[loanId] || [],
            guarantors: guars,
            total_amount_paid: Math.round(rep.totalAmountPaid * 100) / 100,
            total_interest: Math.round(rep.totalInterest * 100) / 100,
            penalties_collected: Math.round(rep.penaltiesCollected * 100) / 100,
            late_pay_days_avg: rep.latePayDaysAvg,
            early_payments: rep.earlyPayments,
            overdue: rep.overdue,
          }
        })(),
        id: String(row.id || ""),
        application_id: String(row.application_id || ""),
        memberName: memberMap[String(row.member_id || "")]?.name || "",
        memberNumber: memberMap[String(row.member_id || "")]?.number || "",
        productName: productMap[String(row.loan_product_id || "")] || "",
        principal_amount: Number(row.principal_amount || 0),
        interest_rate: Number(row.interest_rate || 0),
        tenure_months: Number(row.tenure_months || 0),
        outstanding_balance: Number(row.outstanding_balance || 0),
        status: String(row.status || ""),
        loan_type: String(row.loan_type || "normal"),
        application_date: toDateOnlyString(row.application_date),
        reviewed_at: toDateOnlyString(row.reviewed_at),
        approved_at: toDateOnlyString(row.approved_at),
        disbursed_at: toDateOnlyString(row.disbursement_date),
        next_payment_date: toDateOnlyString(row.next_payment_date),
        disbursement_date: toDateOnlyString(row.disbursement_date),
      }))

      const activeLike = new Set(["Partially Disbursed", "Fully Disbursed", "Active"])
      const today = parseDateOnly(new Date().toISOString().slice(0, 10))
      const principalBooked = items.reduce((s, l) => s + Number(l.principal_amount || 0), 0)
      const outstanding = items.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0)
      const totalAmountPaid = items.reduce((s, l) => s + Number(l.total_amount_paid || 0), 0)
      const totalInterest = items.reduce((s, l) => s + Number(l.total_interest || 0), 0)
      const totalPenaltiesCollected = items.reduce((s, l) => s + Number(l.penalties_collected || 0), 0)
      const totalEarlyPayments = items.reduce((s, l) => s + Number(l.early_payments || 0), 0)
      const withBalance = items.filter((l) => activeLike.has(l.status) && Number(l.outstanding_balance || 0) > 0).length
      const overdue = items.filter((l) => l.overdue).length
      const lateAvgSource = items.map((l) => Number(l.late_pay_days_avg || 0)).filter((v) => v > 0)
      const avgLatePayDays =
        lateAvgSource.length > 0 ? Math.round((lateAvgSource.reduce((s, v) => s + v, 0) / lateAvgSource.length) * 100) / 100 : 0
      const defaulted = items.filter((l) => l.status === "Defaulted").length
      const pipeline = items.filter((l) => ["Applied", "Under Review", "Reviewed"].includes(l.status)).length

      return {
        total: items.length,
        items,
        summary: {
          principal_booked: principalBooked,
          outstanding,
          total_amount_paid: totalAmountPaid,
          total_interest: totalInterest,
          total_penalties_collected: totalPenaltiesCollected,
          total_early_payments: totalEarlyPayments,
          avg_late_pay_days: avgLatePayDays,
          with_balance: withBalance,
          overdue,
          defaulted,
          pipeline,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_loans" ? 403 :
        result.error === "user_not_linked" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "loan_reports.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "loan_reports.success", { method: "GET", apiPath, status: 200, count: result.items.length })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loan_reports.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

