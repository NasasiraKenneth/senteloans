import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { renderVerifiedLoanReviewPdfBuffer } from "./verified-review-pdf"

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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
       AND u.status = 'Active'
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_loan_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "review_loan")
      if (!allowed) return { error: "missing_permission:review_loan" as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT
           l.id,
           l.application_id,
           l.reviewed_at,
           COALESCE(m.member_number, '') AS member_number,
           COALESCE(m.full_name, '') AS member_name,
           COALESCE(lp.product_name, '') AS loan_product,
           COALESCE(lp.product_code, '') AS loan_product_code,
           COALESCE(ins.name, '') AS sacco_name,
           COALESCE(ins.logo, '') AS sacco_logo,
           COALESCE(b.name, '') AS branch_name,
           COALESCE(b.address, '') AS branch_address,
           COALESCE(b.phone_number, '') AS branch_phone,
           COALESCE(b.email, '') AS branch_email,
           COALESCE(ru.full_name, '') AS reviewed_by_name,
           COALESCE(rr.name, '') AS reviewed_by_role
         FROM senteloans_loans l
         LEFT JOIN senteloans_members m ON m.id = l.member_id
         LEFT JOIN senteloans_loan_products lp ON lp.id = l.loan_product_id
         LEFT JOIN senteloans_institutions ins ON ins.id = l.institution_id
         LEFT JOIN senteloans_branches b ON b.id = l.branch_id
         LEFT JOIN senteloans_users ru ON ru.id = l.reviewed_by
         LEFT JOIN senteloans_roles rr ON rr.id = ru.role_id
         WHERE l.id = $1
           AND l.institution_id = $2
           ${isSuperAdmin ? "" : "AND l.branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }

      const eligibilityRes = await client.query(
        `SELECT eligibility, is_eligible
         FROM senteloans_loan_eligibility_reviews
         WHERE loan_id = $1
         ORDER BY created_at ASC`,
        [id],
      )

      const buffer = await renderVerifiedLoanReviewPdfBuffer({
        sacco_name: String(loan.sacco_name || ""),
        sacco_logo: String(loan.sacco_logo || ""),
        branch_name: String(loan.branch_name || ""),
        branch_address: String(loan.branch_address || ""),
        branch_phone: String(loan.branch_phone || ""),
        branch_email: String(loan.branch_email || ""),
        member_number: String(loan.member_number || ""),
        member_name: String(loan.member_name || ""),
        application_id: String(loan.application_id || ""),
        loan_product: String(loan.loan_product || ""),
        loan_product_code: String(loan.loan_product_code || ""),
        reviewed_at: loan.reviewed_at ? String(loan.reviewed_at) : null,
        reviewed_by_name: String(loan.reviewed_by_name || ""),
        reviewed_by_role: String(loan.reviewed_by_role || ""),
        eligibilities: eligibilityRes.rows.map((row: Record<string, unknown>) => ({
          eligibility: String(row.eligibility || ""),
          is_eligible: Boolean(row.is_eligible),
        })),
      })

      return {
        fileBase: String(loan.application_id || "loan_review").replace(/[^a-zA-Z0-9._-]/g, "_"),
        buffer,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "not_found" ? 404 :
        code.startsWith("missing_permission:") ? 403 :
        code === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: code }, { status })
    }

    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `attachment; filename="${result.fileBase}_verified_review.pdf"`)
    headers.set("Cache-Control", "no-store")
    return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

