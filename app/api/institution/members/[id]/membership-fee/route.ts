import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const memberRes = await client.query(
        `SELECT id, membership_fee_paid FROM senteloans_members WHERE institution_id = $1 AND id = $2`,
        [actor.institution_id, memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      const instRes = await client.query(
        `SELECT settings FROM senteloans_institutions WHERE id = $1`,
        [actor.institution_id]
      )
      const settings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof settings.membershipFee === "number" ? settings.membershipFee : 0

      // Fetch membership fee payment history from transactions
      const txRes = await client.query(
        `SELECT id, transaction_number, amount, mode, description, reference_number, transaction_date, status
         FROM senteloans_transactions
         WHERE institution_id = $1 AND member_id = $2 AND type = 'Fee Payment'
         ORDER BY transaction_date DESC`,
        [actor.institution_id, memberId]
      )

      return {
        membershipFee,
        membershipFeePaid: Number(memberRow.membership_fee_paid) || 0,
        payments: txRes.rows,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "missing_permission:view_members" || result.error === "no_app_user_profile"
          ? 403
          : result.error === "member_not_found"
            ? 404
            : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : "Membership fee payment"
    const referenceNumber = typeof body.reference_number === "string" ? body.reference_number : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_membership_fee")
      if (!allowed) return { error: "missing_permission:edit_membership_fee" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id, membership_fee_paid, status FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_forbidden" as const }
      }

      const instRes = await client.query(
        `SELECT settings FROM senteloans_institutions WHERE id = $1`,
        [actor.institution_id]
      )
      const settings = (instRes.rows[0]?.settings as Record<string, unknown>) || {}
      const membershipFee = typeof settings.membershipFee === "number" ? settings.membershipFee : 0

      const currentPaid = Number(memberRow.membership_fee_paid) || 0
      const remaining = membershipFee - currentPaid

      if (membershipFee > 0 && amount > remaining + 0.01) {
        return { error: "amount_exceeds_remaining" as const, remaining }
      }

      const newPaid = currentPaid + amount
      const transactionNumber = `FEE-${Date.now()}`
      const txDate = new Date().toISOString()

      // balance_before = remaining before payment, balance_after = remaining after payment
      const balanceBefore = membershipFee - currentPaid
      const balanceAfter = membershipFee - newPaid

      // Create the Fee Payment transaction (account_id and loan_id are NULL)
      const txRes = await client.query(
        `INSERT INTO senteloans_transactions
          (institution_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
         VALUES ($1, $2, NULL, NULL, $3, 'Fee Payment', $4, $5, $6, $7, $8, $9, $10, $11, 'Completed')
         RETURNING id`,
        [actor.institution_id, memberId, transactionNumber, amount, mode, description, referenceNumber, balanceBefore, balanceAfter, actor.id, txDate]
      )
      const txRow = txRes.rows[0]
      if (!txRow) return { error: "insert_failed" as const }

      // Update the member's membership_fee_paid
      await client.query(
        `UPDATE senteloans_members SET membership_fee_paid = $1 WHERE id = $2`,
        [newPaid, memberId]
      )

      // Audit log
      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values)
         VALUES ($1, $2, 'senteloans_transactions', 'INSERT', $3, $4)`,
        [actor.institution_id, actor.id, txRow.id, JSON.stringify({ transaction_number: transactionNumber, type: "Fee Payment", amount, member_id: memberId })]
      )

      return {
        ok: true,
        transactionId: txRow.id,
        transactionNumber,
        membershipFeePaid: newPaid,
        membershipFee,
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_forbidden" || result.error === "missing_permission:edit_membership_fee" ? 403 :
        result.error === "member_not_found" ? 404 :
        400
      const body: Record<string, unknown> = { error: result.error }
      if ("remaining" in result) body.remaining = (result as any).remaining
      return NextResponse.json(body, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
