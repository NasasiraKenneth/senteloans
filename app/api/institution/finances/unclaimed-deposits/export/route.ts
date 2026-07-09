import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, requireStaffSession } from "@/lib/api/rbac"
import {
  assertFinanceReadAccess,
  financeAccessErrorResponseOrNull,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { parseUnclaimedAssignedTypeFilter } from "@/lib/finances/unclaimed-deposit"
import { renderUnclaimedDepositsPdfBuffer } from "./unclaimed-deposits-pdf"

type BranchScope = { id: string; name: string }

type ExportRow = {
  unclaimed_deposit_number: string
  transaction_number: string
  date: string | null
  assigned_to: string
  assigned_type: string
  mode: string
  amount: number
  status: string
}

function capitalize(value: string): string {
  if (!value) return ""
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildTitle(input: {
  search: string
  status: string
  assignedType: string
  dateFrom: string
  dateTo: string
}): string {
  const parts: string[] = ["Unclaimed Deposits Report"]
  if (input.status) parts.push(`(${capitalize(input.status)})`)
  if (input.search) parts.push(`For ${input.search}`)
  if (input.assignedType) parts.push(`Assigned to ${capitalize(input.assignedType)}s`)
  if (input.dateFrom || input.dateTo) {
    parts.push(`Deposited from ${input.dateFrom || "—"} to ${input.dateTo || "—"}`)
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
    const status = (url.searchParams.get("status") || "").trim().toLowerCase()
    const assignedTypeRaw = (url.searchParams.get("assigned_type") || "").trim().toLowerCase()
    const assignedType = parseUnclaimedAssignedTypeFilter(assignedTypeRaw)
    const dateFromRaw = (url.searchParams.get("date_from") || "").trim()
    const dateToRaw = (url.searchParams.get("date_to") || "").trim()
    const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    const dateFrom = isIsoDate(dateFromRaw) ? dateFromRaw : ""
    const dateTo = isIsoDate(dateToRaw) ? dateToRaw : ""
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw
      ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : []
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceReadAccess(client, sess.authUserId, FINANCE_PERMISSIONS.viewUnclaimedDeposits)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      let branchScopes: BranchScope[] = []
      if (isSuperAdmin(actor)) {
        const branchRes = await client.query(
          `SELECT id, name
           FROM branches
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
          `SELECT id, name FROM branches WHERE id = $1 LIMIT 1`,
          [actor.branch_id],
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildTitle({ search, status, assignedType, dateFrom, dateTo })
      const sheets: Array<{ branch_name: string; rows: ExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "ud.institution_id = $1 AND ud.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (status) {
          where += ` AND lower(trim(ud.status)) = lower(trim($${idx}::text))`
          params.push(status)
          idx++
        }

        if (search) {
          where += ` AND (
            ud.unclaimed_deposit_number ILIKE $${idx}
            OR ud.transaction_number ILIKE $${idx}
            OR m.full_name ILIKE $${idx}
            OR c.name ILIKE $${idx}
          )`
          params.push(`%${search}%`)
          idx++
        }

        if (assignedType === "member") {
          where += ` AND ud.member_id IS NOT NULL`
        } else if (assignedType === "third_party_agent") {
          where += ` AND ud.third_party_agent_id IS NOT NULL`
        }

        if (dateFrom) {
          where += ` AND ud.date >= $${idx}::date`
          params.push(dateFrom)
          idx++
        }
        if (dateTo) {
          where += ` AND ud.date <= $${idx}::date`
          params.push(dateTo)
          idx++
        }

        const rowsRes = await client.query(
          `SELECT
             COALESCE(ud.unclaimed_deposit_number, '') AS unclaimed_deposit_number,
             COALESCE(ud.transaction_number, '') AS transaction_number,
             ud.date,
             COALESCE(m.full_name, c.name, '—') AS assigned_to,
             CASE
               WHEN ud.member_id IS NOT NULL THEN 'Member'
               WHEN ud.third_party_agent_id IS NOT NULL THEN 'Third Party Agent'
               ELSE '—'
             END AS assigned_type,
             COALESCE(ud.mode::text, '') AS mode,
             COALESCE(ud.amount, 0)::numeric AS amount,
             COALESCE(ud.status, 'unclaimed') AS status
           FROM unclaimed_deposits ud
           LEFT JOIN members m ON m.id = ud.member_id
           LEFT JOIN third_party_agents c ON c.id = ud.third_party_agent_id
           WHERE ${where}
           ORDER BY ud.date DESC NULLS LAST, ud.created_at DESC`,
          params,
        )

        sheets.push({
          branch_name: branch.name,
          rows: rowsRes.rows.map((r: Record<string, unknown>) => ({
            unclaimed_deposit_number: String(r.unclaimed_deposit_number || ""),
            transaction_number: String(r.transaction_number || ""),
            date: r.date ? toDateOnlyString(r.date as string | Date) : null,
            assigned_to: String(r.assigned_to || "—"),
            assigned_type: String(r.assigned_type || "—"),
            mode: String(r.mode || ""),
            amount: Number(r.amount || 0),
            status: String(r.status || "unclaimed"),
          })),
        })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const statusCode = result.error === "no_branch_scope" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || "error" in result) {
      return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })
    }

    const date = new Date().toISOString().slice(0, 10)

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = [
        "Deposit #",
        "Reference",
        "Date",
        "Assigned to",
        "Type",
        "Mode",
        "Amount",
        "Status",
      ]
      for (const sheet of result.sheets) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title, headers, "A1:H1")
        ws.columns = [
          { width: 22 },
          { width: 22 },
          { width: 14 },
          { width: 24 },
          { width: 12 },
          { width: 14 },
          { width: 16 },
          { width: 14 },
        ]
        for (const row of sheet.rows) {
          ws.addRow([
            row.unclaimed_deposit_number || "",
            row.transaction_number || "",
            row.date ? formatIsoDateForExcel(row.date) : "",
            row.assigned_to || "",
            row.assigned_type || "",
            row.mode || "",
            Number(row.amount || 0),
            row.status || "",
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="unclaimed-deposits-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderUnclaimedDepositsPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="unclaimed-deposits-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.export.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
