import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { resolveTransactionAssignedParty } from "@/lib/transactions/resolve-assigned-party"

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

function whereScope(actor: ActorContext) {
  const actorRole = String(actor.role || "").trim().toLowerCase()
  if (actorRole === "super_admin") {
    return { clause: "t.id = $1 AND t.institution_id = $2", params: [] as unknown[] }
  }
  return { clause: "t.id = $1 AND t.institution_id = $2 AND t.branch_id = $3", params: [actor.branch_id] as unknown[] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "transactions.detail.invalid", { method: "GET", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "transactions.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "transactions.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const txRes = await client.query(
        `SELECT
           t.id,
           t.institution_id,
           t.member_id,
           t.third_party_agent_id,
           t.staff_id,
           t.account_id,
           t.loan_id,
           t.transaction_number,
           t.type,
           t.amount,
           t.mode,
           t.description,
           t.reference_number,
           t.balance_before,
           t.balance_after,
           t.processed_by,
           t.transaction_date,
           t.status,
           t.created_at
         FROM transactions t
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const tx = txRes.rows[0]
      if (!tx) return { error: "transaction_not_found" as const }

      const assigned = await resolveTransactionAssignedParty(client, tx)
      const clientName = assigned.assigned_to
      const clientNumber = assigned.assigned_to_number
      let accountNumber = ""
      if (tx.account_id) {
        const aRes = await client.query(`SELECT id, account_number FROM savings_accounts WHERE id = $1`, [tx.account_id])
        accountNumber = aRes.rows[0]?.account_number || ""
      }
      let loanApplicationId = ""
      if (tx.loan_id) {
        const lRes = await client.query(`SELECT id, application_id FROM loans WHERE id = $1`, [tx.loan_id])
        loanApplicationId = lRes.rows[0]?.application_id || ""
      }
      let processedByName = ""
      if (tx.processed_by) {
        const uRes = await client.query(`SELECT id, full_name FROM users WHERE id = $1`, [tx.processed_by])
        processedByName = uRes.rows[0]?.full_name || ""
      }

      return {
        transaction: {
          id: tx.id,
          institution_id: tx.institution_id,
          transaction_number: tx.transaction_number,
          type: tx.type,
          amount: tx.amount,
          mode: tx.mode,
          description: tx.description,
          reference_number: tx.reference_number,
          balance_before: tx.balance_before,
          balance_after: tx.balance_after,
          transaction_date: tx.transaction_date,
          status: tx.status,
          created_at: tx.created_at,
          member_id: tx.member_id,
          client_number: clientNumber,
          client_name: clientName,
          assigned_to: assigned.assigned_to,
          assigned_to_type: assigned.assigned_to_type,
          assigned_to_number: assigned.assigned_to_number,
          account_id: tx.account_id,
          account_number: accountNumber,
          loan_id: tx.loan_id,
          loan_application_id: loanApplicationId,
          processed_by: tx.processed_by,
          processed_by_name: processedByName,
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "transaction_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "transactions.detail.denied", { method: "GET", apiPath, status: statusCode, error: errorCode, transactionId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "transactions.detail.success", { method: "GET", apiPath, status: 200, transactionId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
