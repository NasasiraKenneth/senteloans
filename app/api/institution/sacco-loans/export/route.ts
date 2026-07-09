import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderSaccoLoansPdfBuffer } from "./sacco-loans-pdf"
import { appendSaccoLoanListFilters } from "@/lib/sacco-loans/query-filters"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

type BranchScope = { id: string; name: string }

function titleCaseLoanType(v: string): string {
  return v
    .replace(/_/g, " ")
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
  parts.push("Sacco Loans Report")
  if (input.remainingTenure) parts.push(`with ${tenureLabel(input.remainingTenure)}`)
  if (input.applicationDateStart || input.applicationDateEnd) {
    parts.push(`applied from ${input.applicationDateStart || "—"} to ${input.applicationDateEnd || "—"}`)
  }
  if (input.nextPaymentDateStart || input.nextPaymentDateEnd) {
    parts.push(`next payment from ${input.nextPaymentDateStart || "—"} to ${input.nextPaymentDateEnd || "—"}`)
  }
  const title = parts.join(" ").trim()
  return title === "Sacco Loans Report" ? "Sacco Loans Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const q = (url.searchParams.get("q") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
    const remainingTenure = (url.searchParams.get("remainingTenure") || "").trim()
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const nextPaymentDateStart = (url.searchParams.get("nextPaymentDateStart") || "").trim()
    const nextPaymentDateEnd = (url.searchParams.get("nextPaymentDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_sacco_loans")
      if (!allowed) return { error: "missing_permission:view_sacco_loans" as const }
      const isSA = isSuperAdmin(actor)
      if (!isSA && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (isSA) {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`, [actor.institution_id])
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes = selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [actor.branch_id])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({
        status,
        loanType,
        loanProductsLabel: "",
        remainingTenure,
        applicationDateStart,
        applicationDateEnd,
        nextPaymentDateStart,
        nextPaymentDateEnd,
      })

      const sheets: Array<{ branch_name: string; rows: Array<any> }> = []
      for (const branch of branchScopes) {
        let where = "l.institution_id = $1 AND l.branch_id = $2"
        let params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (status) { where += ` AND l.status = $${idx++}`; params.push(status) }
        ;({ where, params, idx } = appendSaccoLoanListFilters({
          where,
          params,
          idx,
          loanType,
          remainingTenure,
          applicationDateStart,
          applicationDateEnd,
          nextPaymentDateStart,
          nextPaymentDateEnd,
          q,
        }))

        const loanRes = await client.query(
          `SELECT
             COALESCE(tpa.name, '') AS client_name,
             COALESCE(l.loan_product, '') AS loan_product,
             l.status,
             l.loan_type,
             l.principal_amount,
             l.tenure_months,
             COALESCE(l.remaining_tenure_months, l.tenure_months) AS remaining_tenure_months,
             l.outstanding_balance,
             l.application_date,
             l.next_payment_date
           FROM institution_loans l
           LEFT JOIN third_party_agents tpa ON tpa.id = l.third_party_agent_id
           WHERE ${where}
           ORDER BY l.application_date DESC, l.created_at DESC`,
          params
        )
        sheets.push({ branch_name: branch.name, rows: loanRes.rows })
      }
      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "missing_permission:view_sacco_loans" || result.error === "user_not_linked" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Client", "Product", "Status", "Loan Type", "Amount", "Tenure", "Outstanding", "Applied", "Next Payment"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Sacco Loans Report", headers, "A1:I1")
        ws.columns = [
          { width: 24 }, { width: 22 }, { width: 16 }, { width: 14 },
          { width: 14 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 14 },
        ]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.client_name || "",
            row.loan_product || "",
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
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sacco-loans-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderSaccoLoansPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sacco-loans-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
