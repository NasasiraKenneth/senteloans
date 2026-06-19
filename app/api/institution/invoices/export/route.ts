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
import { renderInvoicesPdfBuffer, type InvoiceExportRow } from "./invoices-pdf"

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
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
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
    [authUserId],
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
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
}

function formatStatusForRow(status: string): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function targetLabel(targetType: string): string {
  const t = targetType.trim().toLowerCase()
  if (t === "member") return "Member"
  if (t === "client") return "Client"
  return ""
}

function formatInvoiceTypeDisplay(raw: string): string {
  return String(raw || "").trim() === "Auto" ? "Auto" : "Manual"
}

function buildInvoicesExportTitle(input: {
  status: string
  invoiceType: string
  targetType: string
  search: string
  dateFrom: string
  dateTo: string
  dueFrom: string
  dueTo: string
}): string {
  const hasStructured =
    !!input.status.trim() ||
    !!input.invoiceType.trim() ||
    !!input.targetType.trim() ||
    !!input.search.trim() ||
    !!input.dateFrom ||
    !!input.dateTo ||
    !!input.dueFrom ||
    !!input.dueTo

  if (!hasStructured) return "Invoice List"

  const parts: string[] = []
  if (input.status.trim()) parts.push(formatStatusForRow(input.status))
  if (input.invoiceType.trim()) parts.push(input.invoiceType.trim())
  const tl = targetLabel(input.targetType)
  if (tl) parts.push(tl)
  parts.push("Invoice List")
  if (input.search.trim()) parts.push(`For ${input.search.trim()}`)
  if (input.dateFrom || input.dateTo) {
    parts.push(`Created from ${input.dateFrom || "—"} to ${input.dateTo || "—"}`)
  }
  if (input.dueFrom || input.dueTo) {
    parts.push(`Due from ${input.dueFrom || "—"} to ${input.dueTo || "—"}`)
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function appendInvoiceFilters(
  where: string,
  params: unknown[],
  idx: number,
  filters: {
    status: string
    invoiceType: string
    targetType: string
    search: string
    dateFrom: string
    dateTo: string
    dueFrom: string
    dueTo: string
  },
): { where: string; params: unknown[]; nextIdx: number } {
  let w = where
  const p = [...params]
  let i = idx
  if (filters.status) {
    w += ` AND LOWER(i.status) = LOWER($${i++})`
    p.push(filters.status)
  }
  if (filters.invoiceType) {
    w += ` AND LOWER(i.invoice_type) = LOWER($${i++})`
    p.push(filters.invoiceType)
  }
  if (filters.targetType === "member") {
    w += ` AND i.member_id IS NOT NULL AND i.client_id IS NULL`
  } else if (filters.targetType === "client") {
    w += ` AND i.client_id IS NOT NULL AND i.member_id IS NULL`
  }
  if (filters.dateFrom) {
    w += ` AND i.invoice_date >= (($${i}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    p.push(filters.dateFrom)
    i++
  }
  if (filters.dateTo) {
    w += ` AND i.invoice_date <= (($${i}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    p.push(filters.dateTo)
    i++
  }
  if (filters.dueFrom) {
    w += ` AND i.invoice_due >= (($${i}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    p.push(filters.dueFrom)
    i++
  }
  if (filters.dueTo) {
    w += ` AND i.invoice_due <= (($${i}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    p.push(filters.dueTo)
    i++
  }
  if (filters.search) {
    w += ` AND (
          i.invoice_number ILIKE $${i}
          OR i.inwords ILIKE $${i}
          OR m.full_name ILIKE $${i}
          OR m.member_number ILIKE $${i}
          OR c.name ILIKE $${i}
        )`
    p.push(`%${filters.search}%`)
    i++
  }
  return { where: w, params: p, nextIdx: i }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const invoiceType = (url.searchParams.get("invoice_type") || "").trim()
    const targetType = (url.searchParams.get("target_type") || "").trim().toLowerCase()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const dueFrom = (
      url.searchParams.get("due_from") ||
      url.searchParams.get("invoice_due_from") ||
      ""
    ).trim()
    const dueTo = (
      url.searchParams.get("due_to") ||
      url.searchParams.get("invoice_due_to") ||
      ""
    ).trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()

    const filterPayload = {
      status,
      invoiceType,
      targetType,
      search,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_invoices")
      if (!allowed) return { error: "missing_permission:view_invoices" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let branchScopes: BranchScope[] = []
      if (actorRole === "super_admin") {
        const branchRes = await client.query(
          `SELECT id, name
           FROM branches
           WHERE institution_id = $1
           ORDER BY name ASC`,
          [actor.institution_id],
        )
        const allBranches = branchRes.rows as BranchScope[]
        branchScopes =
          selectedBranchIds.length > 0 ? allBranches.filter((b) => selectedBranchIds.includes(b.id)) : allBranches
      } else {
        const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [
          actor.branch_id,
        ])
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      if (branchScopes.length === 0) return { error: "no_branch_scope" as const }

      const title = buildInvoicesExportTitle({
        status,
        invoiceType,
        targetType,
        search,
        dateFrom,
        dateTo,
        dueFrom,
        dueTo,
      })

      const sheets: Array<{ branch_name: string; rows: InvoiceExportRow[] }> = []

      for (const branch of branchScopes) {
        let where = "i.institution_id = $1 AND i.branch_id = $2"
        const params: unknown[] = [actor.institution_id, branch.id]
        const built = appendInvoiceFilters(where, params, 3, filterPayload)
        where = built.where
        const queryParams = built.params

        const dataRes = await client.query(
          `SELECT
             i.invoice_number,
             COALESCE(m.full_name, c.name, '') AS assigned_to,
             CASE
               WHEN i.member_id IS NOT NULL AND i.client_id IS NULL THEN 'Member'
               WHEN i.client_id IS NOT NULL AND i.member_id IS NULL THEN 'Client'
               ELSE '—'
             END AS target_label,
             i.invoice_type,
             i.status,
             i.invoice_date::text AS invoice_date,
             i.invoice_due::text AS invoice_due,
             i.subtotal,
             i.vat,
             i.total_amount,
             u.full_name AS created_by_name
           FROM invoices i
           LEFT JOIN members m ON m.id = i.member_id
           LEFT JOIN clients c ON c.id = i.client_id
           LEFT JOIN users u ON u.id = i.created_by
           WHERE ${where}
           ORDER BY i.created_at DESC`,
          queryParams,
        )

        sheets.push({
          branch_name: branch.name,
          rows: dataRes.rows.map((row: Record<string, unknown>) => ({
            invoice_number: String(row.invoice_number || ""),
            assigned_to: String(row.assigned_to || ""),
            target_label: String(row.target_label || ""),
            invoice_type: formatInvoiceTypeDisplay(String(row.invoice_type || "")),
            status: formatStatusForRow(String(row.status || "")),
            invoice_date: row.invoice_date ? String(row.invoice_date) : null,
            invoice_due: row.invoice_due ? String(row.invoice_due) : null,
            subtotal: Number(row.subtotal || 0),
            vat: Number(row.vat || 0),
            total_amount: Number(row.total_amount || 0),
            created_by_name: String(row.created_by_name || ""),
          })),
        })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "user_not_linked" || result.error.startsWith("missing_permission:") ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || "error" in result) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = [
        "Invoice #",
        "Assigned to",
        "Target",
        "Type",
        "Status",
        "Inv date",
        "Due",
        "Subtotal",
        "VAT",
        "Total",
        "Created by",
      ]
      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Invoice List", headers, "A1:K1")
        ws.columns = [
          { width: 16 },
          { width: 22 },
          { width: 10 },
          { width: 10 },
          { width: 12 },
          { width: 12 },
          { width: 12 },
          { width: 12 },
          { width: 10 },
          { width: 12 },
          { width: 18 },
        ]
        for (const row of sheet.rows || []) {
          ws.addRow([
            row.invoice_number,
            row.assigned_to,
            row.target_label,
            row.invoice_type,
            row.status,
            row.invoice_date ? formatIsoDateForExcel(row.invoice_date) : "",
            row.invoice_due ? formatIsoDateForExcel(row.invoice_due) : "",
            row.subtotal,
            row.vat,
            row.total_amount,
            row.created_by_name,
          ])
        }
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="invoice-list-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderInvoicesPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="invoice-list-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: "invalid_format" }, { status: 400 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
