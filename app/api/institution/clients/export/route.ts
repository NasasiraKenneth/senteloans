import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderClientsPdfBuffer } from "./clients-pdf"

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

function buildTitle(input: { status: string; search: string }): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  parts.push("Clients Report")
  if (input.search) parts.push(`for ${input.search}`)
  const title = parts.join(" ").trim()
  return title === "Clients Report" ? "Clients Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_third_party_agents")
      if (!allowed) return { error: "missing_permission:view_third_party_agents" as const }
      const actorRole = String(actor.role || "").trim().toLowerCase()

      let branchScopes: BranchScope[] = []
      if (actorRole === "super_admin") {
        const branchRes = await client.query(
          `SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`,
          [actor.institution_id]
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes = selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [actor.branch_id])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({ status, search })
      const sheets: Array<{ branch_name: string; rows: Array<{ name: string; status: string; email: string | null; address: string | null; phone: string | null; created_at: string | null }> }> = []

      for (const branch of branchScopes) {
        let where = `c.institution_id = $1 AND c.branch_id = $2`
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (search) {
          where += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (status) {
          where += ` AND c.status = $${idx}`
          params.push(status)
          idx++
        }

        const clientRes = await client.query(
          `SELECT c.name, c.status, c.email, c.address, c.phone, c.created_at
           FROM third_party_agents c
           WHERE ${where}
           ORDER BY c.created_at DESC`,
          params
        )
        sheets.push({ branch_name: branch.name, rows: clientRes.rows })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "missing_permission:view_third_party_agents" || result.error === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Client", "Status", "Email", "Phone", "Address", "Created"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Clients Report", headers, "A1:F1")
        ws.columns = [
          { width: 28, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 14, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 26, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 18, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 30, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 14, style: { alignment: { wrapText: true, vertical: "top" } } },
        ]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.name || "",
            row.status || "",
            row.email || "",
            row.phone || "",
            row.address || "",
            row.created_at ? formatIsoDateForExcel(row.created_at) : "",
          ])
          added.eachCell((cell: any) => {
            cell.alignment = { wrapText: true, vertical: "top" }
          })
          added.getCell(4).numFmt = "@"
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="clients-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderClientsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="clients-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

