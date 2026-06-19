import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const externalLenderId = String(body.external_lender_id || "").trim()
    const amount = Number(body.amount)
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!externalLenderId) {
      return NextResponse.json({ error: "external_lender_id_required" }, { status: 400 })
    }
    if (!uuidRe.test(externalLenderId)) {
      return NextResponse.json({ error: "invalid_external_lender_id" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const allowed = await hasPermission(client, actor, "sell_loan")
      if (!allowed) return { error: "missing_permission:sell_loan" as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, status, outstanding_balance
         FROM loans
         WHERE id = $1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (String(loan.institution_id) !== String(actor.institution_id)) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin && String(loan.branch_id) !== String(actor.branch_id)) return { error: "cross_branch_operation_forbidden" as const }

      const currentStatus = String(loan.status || "")
      if (currentStatus !== "Fully Disbursed" && currentStatus !== "Active") {
        return { error: "invalid_status_for_sell_off" as const }
      }

      const outstandingBalance = Number(loan.outstanding_balance || 0)
      const roundedProvided = Math.round((amount + Number.EPSILON) * 100) / 100
      const roundedOutstanding = Math.round((outstandingBalance + Number.EPSILON) * 100) / 100
      if (roundedProvided !== roundedOutstanding) {
        return { error: "amount_mismatch_with_outstanding_balance" as const }
      }

      const extRes = await client.query(
        `SELECT id FROM clients WHERE id = $1 AND institution_id = $2 AND branch_id = $3`,
        [externalLenderId, loan.institution_id, loan.branch_id]
      )
      if (!extRes.rows[0]) return { error: "external_lender_not_found" as const }

      await client.query(
        `UPDATE loans
         SET status = 'Closed', outstanding_balance = 0, updated_at = NOW()
         WHERE id = $1`,
        [id]
      )
      await auditLogger.logUpdate(
        "loans",
        id,
        { status: currentStatus, outstanding_balance: roundedOutstanding },
        { status: "Closed", outstanding_balance: 0 },
        loan.institution_id,
        actor.id,
        undefined,
        client
      )

      const settlementInsertRes = await client.query(
        `INSERT INTO loan_settlements
          (institution_id, branch_id, disbursement_id, new_loan_id, settled_loan_id, external_lender_id, settlement_amount, settlement_type)
         VALUES
          ($1, $2, NULL, NULL, $3, $4, $5, 'external sell off')
         RETURNING id`,
        [loan.institution_id, loan.branch_id, id, externalLenderId, roundedProvided]
      )
      const settlementId = String(settlementInsertRes.rows[0]?.id || "")
      if (settlementId) {
        await auditLogger.logInsert(
          "loan_settlements",
          settlementId,
          {
            settled_loan_id: id,
            external_lender_id: externalLenderId,
            settlement_amount: roundedProvided,
            settlement_type: "external sell off",
          },
          loan.institution_id,
          actor.id,
          undefined,
          client
        )
      }

      await client.query(
        `INSERT INTO audit_logs
          (institution_id, branch_id, user_id, table_name, category, operation, record_id, new_values)
         VALUES
          ($1, $2, $3, 'loans', 'loans', 'UPDATE', $4, $5)`,
        [
          loan.institution_id,
          loan.branch_id,
          actor.id,
          id,
          JSON.stringify({
            status: "Closed",
            settlement_type: "external sell off",
            settlement_amount: roundedProvided,
            external_lender_id: externalLenderId,
          }),
        ]
      )

      return { ok: true as const }
    })

    if ("error" in result) {
      const errorCode = typeof result.error === "string" ? result.error : "unknown_error"
      const status =
        errorCode === "not_found" || errorCode === "external_lender_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ||
        errorCode === "cross_tenant_operation_forbidden" ||
        errorCode === "cross_branch_operation_forbidden" ||
        errorCode === "actor_branch_missing" ||
        errorCode === "user_not_linked" ? 403 :
        400
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status, error: errorCode, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json({ error: errorCode }, { status })
    }

    apiLog("info", "loans.sell_off.success", { method: "POST", apiPath, status: 201, authUserId: session.user.authUserId, loanId: id })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.sell_off.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
