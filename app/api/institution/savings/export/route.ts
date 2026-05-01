import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderSavingsPdfBuffer } from "./savings-pdf"

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

function buildTitle(input: {
  status: string
  accountTypeLabel: string
  search: string
  openDateStart: string
  openDateEnd: string
}): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  parts.push("Savings Accounts Report")
  if (input.accountTypeLabel) parts.push(`for ${input.accountTypeLabel}`)
  if (input.search) parts.push(`for ${input.search}`)
  if (input.openDateStart || input.openDateEnd) {
    parts.push(`created from ${input.openDateStart || "—"} to ${input.openDateEnd || "—"}`)
  }
  const title = parts.join(" ").trim()
  return title === "Savings Accounts Report" ? "Savings Accounts Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const status = (url.searchParams.get("status") || "").trim()
    const accountTypeRaw = (url.searchParams.get("account_type") || "").trim()
    const accountTypes = accountTypeRaw ? accountTypeRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const accountTypeLabel = accountTypes.join(", ")
    const search = (url.searchParams.get("search") || "").trim()
    const openDateStart = (url.searchParams.get("open_dateStart") || "").trim()
    const openDateEnd = (url.searchParams.get("open_dateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_savings")
      if (!allowed) return { error: "missing_permission:view_savings" as const }
      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin) {
        const branchRes = await client.query(`SELECT id, name FROM senteloans_branches WHERE institution_id = $1 ORDER BY name ASC`, [actor.institution_id])
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes = selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM senteloans_branches WHERE id = $1 LIMIT 1`, [actor.branch_id])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({
        status,
        accountTypeLabel,
        search,
        openDateStart,
        openDateEnd,
      })

      const sheets: Array<{ branch_name: string; rows: Array<any> }> = []
      for (const branch of branchScopes) {
        let where = "sa.institution_id = $1 AND sa.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (status) {
          where += ` AND sa.status = $${idx++}`
          params.push(status)
        }
        if (accountTypes.length === 1) {
          where += ` AND sa.account_type = $${idx++}`
          params.push(accountTypes[0])
        } else if (accountTypes.length > 1) {
          where += ` AND sa.account_type = ANY($${idx++}::text[])`
          params.push(accountTypes)
        }
        if (search) {
          where += ` AND (sa.account_number ILIKE $${idx} OR m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (openDateStart) {
          where += ` AND sa.open_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
          params.push(openDateStart)
        }
        if (openDateEnd) {
          where += ` AND sa.open_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
          params.push(openDateEnd)
        }

        const res = await client.query(
          `SELECT
             sa.account_number, sa.account_type, sa.available_balance, sa.total_balance, sa.status, sa.open_date,
             COALESCE(m.full_name, '') AS member_name
           FROM senteloans_savings_accounts sa
           LEFT JOIN senteloans_members m ON m.id = sa.member_id
           WHERE ${where}
           ORDER BY sa.open_date DESC`,
          params
        )
        sheets.push({ branch_name: branch.name, rows: res.rows })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "missing_permission:view_savings" || result.error === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Account", "Type", "Member", "Status", "Available Balance", "Total Balance", "Opened"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Savings Accounts Report", headers, "A1:G1")
        ws.columns = [{ width: 18 }, { width: 14 }, { width: 24 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 14 }]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.account_number || "",
            row.account_type || "",
            row.member_name || "",
            row.status || "",
            Number(row.available_balance || 0),
            Number(row.total_balance || 0),
            row.open_date ? formatIsoDateForExcel(row.open_date) : "",
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
          "Content-Disposition": `attachment; filename="savings-accounts-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderSavingsPdfBuffer({ title: result.title, sheets: result.sheets })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="savings-accounts-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
