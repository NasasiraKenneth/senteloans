import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel } from "@/lib/export/server-excel"
import { renderAccountStatementPdfBuffer } from "./account-statement-pdf"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

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

function buildTitle(input: {
  memberName: string
  accountNumber: string
  type: string
  modeLabel: string
  dateStart: string
  dateEnd: string
}): string {
  const base = `${input.memberName || "Member"} ${input.accountNumber || ""} Account Statement`
    .replace(/\s+/g, " ")
    .trim()
  const hasFilters = Boolean(input.type || input.modeLabel || input.dateStart || input.dateEnd)
  if (!hasFilters) return `${base} Report`

  const parts: string[] = [base]
  if (input.type) parts.push(input.type)
  if (input.modeLabel) parts.push(input.modeLabel)
  parts.push("Report")
  if (input.dateStart || input.dateEnd) {
    parts.push(`For Transactions from transaction date range ${input.dateStart || "—"} to ${input.dateEnd || "—"}`)
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function fileDateTimeStamp(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const hh = String(now.getHours()).padStart(2, "0")
  const mi = String(now.getMinutes()).padStart(2, "0")
  const ss = String(now.getSeconds()).padStart(2, "0")
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const format = String(url.searchParams.get("format") || "").trim().toLowerCase()
    const type = String(url.searchParams.get("type") || "").trim()
    const modeRaw = String(url.searchParams.get("mode") || "").trim()
    const modes = modeRaw
      ? modeRaw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : []
    const dateStart = String(url.searchParams.get("dateStart") || "").trim()
    const dateEnd = String(url.searchParams.get("dateEnd") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canView = await hasPermission(client, actor, "view_account")
      if (!canView) return { error: "missing_permission:view_account" as const }
      const canGenerate = await hasPermission(client, actor, "generate_account_statements")
      if (!canGenerate) return { error: "missing_permission:generate_account_statements" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      const whereScope =
        role === "super_admin"
          ? "sa.id = $1 AND sa.institution_id = $2"
          : "sa.id = $1 AND sa.institution_id = $2 AND sa.branch_id = $3"
      const scopeParams: unknown[] = role === "super_admin" ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id]

      const accountRes = await client.query(
        `SELECT sa.id, sa.account_number, sa.member_id
         FROM savings_accounts sa
         WHERE ${whereScope}
         LIMIT 1`,
        scopeParams
      )
      const account = accountRes.rows[0]
      if (!account) return { error: "account_not_found" as const }

      let memberName = ""
      if (account.member_id) {
        const memberRes = await client.query(`SELECT full_name FROM members WHERE id = $1 LIMIT 1`, [account.member_id])
        memberName = String(memberRes.rows[0]?.full_name || "").trim()
      }

      const where: string[] = ["account_id = $1"]
      const values: unknown[] = [account.id]
      let arg = 2
      if (type) {
        where.push(`type::text = $${arg++}`)
        values.push(type)
      }
      if (modes.length > 0) {
        where.push(`mode::text = ANY($${arg++}::text[])`)
        values.push(modes)
      }
      if (dateStart) {
        where.push(`transaction_date::date >= $${arg++}::date`)
        values.push(dateStart)
      }
      if (dateEnd) {
        where.push(`transaction_date::date <= $${arg++}::date`)
        values.push(dateEnd)
      }

      const txRes = await client.query(
        `SELECT type, mode, amount, description, balance_after, transaction_date
         FROM transactions
         WHERE ${where.join(" AND ")}
         ORDER BY transaction_date DESC`,
        values
      )

      return {
        title: buildTitle({
          memberName,
          accountNumber: String(account.account_number || ""),
          type,
          modeLabel: modes.join(", "),
          dateStart,
          dateEnd,
        }),
        rows: txRes.rows.map((row: any) => ({
          type: String(row.type || ""),
          mode: String(row.mode || ""),
          amount: Number(row.amount || 0),
          description: String(row.description || ""),
          balance: Number(row.balance_after || 0),
          date: row.transaction_date ? String(row.transaction_date) : null,
        })),
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "account_not_found" ? 404 : result.error.startsWith("missing_permission:") || result.error === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const filenameBase = `account statement ${fileDateTimeStamp()}`
    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const ws = workbook.addWorksheet("Account Statement")
      const headers = ["Date", "Type", "Amount", "Mode", "Description", "Balance"]
      addExcelTitleAndHeaders(ws, result.title, headers, "A1:F1")
      ws.columns = [{ width: 14 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 38 }, { width: 14 }]
      for (const row of result.rows) {
        const added = ws.addRow([
          row.date ? formatIsoDateForExcel(row.date) : "",
          row.type,
          Number(row.amount || 0),
          row.mode,
          row.description,
          Number(row.balance || 0),
        ])
        added.eachCell((cell: any) => {
          cell.alignment = { wrapText: true, vertical: "top" }
        })
      }
      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderAccountStatementPdfBuffer({
        title: result.title,
        rows: result.rows,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
