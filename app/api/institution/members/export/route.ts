import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { addExcelTitleAndHeaders, createExcelWorkbook, formatIsoDateForExcel, toSafeExcelSheetName } from "@/lib/export/server-excel"
import { renderMembersPdfBuffer } from "./members-pdf"

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
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1 AND rp.branch_id = $2 AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function buildTitle(input: {
  status: string
  opening: string
  membership: string
  kyc: string
  kycStart: string
  kycEnd: string
}): string {
  const parts: string[] = []
  if (input.status) parts.push(input.status)
  if (input.opening === "true") parts.push("Opening Balance Recorded")
  else if (input.opening === "false") parts.push("Opening Balance Not Recorded")
  if (input.membership === "fully_paid") parts.push("Fully Paid Membership")
  else if (input.membership === "partial") parts.push("Partial Membership")
  if (input.kyc) parts.push(input.kyc)
  parts.push("Members Report")
  if (input.kycStart || input.kycEnd) {
    const start = input.kycStart || "—"
    const end = input.kycEnd || "—"
    parts.push(`KYC Verified from ${start} to ${end}`)
  }
  const title = parts.join(" ").trim()
  return title === "Members Report" ? "Members Report" : title
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const status = (url.searchParams.get("status") || "").trim()
    const kyc = (url.searchParams.get("kyc") || "").trim()
    const membershipPaymentStatus = (url.searchParams.get("membershipPaymentStatus") || "").trim()
    const openingBalanceRecorded = (url.searchParams.get("openingBalanceRecorded") || "").trim().toLowerCase()
    const kycApprovedAtStart = (url.searchParams.get("kycApprovedAtStart") || "").trim()
    const kycApprovedAtEnd = (url.searchParams.get("kycApprovedAtEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const format = (url.searchParams.get("format") || "").trim().toLowerCase()
    const selectedBranchIds = branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }
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
        const branchRes = await client.query(
          `SELECT id, name FROM branches WHERE id = $1 LIMIT 1`,
          [actor.branch_id]
        )
        branchScopes = branchRes.rows.length > 0 ? [branchRes.rows[0] as BranchScope] : []
      }

      const title = buildTitle({
        status,
        opening: openingBalanceRecorded,
        membership: membershipPaymentStatus,
        kyc,
        kycStart: kycApprovedAtStart,
        kycEnd: kycApprovedAtEnd,
      })

      const sheets: Array<{
        branch_name: string
        rows: Array<{
          member_number: string
          full_name: string
          phone_number: string
          email: string | null
          district: string | null
          status: string
          kyc_status: string
          membership_fee_paid: number | null
          kyc_approved_at: string | null
          join_date: string | null
        }>
      }> = []

      for (const branch of branchScopes) {
        let where = `c.institution_id = $1 AND c.branch_id = $2`
        const params: unknown[] = [actor.institution_id, branch.id]
        let idx = 3

        if (search) {
          where += ` AND (c.full_name ILIKE $${idx} OR c.member_number ILIKE $${idx} OR c.phone_number ILIKE $${idx} OR c.email ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (status) {
          where += ` AND c.status = $${idx}`
          params.push(status)
          idx++
        }
        if (kyc) {
          where += ` AND c.kyc_status = $${idx}`
          params.push(kyc)
          idx++
        }
        if (openingBalanceRecorded === "true" || openingBalanceRecorded === "false") {
          where += ` AND c.opening_balance_recorded = $${idx}`
          params.push(openingBalanceRecorded === "true")
          idx++
        }
        if (membershipPaymentStatus === "fully_paid") {
          where += ` AND (
            EXISTS (
              SELECT 1 FROM config cfg
              WHERE cfg.branch_id = c.branch_id
                AND COALESCE(cfg.membership_fee, 0) > 0
                AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) >= cfg.membership_fee
            )
            OR (
              NOT EXISTS (
                SELECT 1 FROM config cfg2
                WHERE cfg2.branch_id = c.branch_id
                  AND COALESCE(cfg2.membership_fee, 0) > 0
              )
              AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) > 0
            )
          )`
        } else if (membershipPaymentStatus === "partial") {
          where += ` AND EXISTS (
            SELECT 1 FROM config cfg
            WHERE cfg.branch_id = c.branch_id
              AND COALESCE(cfg.membership_fee, 0) > 0
              AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) > 0
              AND COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0) < cfg.membership_fee
          )`
        }
        if (kycApprovedAtStart) {
          where += ` AND c.kyc_approved_at >= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
          params.push(kycApprovedAtStart)
          idx++
        }
        if (kycApprovedAtEnd) {
          where += ` AND c.kyc_approved_at <= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
          params.push(kycApprovedAtEnd)
          idx++
        }

        const memberRes = await client.query(
          `SELECT
              c.member_number,
              c.full_name,
              c.phone_number,
              c.email,
              c.district,
              c.status,
              c.kyc_status,
              COALESCE((SELECT SUM(mf.amount_paid) FROM membership_fees mf WHERE mf.member_id = c.id), 0)::numeric AS membership_fee_paid,
              c.kyc_approved_at,
              c.join_date
           FROM members c
           WHERE ${where}
           ORDER BY c.created_at DESC`,
          params
        )

        sheets.push({ branch_name: branch.name, rows: memberRes.rows })
      }

      return { title, sheets }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_members" || result.error === "no_app_user_profile"
          ? 403
          : 400
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result || ("error" in result)) return NextResponse.json({ error: "Unexpected export payload" }, { status: 500 })

    const date = new Date().toISOString().slice(0, 10)

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Member #", "Name", "Phone", "Email", "District", "Status", "KYC", "Membership Paid", "KYC Approved At", "Join Date"]

      for (const sheet of result.sheets || []) {
        const ws = workbook.addWorksheet(toSafeExcelSheetName(sheet.branch_name))
        addExcelTitleAndHeaders(ws, result.title || "Members Report", headers, "A1:J1")
        ws.columns = [
          { width: 16, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 24, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 18, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 24, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 18, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 12, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 12, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 18, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 18, style: { alignment: { wrapText: true, vertical: "top" } } },
          { width: 14, style: { alignment: { wrapText: true, vertical: "top" } } },
        ]
        for (const row of sheet.rows || []) {
          const added = ws.addRow([
            row.member_number || "",
            row.full_name || "",
            row.phone_number || "",
            row.email || "",
            row.district || "",
            row.status || "",
            row.kyc_status || "",
            Number(row.membership_fee_paid || 0),
            row.kyc_approved_at ? formatIsoDateForExcel(row.kyc_approved_at) : "",
            row.join_date ? formatIsoDateForExcel(row.join_date) : "",
          ])
          added.eachCell((cell: any) => {
            cell.alignment = { wrapText: true, vertical: "top" }
          })
          // Keep identifiers/phone as plain text without prefix apostrophes.
          added.getCell(1).numFmt = "@"
          added.getCell(3).numFmt = "@"
        }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="members-report-${date}.xlsx"`,
        },
      })
    }

    if (format === "pdf") {
      const buffer = await renderMembersPdfBuffer({
        title: result.title,
        sheets: result.sheets,
      })
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="members-report-${date}.pdf"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

