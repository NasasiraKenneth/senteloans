import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { generateInvoicePdfBuffer } from "@/lib/invoices/generate-invoice-pdf-buffer"

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

      const generated = await generateInvoicePdfBuffer(client, {
        invoiceId: id,
        institutionId: actor.institution_id,
        branchId: isSuperAdmin ? null : actor.branch_id,
      })
      if (!generated.ok) return { error: "invoice_not_found" as const }

      return {
        invoiceNumber: generated.invoiceNumber,
        buffer: generated.buffer,
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
