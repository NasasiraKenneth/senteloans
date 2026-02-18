import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextRequest, NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"

function parsePath(pathnameOrUrl: string): { prefix?: string; clientId?: string; docType?: string } {
  try {
    let path = pathnameOrUrl
    try {
      if (/^https?:\/\//i.test(pathnameOrUrl)) {
        path = new URL(pathnameOrUrl).pathname
      }
    } catch {
      // noop
    }
    const clean = path.replace(/^\/+/, "")
    const parts = clean.split("/")
    if (parts.length < 3) return {}
    const [prefix, clientId, file] = parts
    if (prefix !== "client-kyc" && prefix !== "client-kyc-pending") return {}
    const docType = file.split("-")[0]
    return { prefix, clientId, docType }
  } catch {
    return {}
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname: string) => {
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ],
          addRandomSuffix: true,
          // callbackUrl is automatically computed by Vercel in production.
          // In local dev, onUploadCompleted won't fire (Vercel can't reach localhost)
          // so the client-side code handles DB persistence after upload() resolves.
        }
      },
      onUploadCompleted: async ({ blob }: { blob: { url: string; pathname?: string } }) => {
        const pathSource = blob.pathname || blob.url
        const { prefix, clientId, docType } = parsePath(pathSource || "")
        console.log("[vercel_blob] upload completed callback", { url: blob.url, pathname: blob.pathname, prefix, clientId, docType })
        if (!clientId || !docType || !prefix) return

        const columnMap: Record<string, string> = {
          passport_photo: "passport_photo",
          national_id_front: "national_id_front",
          national_id_back: "national_id_back",
        }
        const column = columnMap[docType]
        if (!column) return

        if (prefix === "client-kyc") {
          await runWithoutAuth(async (client) => {
            const res = await client.query(
              `UPDATE senteloans_clients SET ${column} = $1 WHERE id = $2`,
              [blob.url, clientId]
            )
            if (res.rowCount === 0) {
              console.warn("[vercel_blob] no client row updated", { clientId, column })
            }
          })
          console.log("[vercel_blob] updated client document (admin flow)", { clientId, column })
        } else {
          console.log("[vercel_blob] client pending upload received (no DB update here)", { clientId, docType })
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error: any) {
    console.error("[vercel_blob] handleUpload error:", error?.message || error)
    return NextResponse.json({ error: error?.message || "Unknown error." }, { status: 400 })
  }
}
