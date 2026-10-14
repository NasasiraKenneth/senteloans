import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { isSuperAdmin, scopeWhere } from "@/lib/api/rbac"

export type LoanReportFilters = {
  status?: string
  loanType?: string
  productIds?: string[]
  selectedBranchIds?: string[]
  applicationDateStart?: string
  applicationDateEnd?: string
  reviewedDateStart?: string
  reviewedDateEnd?: string
  approvedDateStart?: string
  approvedDateEnd?: string
  disbursedDateStart?: string
  disbursedDateEnd?: string
  search?: string
  overdueOnly?: boolean
}

export type LoanReportItem = {
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

export type LoanReportSummary = {
  principal_booked: number
  principal_disbursed: number
  outstanding: number
  total_amount_paid: number
  total_interest: number
  total_penalties_collected: number
  total_early_payments: number
  avg_late_pay_days: number
  with_balance: number
  overdue: number
  defaulted: number
  pipeline: number
}

export type LoanReportBreakdown = {
  by_status: Array<{ status: string; count: number; principal: number; outstanding: number }>
  by_product: Array<{ name: string; count: number; outstanding: number }>
  by_loan_type: Array<{ loan_type: string; count: number; principal: number }>
  by_month: Array<{ month: string; count: number; principal: number }>
  collections_by_month: Array<{ month: string; interest_collected: number; penalties_collected: number }>
}

const DISBURSED_STATUSES = ["Partially Disbursed", "Fully Disbursed", "Active", "Closed", "Defaulted"] as const
const ACTIVE_LIKE = ["Partially Disbursed", "Fully Disbursed", "Active"] as const
const PIPELINE_STATUSES = ["Applied", "Under Review", "Reviewed"] as const

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

export function buildLoanReportWhere(actor: ActorContext, filters: LoanReportFilters) {
  const scoped = scopeWhere({
    tableAlias: "l",
    actor,
    selectedBranchIds: filters.selectedBranchIds ?? [],
    startIndex: 1,
  })

  let where = scoped.where
  const params = [...scoped.values]
  let idx = scoped.nextIndex

  if (filters.status) {
    where += ` AND l.status = $${idx++}`
    params.push(filters.status)
  }
  const productIds = filters.productIds ?? []
  if (productIds.length === 1) {
    where += ` AND l.loan_product_id = $${idx++}`
    params.push(productIds[0])
  } else if (productIds.length > 1) {
    where += ` AND l.loan_product_id = ANY($${idx++}::uuid[])`
    params.push(productIds)
  }
  if (filters.loanType) {
    where += ` AND lower(l.loan_type) = $${idx++}`
    params.push(filters.loanType)
  }
  if (filters.applicationDateStart) {
    where += ` AND l.application_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.applicationDateStart)
    idx++
  }
  if (filters.applicationDateEnd) {
    where += ` AND l.application_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.applicationDateEnd)
    idx++
  }
  if (filters.reviewedDateStart) {
    where += ` AND l.reviewed_at IS NOT NULL AND l.reviewed_at >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.reviewedDateStart)
    idx++
  }
  if (filters.reviewedDateEnd) {
    where += ` AND l.reviewed_at IS NOT NULL AND l.reviewed_at <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.reviewedDateEnd)
    idx++
  }
  if (filters.approvedDateStart) {
    where += ` AND l.approved_at IS NOT NULL AND l.approved_at >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.approvedDateStart)
    idx++
  }
  if (filters.approvedDateEnd) {
    where += ` AND l.approved_at IS NOT NULL AND l.approved_at <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(filters.approvedDateEnd)
    idx++
  }
  if (filters.disbursedDateStart) {
    where += ` AND EXISTS (
      SELECT 1 FROM loan_disbursements ld
      WHERE ld.loan_id = l.id
        AND ld.disbursement_date IS NOT NULL
        AND ld.disbursement_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)
    )`
    params.push(filters.disbursedDateStart)
    idx++
  }
  if (filters.disbursedDateEnd) {
    where += ` AND EXISTS (
      SELECT 1 FROM loan_disbursements ld
      WHERE ld.loan_id = l.id
        AND ld.disbursement_date IS NOT NULL
        AND ld.disbursement_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)
    )`
    params.push(filters.disbursedDateEnd)
    idx++
  }
  if (filters.search) {
    where += ` AND (
      l.application_id ILIKE $${idx}
      OR EXISTS (
        SELECT 1 FROM members m
        WHERE m.id = l.member_id
          AND (m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})
      )
    )`
    params.push(`%${filters.search}%`)
    idx++
  }
  if (filters.overdueOnly) {
    where += ` AND EXISTS (
      SELECT 1 FROM loan_repayments lr
      WHERE lr.loan_id = l.id
        AND lr.status != 'Paid'
        AND lr.due_date < CURRENT_DATE
    )`
  }

  return { where, params, nextIndex: idx }
}

export async function fetchLoanReportCurrency(client: PoolClient, actor: ActorContext): Promise<string> {
  const branchId = actor.branch_id
  if (!branchId) {
    if (!isSuperAdmin(actor)) return "UGX"
    const cfgRes = await client.query(
      `SELECT c.currency FROM config c
       JOIN branches b ON b.id = c.branch_id
       WHERE b.institution_id = $1
       ORDER BY b.name ASC
       LIMIT 1`,
      [actor.institution_id],
    )
    return String(cfgRes.rows[0]?.currency || "UGX")
  }
  const cfgRes = await client.query(`SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`, [branchId])
  return String(cfgRes.rows[0]?.currency || "UGX")
}

export async function fetchLoanReportAggregates(
  client: PoolClient,
  where: string,
  params: unknown[],
): Promise<{ summary: LoanReportSummary; breakdown: LoanReportBreakdown }> {
  const disbursedList = DISBURSED_STATUSES.map((s) => `'${s}'`).join(", ")
  const activeList = ACTIVE_LIKE.map((s) => `'${s}'`).join(", ")
  const pipelineList = PIPELINE_STATUSES.map((s) => `'${s}'`).join(", ")

  const summaryRes = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(l.principal_amount), 0)::numeric AS principal_booked,
       COALESCE(SUM(l.principal_amount) FILTER (WHERE l.status IN (${disbursedList})), 0)::numeric AS principal_disbursed,
       COALESCE(SUM(l.outstanding_balance), 0)::numeric AS outstanding,
       COALESCE(SUM(rep.total_paid), 0)::numeric AS total_amount_paid,
       COALESCE(SUM(rep.total_interest), 0)::numeric AS total_interest,
       COALESCE(SUM(rep.penalties), 0)::numeric AS total_penalties_collected,
       COALESCE(SUM(rep.early_payments), 0)::int AS total_early_payments,
       COUNT(*) FILTER (
         WHERE l.status IN (${activeList}) AND l.outstanding_balance > 0
       )::int AS with_balance,
       COUNT(DISTINCT l.id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM loan_repayments lr
           WHERE lr.loan_id = l.id AND lr.status != 'Paid' AND lr.due_date < CURRENT_DATE
         )
       )::int AS overdue,
       COUNT(*) FILTER (WHERE l.status = 'Defaulted')::int AS defaulted,
       COUNT(*) FILTER (WHERE l.status IN (${pipelineList}))::int AS pipeline
     FROM loans l
     LEFT JOIN (
       SELECT
         loan_id,
         COALESCE(SUM(amount_paid), 0)::numeric AS total_paid,
         COALESCE(SUM(interest_amount), 0)::numeric AS total_interest,
         COALESCE(SUM(GREATEST(0, penalty_amount)), 0)::numeric AS penalties,
         COUNT(*) FILTER (
           WHERE payment_date IS NOT NULL AND due_date IS NOT NULL AND payment_date < due_date
         )::int AS early_payments
       FROM loan_repayments
       GROUP BY loan_id
     ) rep ON rep.loan_id = l.id
     WHERE ${where}`,
    params,
  )

  const row = summaryRes.rows[0] || {}
  const lateAvgRes = await client.query(
    `SELECT COALESCE(AVG(days_late), 0)::numeric AS avg_late
     FROM (
       SELECT GREATEST(0, (lr.payment_date::date - lr.due_date::date))::int AS days_late
       FROM loan_repayments lr
       INNER JOIN loans l ON l.id = lr.loan_id
       WHERE ${where}
         AND lr.payment_date IS NOT NULL
         AND lr.due_date IS NOT NULL
         AND lr.payment_date > lr.due_date
     ) t`,
    params,
  )

  const summary: LoanReportSummary = {
    principal_booked: Number(row.principal_booked ?? 0),
    principal_disbursed: Number(row.principal_disbursed ?? 0),
    outstanding: Number(row.outstanding ?? 0),
    total_amount_paid: Number(row.total_amount_paid ?? 0),
    total_interest: Number(row.total_interest ?? 0),
    total_penalties_collected: Number(row.total_penalties_collected ?? 0),
    total_early_payments: Number(row.total_early_payments ?? 0),
    avg_late_pay_days: Math.round(Number(lateAvgRes.rows[0]?.avg_late ?? 0) * 100) / 100,
    with_balance: Number(row.with_balance ?? 0),
    overdue: Number(row.overdue ?? 0),
    defaulted: Number(row.defaulted ?? 0),
    pipeline: Number(row.pipeline ?? 0),
  }

  const statusRes = await client.query(
    `SELECT l.status, COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal,
            COALESCE(SUM(l.outstanding_balance), 0)::numeric AS outstanding
     FROM loans l WHERE ${where}
     GROUP BY l.status ORDER BY count DESC`,
    params,
  )
  const productRes = await client.query(
    `SELECT COALESCE(lp.product_name, 'Unknown') AS name,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.outstanding_balance), 0)::numeric AS outstanding
     FROM loans l
     LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
     WHERE ${where}
     GROUP BY lp.product_name
     ORDER BY outstanding DESC
     LIMIT 8`,
    params,
  )
  const typeRes = await client.query(
    `SELECT COALESCE(l.loan_type, 'normal') AS loan_type,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal
     FROM loans l WHERE ${where}
     GROUP BY l.loan_type ORDER BY count DESC`,
    params,
  )
  const monthRes = await client.query(
    `SELECT to_char(date_trunc('month', l.application_date), 'Mon YYYY') AS month,
            date_trunc('month', l.application_date) AS sort_month,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal,
            COALESCE(SUM(l.disbursement_balance), 0)::numeric AS disbursed
     FROM loans l
     WHERE ${where} AND l.application_date >= (CURRENT_DATE - INTERVAL '12 months')
     GROUP BY date_trunc('month', l.application_date)
     ORDER BY sort_month ASC`,
    params,
  )
  const collectionsRes = await client.query(
    `SELECT to_char(date_trunc('month', lr.payment_date), 'Mon YYYY') AS month,
            date_trunc('month', lr.payment_date) AS sort_month,
            COALESCE(SUM(lr.amount_paid), 0)::numeric AS amount
     FROM loan_repayments lr
     INNER JOIN loans l ON l.id = lr.loan_id
     WHERE ${where} AND lr.payment_date >= (CURRENT_DATE - INTERVAL '12 months')
     GROUP BY date_trunc('month', lr.payment_date)
     ORDER BY sort_month ASC`,
    params,
  )

  const breakdown: LoanReportBreakdown = {
    by_status: statusRes.rows.map((r: Record<string, unknown>) => ({
      status: String(r.status || "Unknown"),
      count: Number(r.count ?? 0),
      principal: Number(r.principal ?? 0),
      outstanding: Number(r.outstanding ?? 0),
    })),
    by_product: productRes.rows.map((r: Record<string, unknown>) => ({
      name: String(r.name || "Unknown"),
      count: Number(r.count ?? 0),
      outstanding: Number(r.outstanding ?? 0),
    })),
    by_loan_type: typeRes.rows.map((r: Record<string, unknown>) => ({
      loan_type: String(r.loan_type || "normal"),
      count: Number(r.count ?? 0),
      principal: Number(r.principal ?? 0),
    })),
    by_month: monthRes.rows.map((r: Record<string, unknown>) => ({
      month: String(r.month || ""),
      count: Number(r.count ?? 0),
      principal: Number(r.principal ?? 0),
    })),
    collections_by_month: collectionsRes.rows.map((r: Record<string, unknown>) => ({
      month: String(r.month || ""),
      interest_collected: Number(r.interest_collected ?? 0),
      penalties_collected: Number(r.penalties_collected ?? 0),
    })),
  }

  return { summary, breakdown }
}

export async function enrichLoanReportRows(
  client: PoolClient,
  rows: Array<Record<string, unknown>>,
): Promise<LoanReportItem[]> {
  if (rows.length === 0) return []

  const memberIds = [...new Set(rows.map((r) => r.member_id).filter(Boolean))] as string[]
  const productIds = [...new Set(rows.map((r) => r.loan_product_id).filter(Boolean))] as string[]
  const createdByIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[]
  const approvedByIds = [...new Set(rows.map((r) => r.approved_by).filter(Boolean))] as string[]
  const reviewedByIds = [...new Set(rows.map((r) => r.reviewed_by).filter(Boolean))] as string[]
  const loanIds = [...new Set(rows.map((r) => r.id).filter(Boolean))] as string[]

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
      earlyPayments: number
      overdue: boolean
    }
  > = {}

  if (memberIds.length > 0) {
    const mRes = await client.query(`SELECT id, full_name, member_number FROM members WHERE id = ANY($1::uuid[])`, [memberIds])
    memberMap = Object.fromEntries(
      mRes.rows.map((m: { id: string; full_name: string; member_number: string }) => [m.id, { name: m.full_name, number: m.member_number }]),
    )
  }
  if (productIds.length > 0) {
    const pRes = await client.query(`SELECT id, product_name FROM loan_products WHERE id = ANY($1::uuid[])`, [productIds])
    productMap = Object.fromEntries(pRes.rows.map((p: { id: string; product_name: string }) => [p.id, p.product_name]))
  }
  if (createdByIds.length > 0) {
    const uRes = await client.query(`SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`, [createdByIds])
    creatorMap = Object.fromEntries(uRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
  }
  if (approvedByIds.length > 0) {
    const aRes = await client.query(`SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`, [approvedByIds])
    approvedByMap = Object.fromEntries(aRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
  }
  if (reviewedByIds.length > 0) {
    const rRes = await client.query(`SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`, [reviewedByIds])
    reviewedByMap = Object.fromEntries(rRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
  }

  if (loanIds.length > 0) {
    const dRes = await client.query(
      `SELECT loan_id, created_by FROM loan_disbursements
       WHERE loan_id = ANY($1::uuid[]) AND created_by IS NOT NULL
       ORDER BY loan_id, created_at ASC`,
      [loanIds],
    )
    const disburserIds = [...new Set(dRes.rows.map((r: { created_by: string }) => r.created_by).filter(Boolean))]
    let disburserNameMap: Record<string, string> = {}
    if (disburserIds.length > 0) {
      const duRes = await client.query(`SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`, [disburserIds])
      disburserNameMap = Object.fromEntries(duRes.rows.map((u: { id: string; full_name: string }) => [u.id, u.full_name || ""]))
    }
    for (const row of dRes.rows as Array<{ loan_id: string; created_by: string }>) {
      const loanId = String(row.loan_id || "")
      const name = disburserNameMap[String(row.created_by || "")] || ""
      if (!loanId || !name) continue
      if (!disbursedByMap[loanId]) disbursedByMap[loanId] = []
      if (!disbursedByMap[loanId].includes(name)) disbursedByMap[loanId].push(name)
    }

    const gRes = await client.query(
      `SELECT g.loan_id, m.full_name FROM loan_guarantors g
       JOIN members m ON m.id = g.guarantor_member_id
       WHERE g.loan_id = ANY($1::uuid[])
       ORDER BY g.loan_id, g.created_at ASC`,
      [loanIds],
    )
    for (const row of gRes.rows as Array<{ loan_id: string; full_name: string }>) {
      if (!guarantorMap[row.loan_id]) guarantorMap[row.loan_id] = []
      if (guarantorMap[row.loan_id].length < 8) guarantorMap[row.loan_id].push(String(row.full_name || ""))
    }

    const repRes = await client.query(
      `SELECT loan_id, due_date, payment_date, amount_paid, interest_amount, total_amount, penalty_amount, status
       FROM loan_repayments WHERE loan_id = ANY($1::uuid[])`,
      [loanIds],
    )
    const today = new Date().toISOString().slice(0, 10)
    for (const loanId of loanIds) {
      repaymentMap[loanId] = {
        totalAmountPaid: 0,
        totalInterest: 0,
        penaltiesCollected: 0,
        latePayDaysAvg: 0,
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
      if (dueDate && status !== "Paid" && dueDate < today) repaymentMap[loanId].overdue = true

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
      repaymentMap[loanId].latePayDaysAvg =
        late.length > 0 ? Math.round((late.reduce((s, n) => s + n, 0) / late.length) * 100) / 100 : 0
      repaymentMap[loanId].earlyPayments = early.length
    }
  }

  return rows.map((row) => {
    const loanId = String(row.id || "")
    const rep = repaymentMap[loanId] || {
      totalAmountPaid: 0,
      totalInterest: 0,
      penaltiesCollected: 0,
      latePayDaysAvg: 0,
      earlyPayments: 0,
      overdue: false,
    }
    return {
      id: loanId,
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
      approved_by_name: approvedByMap[String(row.approved_by || "")] || null,
      reviewed_by_name: reviewedByMap[String(row.reviewed_by || "")] || null,
      created_by_name: creatorMap[String(row.created_by || "")] || null,
      disbursed_by: disbursedByMap[loanId] || [],
      guarantors: guarantorMap[loanId] || [],
      total_amount_paid: Math.round(rep.totalAmountPaid * 100) / 100,
      total_interest: Math.round(rep.totalInterest * 100) / 100,
      penalties_collected: Math.round(rep.penaltiesCollected * 100) / 100,
      late_pay_days_avg: rep.latePayDaysAvg,
      early_payments: rep.earlyPayments,
      overdue: rep.overdue,
    }
  })
}
