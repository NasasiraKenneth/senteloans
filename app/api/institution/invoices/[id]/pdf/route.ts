import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { generateInvoicePdfBuffer } from "@/lib/invoices/generate-invoice-pdf-buffer"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

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

      const isSuperAdminActor = isSuperAdmin(actor)
      if (!isSuperAdminActor && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const generated = await generateInvoicePdfBuffer(client, {
        invoiceId: id,
        institutionId: actor.institution_id,
        branchId: isSuperAdminActor ? null : actor.branch_id,
      })
      if (!generated.ok) {
        return { error: generated.error === "invoice_not_found" ? "invoice_not_found" as const : generated.error }
      }
      return {
        ok: true as const,
        buffer: generated.buffer,
        invoiceNumber: generated.invoiceNumber,
      }
    })

    if (!result || !("ok" in result) || !result.ok || !result.buffer) {
      const errorCode = String(("error" in (result || {}) ? (result as { error?: string }).error : "") || "unexpected_error")
      const status =
        errorCode === "invoice_not_found"
          ? 404
          : errorCode.startsWith("missing_permission:") || errorCode === "no_app_user_profile"
            ? 403
            : 400
      apiLog("warn", "invoice.pdf.denied", { method: "GET", apiPath, status, error: errorCode, invoiceId: id })
      return NextResponse.json({ error: errorCode }, { status })
    }

    const filename = `${String(result.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Length": String(result.buffer.length),
    }
    if (asDownload) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`
    } else {
      headers["Content-Disposition"] = `inline; filename="${filename}"`
    }

    apiLog("info", "invoice.pdf.success", { method: "GET", apiPath, status: 200, invoiceId: id })
    return new NextResponse(result.buffer, { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "invoice.pdf.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
