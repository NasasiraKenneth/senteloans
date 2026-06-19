import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { renderStaffPdfBuffer } from "./staff-pdf"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

type BranchScope = { id: string; name: string }

function buildReportTitle(params: {
  status: string
  roleLabel: string
  search: string
}): string {
  const status = (params.status || "").trim()
  const roleLabel = (params.roleLabel || "").trim()
  const search = (params.search || "").trim()
  const prefix = `${status ? `${status} ` : ""}${roleLabel ? `${roleLabel}(s) ` : ""}`
  const base = `${prefix}Staff Members Report`
  return search ? `${base} for ${search}` : base
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const role = (url.searchParams.get("role") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_users")
      if (!allowed) return { error: "missing_permission:view_users" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin(actor)) {
        const branchRes = await client.query(
          `SELECT id, name
           FROM branches
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
           FROM branches
           WHERE id = $1
           LIMIT 1`,
          [actor.branch_id]
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const roleLabelRes = role
        ? await client.query(`SELECT name FROM roles WHERE id = $1 LIMIT 1`, [role])
        : { rows: [] }
      const roleLabel = roleLabelRes.rows[0]?.name || ""
      const title = buildReportTitle({ status, roleLabel, search })

      const sheets: Array<{
        branch_id: string
        branch_name: string
        rows: Array<{
          id: string
          full_name: string
          email: string
          phone_number: string | null
          role: string | null
          status: string | null
          last_login: string | null
          joined_at: string | null
          created_at: string | null
        }>
      }> = []

      for (const branch of branchScopes) {
        let where = `u.institution_id = $1 AND u.branch_id = $2 AND app_role.app_role != 'system_admin'`
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (search) {
          where += ` AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone_number ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (role) {
          where += ` AND (app_role.app_role = $${idx} OR u.role_id::text = $${idx})`
          params.push(role)
          idx++
        }
        if (status) {
          where += ` AND u.status = $${idx}`
          params.push(status)
          idx++
        }

        const staffRes = await client.query(
          `SELECT
             u.id,
             u.full_name,
             u.email,
             u.phone_number,
             app_role.app_role AS role,
             u.status,
             u.last_login,
             u.joined_at,
             u.created_at
           FROM users u
           LEFT JOIN LATERAL (
             SELECT CASE
               WHEN r.name = 'System Admin' THEN 'system_admin'
               WHEN r.name = 'Super Admin' THEN 'super_admin'
               WHEN r.name = 'Admin' THEN 'institution_admin'
               WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
               ELSE NULL
             END AS app_role
             FROM roles r
             WHERE r.id = u.role_id
           ) app_role ON TRUE
           WHERE ${where}
           ORDER BY u.created_at DESC`,
          params
        )

        sheets.push({
          branch_id: branch.id,
          branch_name: branch.name,
          rows: staffRes.rows,
        })
      }

      return {
        title,
        sheets,
      }
    })

    if (result && "error" in result) {
      const status = result.error === "missing_permission:view_users" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Name", "Email", "Phone", "Role", "Status", "Last Login", "Joined"]
      const fmtRole = (role: string | null) => {
        switch ((role || "").trim()) {
          case "institution_admin":
            return "Admin"
          case "manager":
            return "Manager"
          case "loan_officer":
            return "Loan Officer"
          case "teller":
            return "Teller"
          default:
            return role || "—"
        }
      }

      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Staff Members Report", headers, "A1:G1")
        for (const row of sheet.rows || []) {
          ws.addRow([
            row.full_name || "—",
            row.email || "—",
            row.phone_number || "—",
            fmtRole(row.role),
            row.status || "—",
            formatIsoDateForExcel(row.last_login),
            formatIsoDateForExcel(row.joined_at || row.created_at),
          ])
        }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="staff-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderStaffPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="staff-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

