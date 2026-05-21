import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { renderBankAccountsPdfBuffer } from "./bank-accounts-pdf"

type BranchScope = { id: string; name: string }

type ExportRow = {
  bank_name: string
  bank_account_number: string
  total_amount: number
  updated_at: string | null
}

function buildTitle(input: { search: string }): string {
  const parts: string[] = ["Bank Accounts Report"]
  if (input.search) parts.push(`For ${input.search}`)
  return parts.join(" ").trim()
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const search = (url.searchParams.get("q") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw
      ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : []
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts)
      if (!allowed) return { error: "missing_permission:view_bank_accouts" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin(actor)) {
        const branchRes = await client.query(
          `SELECT id, name
           FROM senteloans_branches
           WHERE institution_id = $1
           ORDER BY name ASC`,
          [actor.institution_id],
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0
            ? allBranches.filter((b) => selectedBranchIds.includes(b.id))
            : allBranches
      } else {
        const branchRes = await client.query(
          `SELECT id, name FROM senteloans_branches WHERE id = $1 LIMIT 1`,
          [actor.branch_id],
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildTitle({ search })
      const sheets: Array<{ branch_name: string; rows: ExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "ba.institution_id = $1 AND ba.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3
        if (search) {
          where += ` AND (ba.bank_name ILIKE $${idx} OR ba.bank_account_number ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }

        const rowsRes = await client.query(
          `SELECT
             ba.bank_name,
             ba.bank_account_number,
             COALESCE(ba.total_amount, 0)::numeric AS total_amount,
             ba.updated_at
           FROM senteloans_bank_accounts ba
           WHERE ${where}
           ORDER BY ba.updated_at DESC NULLS LAST, ba.created_at DESC`,
          params,
        )

        sheets.push({
          branch_name: branch.name,
          rows: rowsRes.rows.map((r: Record<string, unknown>) => ({
            bank_name: String(r.bank_name || ""),
            bank_account_number: String(r.bank_account_number || ""),
            total_amount: Number(r.total_amount || 0),
            updated_at: r.updated_at ? String(r.updated_at) : null,
          })),
        })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "actor_branch_missing" || result.error === "no_branch_scope"
          ? 400
          : result.error === "user_not_linked" || String(result.error).startsWith("missing_permission:")
            ? 403
            : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || "error" in result) {
      return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })
    }

    const date = new Date().toISOString().slice(0, 10)

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Bank", "Account number", "Total amount", "Updated"]
      for (const sheet of result.sheets) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title, headers, "A1:D1")
        ws.columns = [
          { width: 28 },
          { width: 24 },
          { width: 18 },
          { width: 14 },
        ]
        for (const row of sheet.rows) {
          ws.addRow([
            row.bank_name,
            row.bank_account_number,
            Number(row.total_amount || 0),
            row.updated_at ? formatIsoDateForExcel(row.updated_at) : "",
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bank-accounts-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderBankAccountsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="bank-accounts-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.bank_accounts.export.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
