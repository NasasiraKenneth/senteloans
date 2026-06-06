import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel } from "@/lib/export/server-excel"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { renderRepaymentSchedulePdfBuffer } from "./repayment-schedule-pdf"

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
    const { id: loanId } = await params
    if (!loanId) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const staff = await requireStaffSession()
    if (!staff.ok) {
      return NextResponse.json(
        {
          error:
            staff.error === "unauthorized" ? "unauthorized" : "no_app_user_profile",
        },
        { status: staff.status },
      )
    }

    const url = new URL(req.url)
    const format = String(url.searchParams.get("format") || "").trim().toLowerCase()
    if (format !== "excel" && format !== "pdf") {
      return NextResponse.json({ error: "invalid_format" }, { status: 400 })
    }

    const result = await runWithAuth(staff.authUserId, async (client) => {
      const actor = await resolveActorContext(client, staff.authUserId)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      // Same gate as GET /api/institution/loans/[id]/repayments — export is read-only schedule data.
      const canView = await hasPermission(client, actor, "view_loans")
      if (!canView) return { error: "missing_permission:view_loans" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT l.id, l.application_id, l.institution_id, l.branch_id, l.member_id, m.full_name AS member_name
         FROM loans l
         LEFT JOIN members m ON m.id = l.member_id
         WHERE l.id = $1`,
        [loanId],
      )
      const loan = loanRes.rows[0] as
        | {
            id: string
            application_id: string
            institution_id: string
            branch_id: string | null
            member_id: string | null
            member_name: string | null
          }
        | undefined
      if (!loan) return { error: "not_found" as const }
      if (String(loan.institution_id) !== String(actor.institution_id)) return { error: "not_found" as const }
      if (!isSuperAdmin(actor) && String(loan.branch_id || "") !== String(actor.branch_id || "")) {
        return { error: "not_found" as const }
      }

      const res = await client.query(
        `SELECT installment_number, due_date, principal_amount, interest_amount, total_amount,
                amount_paid, payment_date, penalty_amount, amount_due, days_overdue, status
         FROM loan_repayments
         WHERE loan_id = $1
         ORDER BY installment_number ASC`,
        [loanId],
      )

      const applicationId = String(loan.application_id || "").trim()
      const memberName = String(loan.member_name || "").trim() || "Member"
      const title = `Repayment schedule — ${applicationId || loanId} — ${memberName}`.replace(/\s+/g, " ").trim()

      const rows = res.rows.map((r: Record<string, unknown>) => ({
        installment: Number(r.installment_number ?? 0),
        due_date: r.due_date != null ? String(r.due_date).slice(0, 10) : null,
        principal: Number(r.principal_amount || 0),
        interest: Number(r.interest_amount || 0),
        monthly_payment: Number(r.total_amount || 0),
        amount_paid: Number(r.amount_paid || 0),
        payment_date: r.payment_date != null ? String(r.payment_date).slice(0, 10) : null,
        penalty: Number(r.penalty_amount || 0),
        amount_due: Number(r.amount_due || 0),
        days_overdue: Number(r.days_overdue || 0),
        status: String(r.status || "Pending"),
      }))

      return { title, rows }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "not_found" ? 404
        : code === "missing_permission:view_loans" || code === "no_app_user_profile" ? 403
        : code === "actor_branch_missing" ? 400
        : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    if (!result || !("rows" in result)) {
      return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })
    }

    const filenameBase = `repayment-schedule-${fileDateTimeStamp()}`

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const ws = workbook.addWorksheet("Repayment schedule")
      const headers = [
        "#",
        "Due date",
        "Principal",
        "Interest",
        "Monthly payment",
        "Amount paid",
        "Payment date",
        "Penalty",
        "Amount due",
        "Days overdue",
        "Status",
      ]
      addExcelTitleAndHeaders(ws, result.title, headers, "A1:K1")
      ws.columns = [
        { width: 6 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 14 },
        { width: 12 },
        { width: 12 },
      ]
      for (const row of result.rows) {
        const added = ws.addRow([
          row.installment,
          row.due_date ? formatIsoDateForExcel(row.due_date) : "—",
          row.principal,
          row.interest,
          row.monthly_payment,
          row.amount_paid,
          row.payment_date ? formatIsoDateForExcel(row.payment_date) : "—",
          row.penalty,
          row.amount_due,
          row.days_overdue,
          row.status,
        ])
        added.eachCell((cell: any) => {
          cell.alignment = { wrapText: true, vertical: "top" }
        })
      }
      const buffer = await workbook.xlsx.writeBuffer()
      const body =
        buffer instanceof Buffer
          ? new Uint8Array(buffer)
          : new Uint8Array(buffer as ArrayBuffer)
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      })
    }

    const buffer = await renderRepaymentSchedulePdfBuffer({
      title: result.title,
      rows: result.rows,
    })
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
