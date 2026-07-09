import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { renderLoanReviewPdfBuffer } from "./review-pdf"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_loan_id" }, { status: 400 })

    const sess = await requireStaffSession()
    if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status })

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "review_eligibilities")
      if (!allowed) return { error: "missing_permission:review_eligibilities" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT
           l.application_id,
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
           COALESCE(ru.full_name, '') AS loan_reviewed_by_name,
           COALESCE(rr.name, '') AS loan_reviewed_by_role
         FROM loans l
         LEFT JOIN members m ON m.id = l.member_id
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         LEFT JOIN institutions ins ON ins.id = l.institution_id
         LEFT JOIN branches b ON b.id = l.branch_id
         LEFT JOIN users ru ON ru.id = l.reviewed_by
         LEFT JOIN roles rr ON rr.id = ru.role_id
         WHERE l.id = $1
           AND l.institution_id = $2
           ${isSuperAdmin(actor) ? "" : "AND l.branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin(actor) ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }

      const eligibilityRes = await client.query(
        `SELECT
           ler.eligibility
         FROM loan_eligibility_reviews ler
         WHERE ler.loan_id = $1
         ORDER BY ler.created_at ASC`,
        [id],
      )

      const buffer = await renderLoanReviewPdfBuffer({
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
        reviewed_by_name: String(loan.loan_reviewed_by_name || ""),
        reviewed_by_role: String(loan.loan_reviewed_by_role || ""),
        eligibilities: eligibilityRes.rows.map((row: Record<string, unknown>) => ({
          eligibility: String(row.eligibility || ""),
        })),
      })

      return {
        fileBase: String(loan.application_id || "loan_field_review").replace(/[^a-zA-Z0-9._-]/g, "_"),
        buffer,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "not_found" ? 404 :
        code.startsWith("missing_permission:") ? 403 :
        code === "user_not_linked" ? 403 : 400
      return NextResponse.json({ error: code }, { status })
    }

    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `attachment; filename="${result.fileBase}_field_review.pdf"`)
    headers.set("Cache-Control", "no-store")
    return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
