import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { renderTransactionsPdfBuffer } from "./transactions-pdf"

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
     WHERE rp.role_id = $1 AND rp.branch_id = $2 AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function buildTitle(input: { mode: string; search: string; dateFrom: string; dateTo: string }): string {
  const parts: string[] = []
  if (input.mode) parts.push(input.mode)
  parts.push("Transaction Report")
  if (input.search) parts.push(`For ${input.search}`)
  if (input.dateFrom || input.dateTo) parts.push(`Transacted from ${input.dateFrom || "—"} to ${input.dateTo || "—"}`)
  const title = parts.join(" ").trim()
  return title === "Transaction Report" ? "Transaction Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (actorRole === "super_admin") {
        const branchRes = await client.query(
          `SELECT id, name
           FROM senteloans_branches
           WHERE institution_id = $1
           ORDER BY name ASC`,
          [actor.institution_id]
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0
            ? allBranches.filter((b) => selectedBranchIds.includes(b.id))
            : allBranches
      } else {
        const branchRes = await client.query(
          `SELECT id, name
           FROM senteloans_branches
           WHERE id = $1
           LIMIT 1`,
          [actor.branch_id]
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildTitle({ mode, search, dateFrom, dateTo })
      const sheets: Array<{
        branch_name: string
        rows: Array<{
          transaction_number: string
          assigned_to: string
          account_number: string
          type: string
          amount: number
          mode: string
          transaction_date: string | null
          balance_after: number
        }>
      }> = []

      for (const branch of branchScopes) {
        let where = "t.institution_id = $1 AND t.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (mode) {
          where += ` AND t.mode = $${idx++}`
          params.push(mode)
        }
        if (dateFrom) {
          where += ` AND t.transaction_date >= ($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')`
          params.push(dateFrom)
        }
        if (dateTo) {
          where += ` AND t.transaction_date <= ($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')`
          params.push(dateTo)
        }
        if (search) {
          where += ` AND (
          t.description ILIKE $${idx}
          OR t.transaction_number ILIKE $${idx}
          OR m.full_name ILIKE $${idx}
          OR m.member_number ILIKE $${idx}
          OR c.name ILIKE $${idx}
          OR su.full_name ILIKE $${idx}
        )`
          params.push(`%${search}%`)
          idx++
        }

        const txRes = await client.query(
          `SELECT
             t.transaction_number,
             COALESCE(m.full_name, c.name, su.full_name, '') AS assigned_to,
             COALESCE(sa.account_number, '') AS account_number,
             t.type,
             t.amount,
             t.mode,
             t.transaction_date,
             t.balance_after
           FROM senteloans_transactions t
           LEFT JOIN senteloans_members m ON m.id = t.member_id
           LEFT JOIN senteloans_clients c ON c.id = t.client_id
           LEFT JOIN senteloans_users su ON su.id = t.staff_id
           LEFT JOIN senteloans_savings_accounts sa ON sa.id = t.account_id
           WHERE ${where}
           ORDER BY t.created_at DESC`,
          params
        )

        sheets.push({
          branch_name: branch.name,
          rows: txRes.rows,
        })
      }

      return {
        title,
        sheets,
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "no_app_user_profile" || result.error.startsWith("missing_permission:") ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Txn #", "Assigned To", "Account", "Type", "Amount", "Mode", "Date", "Balance"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Transaction Report", headers, "A1:H1")
        ws.columns = [
          { width: 22 },
          { width: 24 },
          { width: 18 },
          { width: 18 },
          { width: 14 },
          { width: 16 },
          { width: 14 },
          { width: 14 },
        ]
        for (const row of sheet.rows || []) {
          ws.addRow([
            row.transaction_number || "",
            row.assigned_to || "",
            row.account_number || "",
            row.type || "",
            Number(row.amount || 0),
            row.mode || "",
            row.transaction_date ? formatIsoDateForExcel(row.transaction_date) : "",
            Number(row.balance_after || 0),
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="transaction-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderTransactionsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="transaction-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
