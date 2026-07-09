import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "invoices.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "invoices.permissions.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return null

      const [viewInvoices, addInvoice, editInvoice, editInvoiceStatus, downloadInvoice] =
        await Promise.all([
          hasPermission(client, actor, "view_invoices"),
          hasPermission(client, actor, "add_invoice"),
          hasPermission(client, actor, "edit_invoice"),
          hasPermission(client, actor, "edit_invoice_status"),
          hasPermission(client, actor, "download_invoice"),
        ])

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name
               FROM branches
               WHERE institution_id = $1
               ORDER BY name ASC`,
              [actor.institution_id],
            )
          ).rows
        : []

      return {
        viewInvoices,
        addInvoice,
        editInvoice,
        editInvoiceStatus,
        downloadInvoice,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "invoices.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }
    apiLog("info", "invoices.permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "invoices.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
