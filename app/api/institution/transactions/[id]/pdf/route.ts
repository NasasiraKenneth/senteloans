import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { renderTransactionDetailPdfBuffer } from "./transaction-detail-pdf"

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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
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
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }
      if (String(actor.role || "").trim().toLowerCase() !== "super_admin" && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const scope = whereScope(actor)
      const txRes = await client.query(
        `SELECT
           t.id, t.transaction_number, t.type, t.amount, t.mode, t.description, t.reference_number,
           t.balance_before, t.balance_after, t.transaction_date, t.status, t.member_id, t.account_id, t.transferred_to_id, t.processed_by,
           COALESCE(ins.name, '') AS sacco_name,
           COALESCE(ins.logo, '') AS sacco_logo,
           COALESCE(b.name, '') AS branch_name,
           COALESCE(b.phone_number, '') AS branch_phone,
           COALESCE(b.address, '') AS branch_address
         FROM senteloans_transactions t
         LEFT JOIN senteloans_institutions ins ON ins.id = t.institution_id
         LEFT JOIN senteloans_branches b ON b.id = t.branch_id
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params],
      )
      const tx = txRes.rows[0]
      if (!tx) return { error: "transaction_not_found" as const }

      let clientName = ""
      let clientNumber = ""
      if (tx.member_id) {
        const cRes = await client.query(`SELECT full_name, member_number FROM senteloans_members WHERE id = $1`, [tx.member_id])
        clientName = cRes.rows[0]?.full_name || ""
        clientNumber = cRes.rows[0]?.member_number || ""
      }
      let accountNumber = ""
      let accountType = ""
      if (tx.account_id) {
        const aRes = await client.query(`SELECT account_number, account_type FROM senteloans_savings_accounts WHERE id = $1`, [tx.account_id])
        accountNumber = aRes.rows[0]?.account_number || ""
        accountType = aRes.rows[0]?.account_type || ""
      }
      let processedByName = ""
      if (tx.processed_by) {
        const uRes = await client.query(`SELECT full_name FROM senteloans_users WHERE id = $1`, [tx.processed_by])
        processedByName = uRes.rows[0]?.full_name || ""
      }
      let transferToAccountNumber = ""
      let transferToMemberNumber = ""
      let transferToMemberName = ""
      if (tx.transferred_to_id) {
        const taRes = await client.query(
          `SELECT sa.account_number, m.member_number, m.full_name
           FROM senteloans_savings_accounts sa
           LEFT JOIN senteloans_members m ON m.id = sa.member_id
           WHERE sa.id = $1
           LIMIT 1`,
          [tx.transferred_to_id],
        )
        transferToAccountNumber = taRes.rows[0]?.account_number || ""
        transferToMemberNumber = taRes.rows[0]?.member_number || ""
        transferToMemberName = taRes.rows[0]?.full_name || ""
      }

      const buffer = await renderTransactionDetailPdfBuffer({
        sacco_name: String(tx.sacco_name || ""),
        sacco_logo: String(tx.sacco_logo || ""),
        branch_name: String(tx.branch_name || ""),
        branch_phone: String(tx.branch_phone || ""),
        branch_address: String(tx.branch_address || ""),
        transaction_number: String(tx.transaction_number || ""),
        type: String(tx.type || ""),
        amount: Number(tx.amount || 0),
        mode: String(tx.mode || ""),
        description: String(tx.description || ""),
        reference_number: String(tx.reference_number || ""),
        balance_before: Number(tx.balance_before || 0),
        balance_after: Number(tx.balance_after || 0),
        transaction_date: tx.transaction_date || null,
        status: String(tx.status || ""),
        client_name: clientName,
        client_number: clientNumber,
        account_type: accountType,
        account_number: accountNumber,
        transfer_to_account_number: transferToAccountNumber,
        transfer_to_member_number: transferToMemberNumber,
        transfer_to_member_name: transferToMemberName,
        processed_by_name: processedByName,
        processed_by_id: String(tx.processed_by || ""),
      })

      return { transactionNumber: String(tx.transaction_number || tx.id || "transaction"), buffer }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "transaction_not_found" ? 404 :
        code.startsWith("missing_permission:") ? 403 :
        code === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: code }, { status })
    }

    const filename = `${String(result.transactionNumber || "transaction").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`
    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `attachment; filename="${filename}"`)
    headers.set("Cache-Control", "no-store")
    apiLog("info", "transactions.detail.pdf.success", { method: "GET", apiPath, status: 200, transactionId: id })
    return new NextResponse(result.buffer, { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.detail.pdf.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
