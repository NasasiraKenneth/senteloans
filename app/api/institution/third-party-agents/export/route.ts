import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"
import { assertActorActive } from "@/lib/staff/staff-status"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderThirdPartyAgentsPdfBuffer } from "./third-party-agents-pdf"

type BranchScope = { id: string; name: string }

function buildTitle(input: { status: string; search: string }): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  parts.push("Third Party Agents Report")
  if (input.search) parts.push(`for ${input.search}`)
  const title = parts.join(" ").trim()
  return title === "Third Party Agents Report" ? title : title
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.export.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.export.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const allowed = await hasPermission(client, actor, "view_third_party_agents")
      if (!allowed) return { error: "missing_permission:view_third_party_agents" as const }

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin(actor)) {
        const branchRes = await client.query(
          `SELECT id, name FROM branches WHERE institution_id = $1 ORDER BY name ASC`,
          [actor.institution_id],
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0
            ? allBranches.filter((b) => selectedBranchIds.includes(b.id))
            : allBranches
      } else {
        if (!actor.branch_id) return { error: "actor_branch_missing" as const }
        const branchRes = await client.query(
          `SELECT id, name FROM branches WHERE id = $1 LIMIT 1`,
          [actor.branch_id],
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({ status, search })
      const sheets: Array<{
        branch_name: string
        rows: Array<{
          name: string
          status: string
          email: string | null
          address: string | null
          phone: string | null
          created_at: string | null
        }>
      }> = []

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

        const agentRes = await client.query(
          `SELECT c.name, c.status, c.email, c.address, c.phone, c.created_at
           FROM third_party_agents c
           WHERE ${where}
           ORDER BY c.created_at DESC`,
          params,
        )
        sheets.push({ branch_name: branch.name, rows: agentRes.rows })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "staff_inactive" ||
        errorCode === "missing_permission:view_third_party_agents" ||
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "third_party_agents.export.denied", {
        method: "GET",
        apiPath,
        status: statusCode,
        error: errorCode,
        authUserId: session.user.authUserId,
      })
      const payload: Record<string, unknown> = { error: errorCode, code: errorCode }
      if ("staffStatus" in result && result.staffStatus) {
        payload.staff_status = result.staffStatus
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    if (!result || ("error" in result)) {
      apiLog("error", "third_party_agents.export.error", { method: "GET", apiPath, status: 500, error: "unexpected_export_payload" })
      return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })
    }

    const date = new Date().toISOString().slice(0, 10)
    const rowCount = (result.sheets || []).reduce((sum, sheet) => sum + (sheet.rows?.length || 0), 0)

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Agent", "Status", "Email", "Phone", "Address", "Created"]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Third Party Agents Report", headers, "A1:F1")
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
          added.eachCell((cell: { alignment?: unknown }) => {
            cell.alignment = { wrapText: true, vertical: "top" }
          })
          added.getCell(4).numFmt = "@"
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      apiLog("info", "third_party_agents.export.success", {
        method: "GET",
        apiPath,
        status: 200,
        format: "excel",
        rowCount,
        authUserId: session.user.authUserId,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="third-party-agents-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderThirdPartyAgentsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      apiLog("info", "third_party_agents.export.success", {
        method: "GET",
        apiPath,
        status: 200,
        format: "pdf",
        rowCount,
        authUserId: session.user.authUserId,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="third-party-agents-report-${date}.pdf"`,
        },
      })
    }

    apiLog("info", "third_party_agents.export.preview", {
      method: "GET",
      apiPath,
      status: 200,
      rowCount,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.export.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
