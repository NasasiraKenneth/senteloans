import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderLoansPdfBuffer } from "./loans-pdf"

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
     WHERE rp.role_id = $1 AND rp.branch_id = $2 AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function titleCaseLoanType(v: string): string {
  return v
    .split(" ")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ")
}

function tenureLabel(v: string): string {
  const m: Record<string, string> = {
    eq1: "1 month",
    lte3: "<= 3 months",
    lte6: "<= 6 months",
    lte12: "<= 12 months",
    gt12: "> 12 months",
  }
  return m[v] || v
}

function buildTitle(input: {
  status: string
  loanType: string
  loanProductsLabel: string
  remainingTenure: string
  applicationDateStart: string
  applicationDateEnd: string
  nextPaymentDateStart: string
  nextPaymentDateEnd: string
}): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  if (input.loanType) parts.push(titleCaseLoanType(input.loanType))
  if (input.loanProductsLabel) parts.push(input.loanProductsLabel)
  parts.push("Loans Report")
  if (input.remainingTenure) parts.push(`with ${tenureLabel(input.remainingTenure)}`)
  if (input.applicationDateStart || input.applicationDateEnd) {
    parts.push(`applied from ${input.applicationDateStart || "—"} to ${input.applicationDateEnd || "—"}`)
  }
  if (input.nextPaymentDateStart || input.nextPaymentDateEnd) {
    parts.push(`next payment from ${input.nextPaymentDateStart || "—"} to ${input.nextPaymentDateEnd || "—"}`)
  }
  const title = parts.join(" ").trim()
  return title === "Loans Report" ? "Loans Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const q = (url.searchParams.get("q") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const productRaw = (url.searchParams.get("product_id") || "").trim()
    const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
    const remainingTenure = (url.searchParams.get("remainingTenure") || "").trim()
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const nextPaymentDateStart = (url.searchParams.get("nextPaymentDateStart") || "").trim()
    const nextPaymentDateEnd = (url.searchParams.get("nextPaymentDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
    const selectedProductIds = productRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }
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

      let loanProductsLabel = ""
      if (selectedProductIds.length > 0) {
        const pRes = await client.query(
          `SELECT product_name FROM loan_products WHERE institution_id = $1 AND id = ANY($2::uuid[]) ORDER BY product_name ASC`,
          [actor.institution_id, selectedProductIds]
        )
        loanProductsLabel = pRes.rows.map((r: { product_name: string }) => r.product_name).join(", ")
      }

      const title = buildTitle({
        status,
        loanType,
        loanProductsLabel,
        remainingTenure,
        applicationDateStart,
        applicationDateEnd,
        nextPaymentDateStart,
        nextPaymentDateEnd,
      })

      const sheets: Array<{ branch_name: string; rows: Array<any> }> = []
      for (const branch of branchScopes) {
        let where = "l.institution_id = $1 AND l.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (status) { where += ` AND l.status = $${idx++}`; params.push(status) }
        if (loanType) { where += ` AND lower(l.loan_type) = $${idx++}`; params.push(loanType) }
        if (selectedProductIds.length === 1) { where += ` AND l.loan_product_id = $${idx++}`; params.push(selectedProductIds[0]) }
        else if (selectedProductIds.length > 1) { where += ` AND l.loan_product_id = ANY($${idx}::uuid[])`; params.push(selectedProductIds); idx++ }
        if (remainingTenure === "eq1") where += ` AND l.tenure_months = 1`
        else if (remainingTenure === "lte3") where += ` AND l.tenure_months <= 3`
        else if (remainingTenure === "lte6") where += ` AND l.tenure_months <= 6`
        else if (remainingTenure === "lte12") where += ` AND l.tenure_months <= 12`
        else if (remainingTenure === "gt12") where += ` AND l.tenure_months > 12`
        if (applicationDateStart) { where += ` AND l.application_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`; params.push(applicationDateStart); idx++ }
        if (applicationDateEnd) { where += ` AND l.application_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`; params.push(applicationDateEnd); idx++ }
        if (nextPaymentDateStart) { where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`; params.push(nextPaymentDateStart); idx++ }
        if (nextPaymentDateEnd) { where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`; params.push(nextPaymentDateEnd); idx++ }
        if (q) {
          where += ` AND (
            m.full_name ILIKE $${idx}
            OR m.member_number ILIKE $${idx}
            OR p.product_name ILIKE $${idx}
            OR l.application_id ILIKE $${idx}
          )`
          params.push(`%${q}%`)
          idx++
        }

        const loanRes = await client.query(
          `SELECT l.application_id, COALESCE(m.full_name, '') AS member_name, COALESCE(p.product_name, '') AS product_name,
                  l.status, l.loan_type, l.principal_amount, l.tenure_months, l.outstanding_balance, l.application_date, l.next_payment_date
           FROM loans l
           LEFT JOIN members m ON m.id = l.member_id
           LEFT JOIN loan_products p ON p.id = l.loan_product_id
           WHERE ${where}
           ORDER BY l.application_date DESC`,
          params
        )
        sheets.push({ branch_name: branch.name, rows: loanRes.rows })
      }
      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "missing_permission:view_loans" || result.error === "user_not_linked" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Application", "Member", "Product", "Status", "Loan Type", "Amount", "Tenure", "Outstanding", "Applied", "Next Payment"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Loans Report", headers, "A1:J1")
        ws.columns = [
          { width: 20 }, { width: 24 }, { width: 22 }, { width: 16 }, { width: 14 },
          { width: 14 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 14 },
        ]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.application_id || "",
            row.member_name || "",
            row.product_name || "",
            row.status || "",
            row.loan_type || "",
            Number(row.principal_amount || 0),
            Number(row.tenure_months || 0),
            Number(row.outstanding_balance || 0),
            row.application_date ? formatIsoDateForExcel(row.application_date) : "",
            row.next_payment_date ? formatIsoDateForExcel(row.next_payment_date) : "",
          ])
          added.eachCell((cell: any) => {
            cell.alignment = { wrapText: true, vertical: "top" }
          })
          added.getCell(1).numFmt = "@"
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="loans-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderLoansPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="loans-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

