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
import { renderGrantsPdfBuffer } from "./grants-pdf"

type BranchScope = { id: string; name: string }

type ExportRow = {
  client_name: string
  total_amount: number
  available_balance: number
  percentage_received: number
  remaining_amount: number
  created_at: string | null
  updated_at: string | null
}

function buildTitle(input: {
  search: string
  createdFrom: string
  createdTo: string
  updatedFrom: string
  updatedTo: string
}): string {
  const parts: string[] = ["Grants Report"]
  if (input.search) parts.push(`For ${input.search}`)
  if (input.createdFrom || input.createdTo) {
    parts.push(`Created from ${input.createdFrom || "—"} to ${input.createdTo || "—"}`)
  }
  if (input.updatedFrom || input.updatedTo) {
    parts.push(`Updated from ${input.updatedFrom || "—"} to ${input.updatedTo || "—"}`)
  }
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
    const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    const readIsoDate = (key: string) => {
      const raw = (url.searchParams.get(key) || "").trim()
      return isIsoDate(raw) ? raw : ""
    }
    const createdFrom = readIsoDate("created_from")
    const createdTo = readIsoDate("created_to")
    const updatedFrom = readIsoDate("updated_from")
    const updatedTo = readIsoDate("updated_to")
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants)
      if (!allowed) return { error: "missing_permission:view_grants" as const }
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

      const title = buildTitle({ search, createdFrom, createdTo, updatedFrom, updatedTo })
      const sheets: Array<{ branch_name: string; rows: ExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "g.institution_id = $1 AND g.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (search) {
          where += ` AND c.name ILIKE $${idx}`
          params.push(`%${search}%`)
          idx++
        }
        if (createdFrom) {
          where += ` AND g.created_at >= $${idx}::date`
          params.push(createdFrom)
          idx++
        }
        if (createdTo) {
          where += ` AND g.created_at < ($${idx}::date + INTERVAL '1 day')`
          params.push(createdTo)
          idx++
        }
        if (updatedFrom) {
          where += ` AND g.updated_at >= $${idx}::date`
          params.push(updatedFrom)
          idx++
        }
        if (updatedTo) {
          where += ` AND g.updated_at < ($${idx}::date + INTERVAL '1 day')`
          params.push(updatedTo)
          idx++
        }

        const rowsRes = await client.query(
          `SELECT
             c.name AS client_name,
             COALESCE(g.total_amount, 0)::numeric AS total_amount,
             COALESCE(g.available_balance, 0)::numeric AS available_balance,
             GREATEST(COALESCE(g.total_amount, 0) - COALESCE(g.available_balance, 0), 0)::numeric AS remaining_amount,
             CASE
               WHEN COALESCE(g.total_amount, 0) > 0
                 THEN ROUND((COALESCE(g.available_balance, 0) / g.total_amount) * 100, 2)
               ELSE 0
             END::numeric AS percentage_received,
             g.created_at,
             g.updated_at
           FROM senteloans_grants g
           JOIN senteloans_clients c ON c.id = g.client_id
           WHERE ${where}
           ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC`,
          params,
        )

        sheets.push({
          branch_name: branch.name,
          rows: rowsRes.rows.map((r: Record<string, unknown>) => ({
            client_name: String(r.client_name || ""),
            total_amount: Number(r.total_amount || 0),
            available_balance: Number(r.available_balance || 0),
            percentage_received: Number(r.percentage_received || 0),
            remaining_amount: Number(r.remaining_amount || 0),
            created_at: r.created_at ? String(r.created_at) : null,
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
      const headers = [
        "Client",
        "Total grant",
        "Available",
        "Percentage received",
        "Remaining amount",
        "Created at",
        "Updated",
      ]
      for (const sheet of result.sheets) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title, headers, "A1:G1")
        ws.columns = [
          { width: 28 },
          { width: 16 },
          { width: 16 },
          { width: 18 },
          { width: 18 },
          { width: 14 },
          { width: 14 },
        ]
        for (const row of sheet.rows) {
          ws.addRow([
            row.client_name,
            Number(row.total_amount || 0),
            Number(row.available_balance || 0),
            `${Number(row.percentage_received || 0)}%`,
            Number(row.remaining_amount || 0),
            row.created_at ? formatIsoDateForExcel(row.created_at) : "",
            row.updated_at ? formatIsoDateForExcel(row.updated_at) : "",
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="grants-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderGrantsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="grants-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.export.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
