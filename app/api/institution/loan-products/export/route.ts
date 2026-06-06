import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderLoanProductsPdfBuffer } from "./loan-products-pdf"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

type BranchScope = { id: string; name: string }

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id, u.institution_id, u.branch_id, u.role_id,
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
     WHERE rp.role_id = $1 AND rp.branch_id = $2 AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function buildTitle(input: { status: string; search: string }): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  parts.push("Loan Product Report")
  if (input.search) parts.push(`for ${input.search}`)
  const title = parts.join(" ").trim()
  return title === "Loan Product Report" ? "Loan Product Report" : title
}

function buildRequirements(row: Record<string, unknown>): string {
  const out: string[] = []
  if (Boolean(row.collateral_required)) out.push("Collateral")
  const guarantors = Number(row.guarantors_required || 0)
  if (guarantors > 0) out.push(`${guarantors} guarantor${guarantors > 1 ? "s" : ""}`)
  if (Boolean(row.insurance_required)) out.push("Insurance")
  const fee = Number(row.processing_fee_percentage || 0)
  if (fee > 0) out.push(`Processing fee ${fee}%`)
  return out.join(", ")
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const status = (url.searchParams.get("status") || "").trim()
    const search = (url.searchParams.get("q") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_loan_products")
      if (!allowed) return { error: "missing_permission:view_loan_products" as const }
      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin) {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`, [actor.institution_id])
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes = selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [actor.branch_id])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({ status, search })
      const sheets: Array<{ branch_name: string; rows: Array<any> }> = []
      for (const branch of branchScopes) {
        let where = "lp.institution_id = $1 AND lp.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (status) {
          where += ` AND lp.status = $${idx++}`
          params.push(status)
        }
        if (search) {
          where += ` AND (lp.product_name ILIKE $${idx} OR lp.product_code ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }

        const res = await client.query(
          `SELECT
             lp.product_name, lp.product_code, lp.status, lp.interest_rate, lp.interest_calculation_method,
             lp.minimum_amount, lp.maximum_amount, lp.minimum_tenure_months, lp.maximum_tenure_months,
             lp.collateral_required, lp.guarantors_required, lp.processing_fee_percentage, lp.insurance_required,
             COALESCE(
               string_agg(lpe.eligibility, ', ' ORDER BY lpe.eligibility) FILTER (WHERE lpe.id IS NOT NULL),
               ''
             ) AS eligibilities
           FROM loan_products lp
           LEFT JOIN loan_product_eligibilities lpe ON lpe.loan_product_id = lp.id
           WHERE ${where}
           GROUP BY lp.id
           ORDER BY lp.product_name ASC`,
          params
        )
        const rows = (res.rows || []).map((r: Record<string, unknown>) => ({
          ...r,
          requirements: buildRequirements(r),
        }))
        sheets.push({ branch_name: branch.name, rows })
      }
      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "missing_permission:view_loan_products" || result.error === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Product", "Code", "Status", "Interest %", "Calculation Method", "Amount Range", "Tenure", "Requirements", "Eligibilities"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Loan Product Report", headers, "A1:I1")
        ws.columns = [{ width: 24 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 36 }, { width: 36 }]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.product_name || "",
            row.product_code || "",
            row.status || "",
            Number(row.interest_rate || 0),
            row.interest_calculation_method || "",
            `${Number(row.minimum_amount || 0).toLocaleString("en-UG")} - ${Number(row.maximum_amount || 0).toLocaleString("en-UG")}`,
            `${Number(row.minimum_tenure_months || 0)}-${Number(row.maximum_tenure_months || 0)} months`,
            row.requirements || "",
            row.eligibilities || "",
          ])
          added.eachCell((cell: any) => {
            cell.alignment = { wrapText: true, vertical: "top" }
          })
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="loan-products-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderLoanProductsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="loan-products-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
