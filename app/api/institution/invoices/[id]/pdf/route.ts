import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { renderSingleInvoicePdfBuffer } from "./invoice-single-pdf"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
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
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return permRes.rowCount > 0
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_invoice_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const url = new URL(req.url)
    const asDownload = url.searchParams.get("download") === "1"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const permissionName = asDownload ? "download_invoice" : "view_invoices"
      const allowed = await hasPermission(client, actor, permissionName)
      if (!allowed) return { error: `missing_permission:${permissionName}` as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const invoiceRes = await client.query(
        `SELECT
           i.id,
           i.branch_id,
           i.invoice_number,
           i.invoice_date,
           i.invoice_due,
           i.subtotal,
           i.vat,
           i.total_amount,
           i.inwords,
           i.invoice_type,
           i.status,
           COALESCE(ins.name, '') AS sacco_name,
           COALESCE(ins.logo, '') AS sacco_logo,
           COALESCE(b.name, '') AS branch_name,
           COALESCE(b.phone_number, '') AS branch_phone,
           COALESCE(b.email, '') AS branch_email,
           COALESCE(ins.website, '') AS website,
           COALESCE(b.address, '') AS branch_address,
           CASE
             WHEN i.member_id IS NOT NULL THEN COALESCE(m.full_name, '')
             ELSE COALESCE(c.name, '')
           END AS recipient_name,
           CASE
             WHEN i.member_id IS NOT NULL THEN COALESCE(m.phone_number, '')
             ELSE COALESCE(c.phone, '')
           END AS recipient_phone,
           CASE
             WHEN i.member_id IS NOT NULL THEN COALESCE(NULLIF(trim(concat_ws(', ', m.village, m.district)), ''), '')
             ELSE COALESCE(c.address, '')
           END AS recipient_address
         FROM senteloans_invoices i
         LEFT JOIN senteloans_institutions ins ON ins.id = i.institution_id
         LEFT JOIN senteloans_branches b ON b.id = i.branch_id
         LEFT JOIN senteloans_members m ON m.id = i.member_id
         LEFT JOIN senteloans_clients c ON c.id = i.client_id
         WHERE i.id = $1
           AND i.institution_id = $2
           ${isSuperAdmin ? "" : "AND i.branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      const invoice = invoiceRes.rows[0]
      if (!invoice) return { error: "invoice_not_found" as const }

      const itemsRes = await client.query(
        `SELECT unit, description, quantity, unit_price, total_price
         FROM senteloans_invoice_items
         WHERE invoice_id = $1
         ORDER BY id`,
        [id],
      )

      const bankAccountsRes = await client.query(
        `SELECT bank_name, bank_account_number
         FROM senteloans_bank_accounts
         WHERE institution_id = $1
           AND branch_id = $2
         ORDER BY created_at ASC`,
        [actor.institution_id, String(invoice.branch_id || actor.branch_id || "")],
      )

      const buffer = await renderSingleInvoicePdfBuffer({
        invoice_number: String(invoice.invoice_number || ""),
        sacco_name: String(invoice.sacco_name || ""),
        sacco_logo: String(invoice.sacco_logo || ""),
        branch_name: String(invoice.branch_name || ""),
        branch_phone: String(invoice.branch_phone || ""),
        branch_email: String(invoice.branch_email || ""),
        website: String(invoice.website || ""),
        branch_address: String(invoice.branch_address || ""),
        bank_accounts: bankAccountsRes.rows.map(
          (r: Record<string, unknown>) =>
            `${String(r.bank_name || "").trim()} - ${String(r.bank_account_number || "").trim()}`,
        ).filter((v: string) => v !== "-" && v !== " - "),
        recipient_name: String(invoice.recipient_name || ""),
        recipient_phone: String(invoice.recipient_phone || ""),
        recipient_address: String(invoice.recipient_address || ""),
        status: String(invoice.status || ""),
        invoice_type: String(invoice.invoice_type || ""),
        invoice_date: invoice.invoice_date || null,
        invoice_due: invoice.invoice_due || null,
        subtotal: Number(invoice.subtotal || 0),
        vat: Number(invoice.vat || 0),
        total_amount: Number(invoice.total_amount || 0),
        inwords: String(invoice.inwords || ""),
        items: itemsRes.rows.map((r: Record<string, unknown>) => ({
          description: String(r.description || ""),
          unit: String(r.unit || ""),
          quantity: Number(r.quantity || 0),
          unit_price: Number(r.unit_price || 0),
          total_price: Number(r.total_price || 0),
        })),
      })

      return {
        invoiceNumber: String(invoice.invoice_number || "invoice"),
        buffer,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "invoice_not_found" ? 404 :
        code.startsWith("missing_permission:") ? 403 :
        code === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: code }, { status })
    }

    const filename = `${String(result.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`
    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${filename}"`)
    headers.set("Cache-Control", "no-store")
    apiLog("info", "invoice.pdf.success", { method: "GET", apiPath, status: 200, invoiceId: id })
    return new NextResponse(result.buffer, { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "invoice.pdf.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
