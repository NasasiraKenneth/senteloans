import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { generateTransactionPdfBuffer } from "@/lib/transactions/generate-transaction-pdf-buffer"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const asDownload = url.searchParams.get("download") === "1"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId],
      )
      const member = memberRes.rows[0]
      if (!member) return { error: "client_not_found" as const }

      const txCheck = await client.query(
        `SELECT id, transaction_number
         FROM transactions
         WHERE id = $1
           AND member_id = $2
           AND institution_id = $3
         LIMIT 1`,
        [id, member.id, member.institution_id],
      )
      if (!txCheck.rows[0]) return { error: "transaction_not_found" as const }

      const generated = await generateTransactionPdfBuffer(client, {
        transactionId: id,
        institutionId: member.institution_id,
        branchId: null,
      })
      if (!generated.ok) return { error: "transaction_not_found" as const }

      return {
        transactionNumber: generated.transactionNumber,
        buffer: generated.buffer,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status = code === "transaction_not_found" ? 404 : code === "client_not_found" ? 404 : 400
      return NextResponse.json({ error: code }, { status })
    }

    const filename = `${String(result.transactionNumber || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`
    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${filename}"`)
    headers.set("Cache-Control", "no-store")
    return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
